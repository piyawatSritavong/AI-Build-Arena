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
  /** Set when the run failed for a reason outside the challenge: the attempt is abandoned, not failed. */
  failure?: AgentFailure;
}

/** Why an agent run broke down (the server's abandon reasons). Anything but "timeout" stops the whole suite. */
export type AgentFailure = "usage_limit" | "rate_limit" | "auth" | "agent_error" | "timeout";

/** Reads Claude Code's error text / API status. Unknown errors are "agent_error" (also a stop: better safe). */
export function classifyFailure(text: string, apiStatus?: number): Exclude<AgentFailure, "timeout"> {
  if (apiStatus === 401 || /OAuth|authenticat|\/login|not logged in|log ?in again/i.test(text)) return "auth";
  // Claude plan limits: "You've hit your session limit · resets 1:50am", "Claude AI usage limit reached", weekly limit.
  if (/(session|usage|weekly|daily|monthly) limit|hit your limit|limit reached|out of (extra )?usage|credit balance/i.test(text)) return "usage_limit";
  if (apiStatus === 429 || apiStatus === 529 || /rate.?limit|too many requests|overloaded|\b(429|529)\b/i.test(text)) return "rate_limit";
  return "agent_error";
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
  api_error_status?: number;
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

export function parseAgentJson(stdout: string): Omit<AgentResult, "answer" | "durationMs"> & { apiErrorStatus?: number } {
  let j: ClaudeJson = {};
  try {
    j = JSON.parse(stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}") as ClaudeJson;
  } catch {
    return { tokens: 0, model: null, costUsd: null, turns: 0, error: "Agent output was not JSON.", failure: "agent_error" };
  }
  const u = j.usage ?? {};
  const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const model = Object.entries(j.modelUsage ?? {}).sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? null;
  const error = j.is_error ? (j.result ?? "Agent reported an error.").slice(0, 300) : undefined;
  return { tokens, model, costUsd: j.total_cost_usd ?? null, turns: j.num_turns ?? 0, error, failure: error ? classifyFailure(error, j.api_error_status) : undefined, apiErrorStatus: j.api_error_status };
}

export async function runAgent(opts: { variant: Variant; model?: string; cwd: string; prompt: string; timeoutMs: number }): Promise<AgentResult> {
  const started = Date.now();
  const r = await exec(agentArgs(opts.variant, opts.model), opts.prompt, opts.cwd, opts.timeoutMs);
  const { apiErrorStatus, ...parsed } = parseAgentJson(r.stdout);
  let answer: string | null = null;
  try {
    answer = (await readFile(join(opts.cwd, "answer.json"), "utf8")).trim();
  } catch {
    // no answer written
  }
  if (r.timedOut) return { ...parsed, answer, durationMs: Date.now() - started, error: "Timed out.", failure: "timeout" };
  if (r.code !== 0 && !parsed.error) {
    const error = (r.stderr.trim() || `Agent exited with code ${r.code}.`).slice(0, 300);
    return { ...parsed, answer, durationMs: Date.now() - started, error, failure: classifyFailure(`${error} ${r.stdout}`, apiErrorStatus) };
  }
  return { ...parsed, answer, durationMs: Date.now() - started };
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

/** `claude auth status` can say "logged in" while the OAuth token has expired; only a real call tells. */
export class AgentAuthError extends Error {}

/** One tiny real call (Haiku, no MCP) before any challenge starts, so a dead sign-in fails nothing on the server. */
export async function pingAgent(cwd: string): Promise<{ tokens: number }> {
  const r = await exec(agentArgs("stock", "haiku"), "SETUPTIER PING. Reply with exactly: OK", cwd, 120_000);
  let j: ClaudeJson = {};
  try {
    j = JSON.parse(r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}") as ClaudeJson;
  } catch {
    // not JSON: judged below
  }
  const text = `${j.result ?? ""} ${r.stderr}`;
  const failure = j.is_error || r.code !== 0 ? classifyFailure(text, j.api_error_status) : null;
  if (failure === "auth") {
    throw new AgentAuthError(
      "Claude Code's sign-in has expired. Run `claude` in a terminal and type /login (Claude Desktop's own sign-in does not carry over), then try again. Nothing was started.",
    );
  }
  if (failure === "usage_limit" || failure === "rate_limit") {
    throw new Error(`Claude Code cannot run right now (${failure === "usage_limit" ? "plan usage limit" : "rate limit"}): ${(j.result ?? r.stderr).trim().slice(0, 200)}. Try again once it resets. Nothing was started.`);
  }
  if (r.code !== 0 && !r.stdout.trim()) throw new Error(`Claude Code did not start: ${(r.stderr.trim() || `exit code ${r.code}`).slice(0, 300)}`);
  return { tokens: parseAgentJson(r.stdout).tokens };
}

// Subagent types every Claude Code has: part of the stock client, not the user's add-ons.
const BUILT_IN_AGENTS = new Set(["explore", "general-purpose", "plan", "statusline-setup", "claude-code-guide", "output-style-setup", "fork"]);

export interface StockProbe {
  instructions: boolean;
  mcpServers: string[];
  skills: string[];
}

/** Asks the Stock agent what it can still see, so the result can be labelled honestly. */
export async function probeStock(cwd: string): Promise<{ probe: StockProbe | null; tokens: number }> {
  const prompt =
    'SETUPTIER PROBE. Do not use any tools. Reply with one JSON object only: {"instructions": true if your context contains user or project instructions from a CLAUDE.md or memory file else false, "mcp_servers": [names of MCP servers whose tools you have], "skills": [names of user-installed skills you can load with the Skill tool; NOT built-in subagent types such as Explore or Plan]}';
  const r = await exec(agentArgs("stock", "haiku"), prompt, cwd, 120_000);
  const { tokens } = parseAgentJson(r.stdout);
  try {
    const out = JSON.parse(r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}") as { result?: string };
    const j = JSON.parse((out.result ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "") as { instructions?: unknown; mcp_servers?: unknown; skills?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);
    return { probe: { instructions: j.instructions === true, mcpServers: list(j.mcp_servers), skills: list(j.skills).filter((s) => !BUILT_IN_AGENTS.has(s.toLowerCase())) }, tokens };
  } catch {
    return { probe: null, tokens };
  }
}
