import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wilsonLower, type Json } from "@arena/core";
import { api, ApiError } from "./api";
import { agentLoggedIn, agentVersion, pingAgent, probeStock, runAgent, type StockProbe, type Variant } from "./agent";
import type { Credentials } from "./config";
import { baseUrl } from "./config";
import { emptyDir, MEMORY_CHALLENGE, memoryWorkspace } from "./memory";

/** Short health check: easy, fast challenges. `--all` runs every active challenge. */
export const QUICK_SET = ["sum-of-evens", "bracket-balance", "roman-numerals"];

const PROMPT =
  "You are taking a SetupTier challenge. TASK.md has the instructions and input.json has the input, both in the current directory. " +
  "Solve it; write and run code if that helps. Write ONLY the final answer to answer.json, encoded exactly as TASK.md specifies. Do not ask questions.";

interface Started {
  attempt_id: string;
  title: string;
  instructions: string;
  input: Json;
  time_limit_seconds: number;
  phase?: "learn" | "exam";
}
interface ChallengeLift {
  lift: number;
  basis: "own" | "community";
  verified: boolean;
}
interface Submitted {
  correct: boolean;
  score: number;
  lift: number | null;
  challenge_lift: ChallengeLift | null;
  exam_due_at?: string;
}

export interface RunOptions {
  challenges: string[];
  variants: Variant[];
  runs: number;
  mode: "ranked" | "practice";
  model?: string;
  budgetTokens: number;
  probe: boolean;
}

export interface RunRow {
  challenge: string;
  variant: Variant;
  correct: boolean | null;
  score: number | null;
  tokens: number;
  seconds: number;
  challengeLift?: ChallengeLift | null; // the server's Paired Lift for the challenge after this run
  phase?: "learn" | "exam"; // Memory Fitness
  examDueAt?: string;
  error?: string;
}

// Claude Desktop alone is not enough: its built-in Claude Code only runs inside the app.
const INSTALL_HINT = [
  "Claude Code (the terminal version) was not found. `setuptier run` drives it to solve challenges on your machine.",
  "Claude Desktop alone is not enough: its built-in Claude Code only runs inside the app.",
  "Install it (same Claude account, no extra cost on Pro/Max):  curl -fsSL https://claude.ai/install.sh | bash",
  "then run `claude` once to sign in. Or connect Claude Desktop through MCP instead (Duo division): https://setuptier.com/me",
].join("\n");

export async function listChallenges(creds: Credentials) {
  const r = await api<{ challenges: { id: string; category: string }[] }>(baseUrl(creds), "/api/cli/challenges");
  return r.challenges.filter((c) => c.category !== "memory").map((c) => c.id); // Memory Fitness has its own command
}

export async function preflight() {
  const version = await agentVersion();
  if (!version) throw new Error(INSTALL_HINT);
  if (!(await agentLoggedIn())) throw new Error("Claude Code is not signed in. Run `claude` in a terminal and sign in with your Claude account, then try again.");
  return `claude-code/${version}`;
}

export async function runSuite(creds: Credentials, opts: RunOptions, log: (line: string) => void): Promise<{ rows: RunRow[]; probe: StockProbe | null; tokens: number }> {
  const base = baseUrl(creds);
  const client = await preflight();
  const rows: RunRow[] = [];
  let spent = 0;
  let model = opts.model;

  // A real call first: an expired sign-in must stop us before any attempt starts (and would count as a fail).
  const pingDir = await mkdtemp(join(tmpdir(), "setuptier-ping-"));
  spent += (await pingAgent(pingDir).finally(() => rm(pingDir, { recursive: true, force: true }))).tokens;

  let probe: StockProbe | null = null;
  if (opts.probe && opts.variants.includes("stock")) {
    const dir = await mkdtemp(join(tmpdir(), "setuptier-probe-"));
    const checked = await probeStock(dir).finally(() => rm(dir, { recursive: true, force: true }));
    probe = checked.probe;
    spent += checked.tokens; // the check runs on the user's agent too, so it counts
    if (probe) {
      const leaks = [probe.instructions && "custom instructions (CLAUDE.md)", probe.mcpServers.length && `MCP: ${probe.mcpServers.join(", ")}`, probe.skills.length && `skills: ${probe.skills.join(", ")}`].filter(Boolean);
      log(leaks.length ? `⚠ Stock is not fully bare on this machine: still sees ${leaks.join("; ")}. Your Lift may be understated.` : "✓ Stock check: no custom instructions, MCP servers or skills visible.");
    } else log("Stock check skipped: the agent did not answer the probe.");
  }

  outer: for (const challenge of opts.challenges) {
    for (let run = 0; run < opts.runs; run++) {
      for (const variant of opts.variants) {
        if (spent >= opts.budgetTokens) {
          log(`Token budget reached (${spent.toLocaleString("en-US")} / ${opts.budgetTokens.toLocaleString("en-US")}). Stopping.`);
          break outer;
        }
        let started: Started;
        try {
          started = await api<Started>(base, "/api/cli/attempts", { token: creds.token, body: { challenge_id: challenge, variant, mode: opts.mode } });
        } catch (e) {
          const message = e instanceof ApiError ? (e.message ?? e.code) : String(e);
          rows.push({ challenge, variant, correct: null, score: null, tokens: 0, seconds: 0, error: message });
          log(`${challenge} [${variant}] could not start: ${message}`);
          if (e instanceof ApiError && /per hour/.test(message)) break outer;
          continue;
        }

        // Memory Fitness keeps a fixed folder per variant (memory keyed by project survives); others get a fresh temp dir.
        const isMemory = challenge === MEMORY_CHALLENGE;
        const dir = isMemory ? await memoryWorkspace(variant) : await mkdtemp(join(tmpdir(), "setuptier-run-"));
        const label = `${challenge}${started.phase ? ` (${started.phase})` : ""} [${variant}]`;
        try {
          if (isMemory) await emptyDir(dir);
          await writeFile(join(dir, "TASK.md"), `# ${started.title}\n\n${started.instructions}\n`);
          await writeFile(join(dir, "input.json"), JSON.stringify(started.input));
          log(`${label} running…`);
          // Stop the agent a little before the server-side time limit so the submission still counts.
          const a = await runAgent({ variant, model, cwd: dir, prompt: PROMPT, timeoutMs: Math.max(30, started.time_limit_seconds - 15) * 1000 });
          spent += a.tokens;
          if (!model && a.model) model = a.model; // Stock must use the same model as Full
          // Always submit (an empty answer fails) so no attempt is left open and blocking.
          const s = await api<Submitted>(base, `/api/cli/attempts/${started.attempt_id}/submit`, {
            token: creds.token,
            body: { answer: a.answer ?? "", tokens: a.tokens, cost_usd: a.costUsd ?? undefined, model: a.model ?? model, client },
          });
          rows.push({ challenge, variant, correct: s.correct, score: s.score, tokens: a.tokens, seconds: Math.round(a.durationMs / 1000), challengeLift: s.challenge_lift, phase: started.phase, examDueAt: s.exam_due_at, error: a.error });
          log(`${label} ${s.correct ? "✓" : "✗"} score ${s.score} · ${a.tokens.toLocaleString("en-US")} tokens${a.error ? ` · ${a.error}` : ""}`);
        } finally {
          // Memory: the facts must not stay on disk for the exam.
          await (isMemory ? emptyDir(dir) : rm(dir, { recursive: true, force: true }));
        }
      }
    }
  }
  return { rows, probe, tokens: spent };
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/**
 * Per challenge: Full vs Stock (mean of this session's runs), the server's Lift (normalized gain of all ranked
 * Full runs over the baseline, −100…+100; ✓ = both sides measured by the CLI, "community" = no Stock run of
 * yours yet), Full passes (with the Wilson lower bound once a challenge ran ≥ 3 times) and tokens per Full pass.
 */
export function summarize(rows: RunRow[]) {
  type Agg = { full: number[]; stock: number[]; passes: number; runs: number; passTokens: number[]; lift: ChallengeLift | null };
  const by = new Map<string, Agg>();
  for (const r of rows) {
    const key = r.phase === "learn" ? `${r.challenge} (learn)` : r.challenge;
    const e = by.get(key) ?? { full: [], stock: [], passes: 0, runs: 0, passTokens: [], lift: null };
    if (r.score !== null) e[r.variant].push(r.score);
    if (r.variant === "full" && r.correct !== null) {
      e.runs++;
      if (r.correct) {
        e.passes++;
        e.passTokens.push(r.tokens);
      }
    }
    if (r.challengeLift !== undefined) e.lift = r.challengeLift; // latest server value wins
    by.set(key, e);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const lines = ["", "Challenge             Full    Stock   Lift                 Full passes      Tokens/pass"];
  for (const [c, e] of by) {
    const lift = e.lift ? `${signed(e.lift.lift)} ${e.lift.basis === "community" ? "(community)" : e.lift.verified ? "✓" : "(self-reported)"}` : "—";
    const rel = e.runs >= 3 ? ` (≥${Math.round(wilsonLower(e.passes, e.runs) ?? 0)}%)` : "";
    const tok = mean(e.passTokens);
    lines.push(
      `${c.padEnd(20)} ${(mean(e.full)?.toFixed(1) ?? "—").padStart(6)} ${(mean(e.stock)?.toFixed(1) ?? "—").padStart(7)}   ${lift.padEnd(20)} ${`${e.passes}/${e.runs}${rel}`.padEnd(16)} ${tok === null ? "—" : kTokens(tok)}`,
    );
  }
  lines.push(
    "",
    "Lift = normalized gain of your ranked Full runs over Stock (−100…+100). Practice runs do not change it.",
    "Reliability needs ≥ 3 runs of a challenge (--runs 3); ≥N% is the 95% lower bound of your pass rate.",
  );
  return lines.join("\n");
}
