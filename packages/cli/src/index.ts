import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { api, ApiError } from "./api";
import { baseUrl, clearCredentials, loadCredentials } from "./config";
import { login } from "./login";
import { describePayload, scanMachine } from "./scan";
import { listChallenges, QUICK_SET, runSuite, summarize } from "./run";
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
      --budget <tokens>            Stop starting runs past this many tokens (default 300000)
      --no-probe                   Skip the Stock check (what a "bare" run can still see)
      -y, --yes                    Start without asking
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
      budget: { type: "string", default: "300000" },
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
      const challenges = values.all ? await listChallenges(creds) : values.challenges ? values.challenges.split(",").map((c) => c.trim()).filter(Boolean) : QUICK_SET;
      const variants = values.variant === "full" ? (["full"] as const) : values.variant === "stock" ? (["stock"] as const) : (["full", "stock"] as const);
      const runs = Math.min(Math.max(Number(values.runs) || 1, 1), 5);
      const budgetTokens = Math.max(Number(values.budget) || 300_000, 10_000);
      const total = challenges.length * variants.length * runs;
      console.log(
        `Plan: ${total} agent runs (${challenges.length} challenges × ${variants.join(" + ")} × ${runs}) in ${values.practice ? "practice" : "ranked"} mode.\n` +
          `Each run uses your own Claude Code (your subscription or API key) in a temporary folder. Budget: ${budgetTokens.toLocaleString("en-US")} tokens.`,
      );
      if (!values.yes && !(await confirm("Start?"))) return console.log("Cancelled.");
      const r = await runSuite(creds, { challenges, variants: [...variants], runs, mode: values.practice ? "practice" : "ranked", model: values.model, budgetTokens, probe: !values["no-probe"] }, (l) => console.log(l));
      console.log(summarize(r.rows));
      return console.log(`\nTokens used: ${r.tokens.toLocaleString("en-US")}. Results: ${baseUrl(creds)}/me`);
    }

    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  if (e instanceof ApiError && e.status === 401) console.error("Your token is invalid or revoked. Run `setuptier login` again.");
  else console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
