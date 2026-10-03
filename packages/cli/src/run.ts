import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Json } from "@arena/core";
import { api, ApiError } from "./api";
import { agentLoggedIn, agentVersion, probeStock, runAgent, type StockProbe, type Variant } from "./agent";
import type { Credentials } from "./config";
import { baseUrl } from "./config";

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
  error?: string;
}

export async function listChallenges(creds: Credentials) {
  const r = await api<{ challenges: { id: string }[] }>(baseUrl(creds), "/api/cli/challenges");
  return r.challenges.map((c) => c.id);
}

export async function preflight() {
  const version = await agentVersion();
  if (!version) throw new Error("Claude Code was not found. Install it (https://claude.com/claude-code) or set SETUPTIER_AGENT_CMD.");
  if (!(await agentLoggedIn())) throw new Error("Claude Code is not signed in. Run `claude` once and sign in, then try again.");
  return `claude-code/${version}`;
}

export async function runSuite(creds: Credentials, opts: RunOptions, log: (line: string) => void): Promise<{ rows: RunRow[]; probe: StockProbe | null; tokens: number }> {
  const base = baseUrl(creds);
  const client = await preflight();
  const rows: RunRow[] = [];
  let spent = 0;
  let model = opts.model;

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

        const dir = await mkdtemp(join(tmpdir(), "setuptier-run-"));
        try {
          await writeFile(join(dir, "TASK.md"), `# ${started.title}\n\n${started.instructions}\n`);
          await writeFile(join(dir, "input.json"), JSON.stringify(started.input));
          log(`${challenge} [${variant}] running…`);
          // Stop the agent a little before the server-side time limit so the submission still counts.
          const a = await runAgent({ variant, model, cwd: dir, prompt: PROMPT, timeoutMs: Math.max(30, started.time_limit_seconds - 15) * 1000 });
          spent += a.tokens;
          if (!model && a.model) model = a.model; // Stock must use the same model as Full
          // Always submit (an empty answer fails) so no attempt is left open and blocking.
          const s = await api<Submitted>(base, `/api/cli/attempts/${started.attempt_id}/submit`, {
            token: creds.token,
            body: { answer: a.answer ?? "", tokens: a.tokens, model: a.model ?? model, client },
          });
          rows.push({ challenge, variant, correct: s.correct, score: s.score, tokens: a.tokens, seconds: Math.round(a.durationMs / 1000), challengeLift: s.challenge_lift, error: a.error });
          log(`${challenge} [${variant}] ${s.correct ? "✓" : "✗"} score ${s.score} · ${a.tokens.toLocaleString("en-US")} tokens${a.error ? ` · ${a.error}` : ""}`);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
    }
  }
  return { rows, probe, tokens: spent };
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

/**
 * Full vs Stock per challenge (mean of this session's runs) and the server's Lift: normalized gain of all ranked
 * Full runs over the baseline, −100…+100. ✓ = both sides measured by the CLI; "community" = no Stock run of yours yet.
 */
export function summarize(rows: RunRow[]) {
  const by = new Map<string, { full: number[]; stock: number[]; lift: ChallengeLift | null }>();
  for (const r of rows) {
    const e = by.get(r.challenge) ?? { full: [], stock: [], lift: null };
    if (r.score !== null) e[r.variant].push(r.score);
    if (r.challengeLift !== undefined) e.lift = r.challengeLift; // latest server value wins
    by.set(r.challenge, e);
  }
  const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
  const lines = ["", "Challenge             Full    Stock   Lift"];
  for (const [c, e] of by) {
    const lift = e.lift ? `${signed(e.lift.lift)} ${e.lift.basis === "community" ? "(community)" : e.lift.verified ? "✓" : "(self-reported)"}` : "—";
    lines.push(`${c.padEnd(20)} ${mean(e.full).padStart(6)} ${mean(e.stock).padStart(7)}   ${lift}`);
  }
  lines.push("", "Lift = normalized gain of your ranked Full runs over Stock (−100…+100). Practice runs do not change it.");
  return lines.join("\n");
}
