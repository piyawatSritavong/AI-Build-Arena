import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { api, ApiError } from "./api";
import { baseUrl, clearCredentials, loadCredentials } from "./config";
import { login } from "./login";
import { describePayload, scanMachine } from "./scan";
import { describeRounds, isDue, MEMORY_CHALLENGE, memoryReminder, memoryRounds } from "./memory";
import { DEFAULT_BUDGET, listChallenges, QUICK_SET, runSuite, summarize } from "./run";
import { VERSION } from "./version";

const HELP = `setuptier ${VERSION}: measure what your AI setup adds.

Usage:
  setuptier login [--no-browser]   Sign in with your SetupTier account (opens the browser)
  setuptier whoami                 Show the signed-in account
  setuptier scan [options]         Scan this computer's AI tools and upload names + findings
      --project <dir>              Also scan a project's .mcp.json / .claude
      --dry-run                    Show what would be uploaded, upload nothing
      --json                       Print the upload payload as JSON (with --dry-run)
      -y, --yes                    Upload without asking
  setuptier run [options]          Let your AI (Claude Code) solve challenges: Full setup vs Stock client
      --challenges <a,b>           Challenge ids (default: a quick 3-challenge health check)
      --all                        Every active challenge
      --variant <full|stock|both>  Default both (Full − Stock = your Lift)
      --runs <n>                   Repeats per challenge (default 1; repeats measure Reliability)
      --practice                   Practice mode: does not touch your leaderboard rank
      --model <name>               Model for both variants (default: your Claude Code default)
      --budget <tokens>            Stop starting runs past this many tokens (default 1500000; counts include cached context)
      --no-probe                   Skip the Stock check (what a "bare" run can still see)
      -y, --yes                    Start without asking
  setuptier memory [start|exam]    Memory Fitness: can your setup remember across sessions?
      (no argument)                Show your rounds and when the exam opens
      start                        Learn day: your AI gets 12 project facts to keep in its memory + a quiz
      exam                         3 days later, in a new session without the facts: recall them
      (--variant, --model, --practice, --no-probe, -y work as for run; default Full + Stock)
  setuptier logout                 Forget the saved token on this computer

What a scan sends: tool names, kinds and findings. Never commands, arguments, URLs,
file paths, secret values or the content of CLAUDE.md / AGENTS.md.
Docs: https://setuptier.com`;

async function confirm(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

async function requireLogin() {
  const creds = await loadCredentials();
  if (!creds) throw new Error("Not signed in. Run `setuptier login` first.");
  return creds;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "no-browser": { type: "boolean", default: false },
      project: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      challenges: { type: "string" },
      all: { type: "boolean", default: false },
      variant: { type: "string", default: "both" },
      runs: { type: "string", default: "1" },
      practice: { type: "boolean", default: false },
      model: { type: "string" },
      budget: { type: "string", default: String(DEFAULT_BUDGET) },
      "no-probe": { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const command = positionals[0];
  if (values.version) return console.log(VERSION);
  if (values.help || !command || command === "help") return console.log(HELP);

  switch (command) {
    case "login":
      return login({ browser: !values["no-browser"] });

    case "logout":
      await clearCredentials();
      return console.log("Signed out on this computer. Revoke the token at setuptier.com/me to disable it everywhere.");

    case "whoami": {
      const creds = await requireLogin();
      await remind(creds);
      const me = await api<{ username: string }>(baseUrl(creds), "/api/cli/whoami", { token: creds.token });
      return console.log(`@${me.username} (${baseUrl(creds)})`);
    }

    case "scan": {
      const { payload, found } = await scanMachine({ project: values.project });
      if (values["dry-run"] && values.json) return console.log(JSON.stringify(payload, null, 2));
      console.log(found.length ? `Found: ${found.map((f) => `${f.source} (${f.items} items)`).join(", ")}` : "No AI client configs found on this computer.");
      console.log(`\nThis is everything that would be uploaded:\n\n${describePayload(payload)}\n`);
      if (values["dry-run"]) return console.log("Dry run: nothing uploaded.");
      const creds = await requireLogin();
      if (!values.yes && !(await confirm(`Upload this to ${baseUrl(creds)} as @${creds.username}?`))) return console.log("Cancelled: nothing uploaded.");
      const r = await api<{ items: number; findings: number; report_url: string }>(baseUrl(creds), "/api/cli/scan", { token: creds.token, body: payload });
      return console.log(`✓ Uploaded ${r.items} items and ${r.findings} findings. See ${r.report_url}`);
    }

    case "run": {
      const creds = await requireLogin();
      await remind(creds);
      const challenges = values.all ? await listChallenges(creds) : values.challenges ? values.challenges.split(",").map((c) => c.trim()).filter(Boolean) : QUICK_SET;
      const variants = values.variant === "full" ? (["full"] as const) : values.variant === "stock" ? (["stock"] as const) : (["full", "stock"] as const);
      const runs = Math.min(Math.max(Number(values.runs) || 1, 1), 5);
      const budgetTokens = Math.max(Number(values.budget) || DEFAULT_BUDGET, 10_000);
      const total = challenges.length * variants.length * runs;
      console.log(
        `Plan: ${total} agent runs (${challenges.length} challenges × ${variants.join(" + ")} × ${runs}) in ${values.practice ? "practice" : "ranked"} mode.\n` +
          `Each run uses your own Claude Code (your subscription or API key) in a temporary folder. Budget: ${budgetTokens.toLocaleString("en-US")} tokens.`,
      );
      if (!values.yes && !(await confirm("Start?"))) return console.log("Cancelled.");
      const r = await runSuite(creds, { challenges, variants: [...variants], runs, mode: values.practice ? "practice" : "ranked", model: values.model, budgetTokens, probe: !values["no-probe"] }, (l) => console.log(l));
      console.log(summarize(r.rows));
      if (r.model) console.log(`\nModel: ${r.model} (Stock ran on the same model).`);
      return console.log(`Tokens used: ${r.tokens.toLocaleString("en-US")} (most of it cached context). Results: ${baseUrl(creds)}/me`);
    }

    case "memory": {
      const creds = await requireLogin();
      const sub = positionals[1] ?? "status";
      const rounds = await memoryRounds(creds);
      console.log(describeRounds(rounds));
      if (sub === "status") return;
      if (sub !== "start" && sub !== "exam") throw new Error(`Unknown memory step "${sub}". Use start or exam.`);
      const wanted: ("full" | "stock")[] = values.variant === "full" ? ["full"] : values.variant === "stock" ? ["stock"] : ["full", "stock"];
      const round = (v: string) => rounds.find((r) => r.variant === v);
      const variants = wanted.filter((v) => {
        const r = round(v);
        return sub === "start" ? !r || r.status === "learning" || r.status === "examined" || r.status === "expired" : !!r && isDue(r);
      });
      if (!variants.length) {
        return console.log(sub === "start" ? "\nNothing to start: a round is already waiting for its exam." : "\nNo exam is open yet.");
      }
      console.log(
        `\n${sub === "start" ? "Learn day" : "Exam"}: ${variants.join(" + ")} with your own Claude Code in a fixed folder (${variants.length} run${variants.length > 1 ? "s" : ""}).` +
          (sub === "start" ? " Its files are deleted afterwards: only your setup's memory can carry the facts to the exam." : ""),
      );
      if (!values.yes && !(await confirm("Start?"))) return console.log("Cancelled.");
      const budgetTokens = Math.max(Number(values.budget) || DEFAULT_BUDGET, 10_000);
      const r = await runSuite(
        creds,
        { challenges: [MEMORY_CHALLENGE], variants, runs: 1, mode: values.practice ? "practice" : "ranked", model: values.model, budgetTokens, probe: sub === "start" && !values["no-probe"] },
        (l) => console.log(l),
      );
      console.log(summarize(r.rows));
      const due = r.rows.find((x) => x.examDueAt)?.examDueAt;
      if (due) console.log(`\nExam opens ${new Date(due).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Run \`setuptier memory exam\` then (any SetupTier command will remind you).`);
      return console.log(`Tokens used: ${r.tokens.toLocaleString("en-US")}. Results: ${baseUrl(creds)}/me`);
    }

    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

async function remind(creds: Awaited<ReturnType<typeof requireLogin>>) {
  const line = await memoryReminder(creds);
  if (line) console.log(`${line}\n`);
}

main().catch((e: unknown) => {
  if (e instanceof ApiError && e.status === 401) console.error("Your token is invalid or revoked. Run `setuptier login` again.");
  else console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
