import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Runs the user's own agent headless (Claude Code for now) in a scratch directory.
// Full = the user's normal setup. Stock = the same client without the user's MCP servers, settings
// (hooks, plugins, permissions) or skills. Never uses --dangerously-skip-permissions.

export type Variant = "full" | "stock";

export interface AgentResult {
  answer: string | null;
  tokens: number; // input + output + cache, as reported by the agent
  model: string | null;
  costUsd: number | null;
  turns: number;
  durationMs: number;
  error?: string;
}

const agentCmd = () => process.env.SETUPTIER_AGENT_CMD ?? "claude";

// Enough to write and run small programs in the scratch dir; the same for both variants (fair comparison).
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash(node *)", "Bash(python3 *)", "Bash(python *)", "Bash(ls *)", "Bash(cat *)"];

export function agentArgs(variant: Variant, model?: string): string[] {
  const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "acceptEdits"];
  if (model) args.push("--model", model);
  if (variant === "stock") {
    args.push(
      "--setting-sources", "project", // the scratch dir has no project settings: user hooks, plugins and permissions are skipped
      "--strict-mcp-config", // no --mcp-config given: zero MCP servers
      "--disallowedTools", "Skill",
    );
  }
  // Variadic flag last; the prompt goes through stdin so it cannot be swallowed by it.
  args.push("--allowedTools", ...ALLOWED_TOOLS);
  return args;
}

interface ClaudeJson {
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  modelUsage?: Record<string, { outputTokens?: number }>;
}

function exec(args: string[], prompt: string, cwd: string, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    const child = spawn(agentCmd(), args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: String(e), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.end(prompt);
  });
}

export function parseAgentJson(stdout: string): Omit<AgentResult, "answer" | "durationMs"> {
  let j: ClaudeJson = {};
  try {
    j = JSON.parse(stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}") as ClaudeJson;
  } catch {
    return { tokens: 0, model: null, costUsd: null, turns: 0, error: "Agent output was not JSON." };
  }
  const u = j.usage ?? {};
  const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const model = Object.entries(j.modelUsage ?? {}).sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? null;
  return { tokens, model, costUsd: j.total_cost_usd ?? null, turns: j.num_turns ?? 0, error: j.is_error ? (j.result ?? "Agent reported an error.").slice(0, 300) : undefined };
}

export async function runAgent(opts: { variant: Variant; model?: string; cwd: string; prompt: string; timeoutMs: number }): Promise<AgentResult> {
  const started = Date.now();
  const r = await exec(agentArgs(opts.variant, opts.model), opts.prompt, opts.cwd, opts.timeoutMs);
  const parsed = parseAgentJson(r.stdout);
  let answer: string | null = null;
  try {
    answer = (await readFile(join(opts.cwd, "answer.json"), "utf8")).trim();
  } catch {
    // no answer written
  }
  const error = r.timedOut ? "Timed out." : r.code !== 0 && !parsed.error ? (r.stderr.trim() || `Agent exited with code ${r.code}.`).slice(0, 300) : parsed.error;
  return { ...parsed, answer, durationMs: Date.now() - started, error };
}

export async function agentVersion(): Promise<string | null> {
  const r = await exec(["--version"], "", process.cwd(), 15_000);
  return r.code === 0 ? (r.stdout.trim().split(/\s/)[0] ?? null) : null;
}

/** Claude Code login check without spending tokens (`claude auth status`). */
export async function agentLoggedIn(): Promise<boolean> {
  if (process.env.SETUPTIER_AGENT_CMD) return true; // custom agent: caller's responsibility
  const r = await exec(["auth", "status"], "", process.cwd(), 15_000);
  try {
    return Boolean((JSON.parse(r.stdout) as { loggedIn?: boolean }).loggedIn);
  } catch {
    return false;
  }
}

export interface StockProbe {
  instructions: boolean;
  mcpServers: string[];
  skills: string[];
}

/** Asks the Stock agent what it can still see, so the result can be labelled honestly. */
export async function probeStock(cwd: string): Promise<{ probe: StockProbe | null; tokens: number }> {
  const prompt =
    'SETUPTIER PROBE. Do not use any tools. Reply with one JSON object only: {"instructions": true if your context contains user or project instructions from a CLAUDE.md or memory file else false, "mcp_servers": [names of MCP servers whose tools you have], "skills": [names of skills available to you]}';
  const r = await exec(agentArgs("stock", "haiku"), prompt, cwd, 120_000);
  const { tokens } = parseAgentJson(r.stdout);
  try {
    const out = JSON.parse(r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}") as { result?: string };
    const j = JSON.parse((out.result ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "") as { instructions?: unknown; mcp_servers?: unknown; skills?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);
    return { probe: { instructions: j.instructions === true, mcpServers: list(j.mcp_servers), skills: list(j.skills) }, tokens };
  } catch {
    return { probe: null, tokens };
  }
}
