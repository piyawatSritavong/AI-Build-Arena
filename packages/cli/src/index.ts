import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { api, ApiError } from "./api";
import { baseUrl, clearCredentials, loadCredentials } from "./config";
import { login } from "./login";
import { describePayload, scanMachine } from "./scan";
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
