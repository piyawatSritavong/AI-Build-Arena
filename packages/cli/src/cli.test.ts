import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@arena/db";
import { scanMachine } from "./scan";
import { runSuite, summarize } from "./run";
import { classifyFailure } from "./agent";
import { describeRounds, memoryRounds } from "./memory";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Fake credential assembled at runtime so secret scanners do not flag this file.
const FAKE_GH = ["gh", "p_", "fixturefixturefixturefixture1234567890"].join("");

describe("scanMachine (privacy)", () => {
  let home = "";
  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "setuptier-home-"));
    process.env.SETUPTIER_HOME = home;
    await mkdir(join(home, ".claude", "skills", "my-skill"), { recursive: true });
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({
        projects: { "/Users/fixture/client-acme": { mcpServers: { fs: { command: "npx", args: ["@modelcontextprotocol/server-filesystem", "/Users/fixture/client-acme"] } } } },
        mcpServers: { github: { command: "npx", args: ["@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: FAKE_GH } } },
      }),
    );
    await writeFile(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: "node /Users/fixture/hooks/guard.js --strict" }] }] } }),
    );
    await writeFile(join(home, ".claude", "CLAUDE.md"), "TOP SECRET INSTRUCTIONS for client-acme");
  });
  afterAll(async () => {
    delete process.env.SETUPTIER_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("uploads names and findings only", async () => {
    const { payload, found } = await scanMachine();
    const text = JSON.stringify(payload);
    expect(found.map((f) => f.source)).toEqual(["claude-code"]);
    expect(text).not.toMatch(/fixture|client-acme|TOP SECRET|guard\.js --strict|\/Users/);
    expect(text).not.toContain(FAKE_GH);
    expect(payload.gear.map((g) => g.registryId ?? g.name).sort()).toEqual(["PreToolUse: node guard.js", "filesystem", "github", "my-skill"]);
    expect(payload.instructions).toEqual({ user: true, project: false });
    expect(payload.findings.some((f) => f.type === "security-risk" && f.message.includes("GITHUB_TOKEN"))).toBe(true);
  });
});

describe("expired Claude Code sign-in", () => {
  it("stops before starting anything on the server", async () => {
    process.env.SETUPTIER_AGENT_CMD = fileURLToPath(new URL("../test-fixtures/fake-agent.mjs", import.meta.url));
    process.env.FAKE_AGENT_AUTH_EXPIRED = "1";
    try {
      // The URL is unreachable on purpose: reaching the server at all would fail differently.
      const run = runSuite({ url: "http://127.0.0.1:9", token: "aba_x", username: "x" }, { challenges: ["sum-of-evens"], variants: ["full"], runs: 1, mode: "ranked", budgetTokens: 100_000, probe: false }, () => {});
      await expect(run).rejects.toThrow(/sign-in has expired/);
    } finally {
      delete process.env.SETUPTIER_AGENT_CMD;
      delete process.env.FAKE_AGENT_AUTH_EXPIRED;
    }
  });
});

describe("classifyFailure", () => {
  it("tells failures outside the challenge apart", () => {
    expect(classifyFailure("You've hit your session limit · resets 1:50am")).toBe("usage_limit");
    expect(classifyFailure("Claude AI usage limit reached|1759600000")).toBe("usage_limit");
    expect(classifyFailure("You've hit your weekly limit")).toBe("usage_limit");
    expect(classifyFailure("API Error: 429 rate_limit_error")).toBe("rate_limit");
    expect(classifyFailure("API Error", 529)).toBe("rate_limit");
    expect(classifyFailure("Overloaded")).toBe("rate_limit");
    expect(classifyFailure("Failed to authenticate. API Error: 401 OAuth access token has expired.", 401)).toBe("auth");
    expect(classifyFailure("Invalid API key · Please run /login")).toBe("auth");
    expect(classifyFailure("Segmentation fault")).toBe("agent_error");
  });
});

// End-to-end against a running web app: device sign-in → token → whoami → scan upload.
const url = process.env.ARENA_E2E_URL;
describe.skipIf(!url)("CLI device sign-in e2e", () => {
  const db = url ? createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }) : null!;
  let userId = "";
  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  beforeAll(async () => {
    const { data, error } = await db.auth.admin.createUser({ email: `cli-e2e-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: "cli-e2e" } });
    if (error) throw error;
    userId = data.user.id;
  });
  afterAll(async () => {
    if (userId) await db.auth.admin.deleteUser(userId);
  });

  it("signs in once, then uploads a scan", async () => {
    const start = (await (await post("/api/cli/device", { client_name: "e2e box" })).json()) as { device_code: string; user_code: string; verification_uri_complete: string };
    expect(start.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(start.verification_uri_complete).toContain(`/cli?code=${start.user_code}`);

    expect((await post("/api/cli/token", { device_code: start.device_code })).status).toBe(428); // not approved yet

    // The browser approval is a signed-in server action; here we approve the same row directly.
    await db.from("cli_device_codes").update({ user_id: userId, approved_at: new Date().toISOString() }).eq("user_code", start.user_code);
    const ok = await post("/api/cli/token", { device_code: start.device_code });
    expect(ok.status).toBe(200);
    const { token, username } = (await ok.json()) as { token: string; username: string };
    expect(token).toMatch(/^aba_/);
    expect((await post("/api/cli/token", { device_code: start.device_code })).status).toBe(410); // single use

    const who = await fetch(`${url}/api/cli/whoami`, { headers: { Authorization: `Bearer ${token}` } });
    expect(((await who.json()) as { username: string }).username).toBe(username);

    const { data: tok } = await db.from("api_tokens").select("name").eq("user_id", userId).single();
    expect(tok!.name).toBe("CLI · e2e box");

    const scan = await post(
      "/api/cli/scan",
      {
        version: 1,
        cli: "0.1.0",
        sources: ["claude-code"],
        instructions: { user: true, project: false },
        gear: [{ name: "github", kind: "mcp", registryId: "github", category: "git-hosting" }, { name: "evil /Users/x/y", kind: "mcp", registryId: null, category: null }],
        findings: [],
        summary: { total: 2, byKind: { mcp: 2 }, matched: 1, unknown: 1, mcpServers: 2, estToolTokens: 1400, cleanBuild: true },
      },
      token,
    );
    expect(scan.status).toBe(200);
    const { data: rows } = await db.from("loadout_scans").select("source, gear").eq("user_id", userId);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.source).toBe("cli");
    expect(JSON.stringify(rows![0]!.gear)).not.toContain("/Users"); // re-sanitized on the server

    expect((await post("/api/cli/scan", { version: 1 }, "aba_nope")).status).toBe(401);
  });

  it("runs Full and Stock through the local agent and records measured tokens", async () => {
    // Fresh sign-in for this test (single-use device code).
    const start = (await (await post("/api/cli/device", { client_name: "e2e run" })).json()) as { device_code: string; user_code: string };
    await db.from("cli_device_codes").update({ user_id: userId, approved_at: new Date().toISOString() }).eq("user_code", start.user_code);
    const { token } = (await (await post("/api/cli/token", { device_code: start.device_code })).json()) as { token: string };
    await db.from("builds").insert({ user_id: userId, name: "e2e build", base_model: "claude-opus-5-5", client: "claude-code" });

    const log = join(tmpdir(), `fake-agent-${Date.now()}.log`);
    process.env.SETUPTIER_AGENT_CMD = fileURLToPath(new URL("../test-fixtures/fake-agent.mjs", import.meta.url));
    process.env.FAKE_AGENT_LOG = log;
    try {
      const r = await runSuite(
        { url: url!, token, username: "cli-e2e" },
        { challenges: ["sum-of-evens"], variants: ["full", "stock"], runs: 1, mode: "ranked", budgetTokens: 100_000, probe: true },
        () => {},
      );
      expect(r.probe).toEqual({ instructions: false, mcpServers: [], skills: [] });
      expect(r.rows.map((x) => `${x.variant}:${x.correct}`)).toEqual(["full:true", "stock:false"]);
      expect(r.tokens).toBe(1700 * 4); // sign-in ping + probe + 2 runs
      // Paired Lift: Full ≈ 100 over a Stock of 0 → normalized gain ≈ +100, both sides from the CLI = verified.
      expect(r.rows[1]!.challengeLift).toMatchObject({ basis: "own", verified: true });
      expect(r.rows[1]!.challengeLift!.lift).toBeGreaterThan(99);
      expect(summarize(r.rows)).toMatch(/sum-of-evens\s+\d+\.\d\s+0\.0\s+\+(99|100)\.\d ✓/);

      const calls = (await readFile(log, "utf8")).trim().split("\n").map((l) => JSON.parse(l) as string[]);
      const [ping, probe, full, stock] = calls;
      expect(ping).toEqual(expect.arrayContaining(["--model", "haiku", "--strict-mcp-config"]));
      expect(probe).toContain("--strict-mcp-config");
      expect(full).not.toContain("--strict-mcp-config");
      expect(stock).toEqual(expect.arrayContaining(["--strict-mcp-config", "--setting-sources", "project", "--model", "claude-fake-1"]));
      for (const c of calls) expect(c).not.toContain("--dangerously-skip-permissions");

      const { data: rows } = await db
        .from("attempts")
        .select("status, source, tokens_measured, client, model_self_reported, build_variants(kind)")
        .eq("user_id", userId)
        .order("issued_at");
      expect(rows!.map((x) => `${x.build_variants?.kind}/${x.status}/${x.source}/${x.tokens_measured}/${x.client}`)).toEqual([
        "full/passed/cli/1700/claude-code/9.9.9",
        "stock/failed/cli/1700/claude-code/9.9.9",
      ]);

      // Two more Full runs (practice) → 3 runs on the challenge: Reliability = Wilson lower bound of 3/3.
      const more = await runSuite(
        { url: url!, token, username: "cli-e2e" },
        { challenges: ["sum-of-evens"], variants: ["full"], runs: 2, mode: "practice", budgetTokens: 100_000, probe: false },
        () => {},
      );
      expect(summarize([...r.rows, ...more.rows])).toMatch(/3\/3 \(≥44%\)\s+1\.7k/);
      const { data: costs } = await db.from("attempts").select("cost_usd").eq("user_id", userId);
      expect(costs!.map((c) => Number(c.cost_usd))).toEqual([0.01, 0.01, 0.01, 0.01]); // the agent's own figure
      const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
      const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
      expect(card).toMatchObject({ reliability: 43.85, reliability_runs: 3, tokens_per_pass: 1700, tokens_verified: true, cost_per_pass: 0.01, efficiency: null });
    } finally {
      delete process.env.SETUPTIER_AGENT_CMD;
      delete process.env.FAKE_AGENT_LOG;
      await rm(log, { force: true });
    }
  });

  it("abandons instead of failing when the plan's usage runs out, and stops the suite", async () => {
    const start = (await (await post("/api/cli/device", { client_name: "e2e limit" })).json()) as { device_code: string; user_code: string };
    await db.from("cli_device_codes").update({ user_id: userId, approved_at: new Date().toISOString() }).eq("user_code", start.user_code);
    const { token } = (await (await post("/api/cli/token", { device_code: start.device_code })).json()) as { token: string };
    const { data: before } = await db.from("profiles").select("trust_score").eq("id", userId).single();
    const since = new Date().toISOString();
    process.env.SETUPTIER_AGENT_CMD = fileURLToPath(new URL("../test-fixtures/fake-agent.mjs", import.meta.url));
    const lines: string[] = [];
    try {
      process.env.FAKE_AGENT_SESSION_LIMIT = "1"; // the ping passes (it is checked separately), the first challenge run hits the limit
      const r = await runSuite(
        { url: url!, token, username: "cli-e2e" },
        { challenges: ["sum-of-evens", "bracket-balance"], variants: ["stock"], runs: 3, mode: "practice", budgetTokens: 100_000, probe: false },
        (l) => lines.push(l),
      );
      expect(r.rows).toHaveLength(1); // stopped after the first breakdown instead of failing the other 5 runs
      expect(r.rows[0]).toMatchObject({ correct: null, score: null, abandoned: "usage_limit" });
      expect(lines.join("\n")).toMatch(/abandoned \(usage_limit\)[\s\S]*Stopped: your Claude plan's usage limit/);
      expect(summarize(r.rows)).toContain("1 run abandoned");

      const { data: rows } = await db.from("attempts").select("id, status, abandon_reason, flags, score, tokens_measured").eq("user_id", userId).gte("issued_at", since);
      expect(rows).toHaveLength(1);
      expect(rows![0]).toMatchObject({ status: "abandoned", abandon_reason: "usage_limit", flags: [], score: null, tokens_measured: 300 });
      const { data: after } = await db.from("profiles").select("trust_score").eq("id", userId).single();
      expect(after!.trust_score).toBe(before!.trust_score); // no flag, no trust penalty

      // Closed for good: no late submit, no second abandon; a bad reason is refused.
      const id = rows![0]!.id;
      expect((await post(`/api/cli/attempts/${id}/submit`, { answer: "42" }, token)).status).toBe(409);
      expect((await post(`/api/cli/attempts/${id}/abandon`, { reason: "usage_limit" }, token)).status).toBe(409);
      expect((await post(`/api/cli/attempts/${id}/abandon`, { reason: "bored" }, token)).status).toBe(400);
    } finally {
      delete process.env.SETUPTIER_AGENT_CMD;
      delete process.env.FAKE_AGENT_SESSION_LIMIT;
    }
  });

  it("runs Memory Fitness: learn day, exam closed until due, then recall without the facts", async () => {
    const start = (await (await post("/api/cli/device", { client_name: "e2e memory" })).json()) as { device_code: string; user_code: string };
    await db.from("cli_device_codes").update({ user_id: userId, approved_at: new Date().toISOString() }).eq("user_code", start.user_code);
    const { token } = (await (await post("/api/cli/token", { device_code: start.device_code })).json()) as { token: string };
    const creds = { url: url!, token, username: "cli-e2e" };
    const config = await mkdtemp(join(tmpdir(), "setuptier-config-"));
    const memory = await mkdtemp(join(tmpdir(), "fake-memory-"));
    Object.assign(process.env, { SETUPTIER_CONFIG_DIR: config, FAKE_MEMORY_DIR: memory, SETUPTIER_AGENT_CMD: fileURLToPath(new URL("../test-fixtures/fake-agent.mjs", import.meta.url)) });
    const opts = { challenges: ["memory-fitness"], variants: ["full", "stock"] as ("full" | "stock")[], runs: 1, mode: "ranked" as const, budgetTokens: 100_000, probe: false };
    try {
      // Learn day: both read the facts and pass the quiz; only Full keeps them (in its memory, outside the folder).
      const learn = await runSuite(creds, opts, () => {});
      expect(learn.rows.map((r) => `${r.variant}:${r.phase}:${r.correct}`)).toEqual(["full:learn:true", "stock:learn:true"]);
      expect(learn.rows[0]!.examDueAt).toBeTruthy();
      for (const v of ["full", "stock"]) expect(await readdir(join(config, "memory", v))).toEqual([]); // facts deleted
      const rounds = await memoryRounds(creds);
      expect(rounds.map((r) => `${r.variant}:${r.status}`).sort()).toEqual(["full:waiting", "stock:waiting"]);
      expect(describeRounds(rounds)).toContain("exam opens");

      // Exam not open yet.
      const early = await runSuite(creds, opts, () => {});
      expect(early.rows.every((r) => r.error?.includes("Memory exam opens"))).toBe(true);

      // Three days later (moved in the DB): Full recalls everything, Stock nothing → Lift ≈ +100, verified.
      await db.from("memory_enrollments").update({ exam_due_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", userId);
      const exam = await runSuite(creds, opts, () => {});
      expect(exam.rows.map((r) => `${r.variant}:${r.phase}:${r.correct}`)).toEqual(["full:exam:true", "stock:exam:false"]);
      expect(exam.rows[1]!.challengeLift).toMatchObject({ basis: "own", verified: true });
      expect(exam.rows[1]!.challengeLift!.lift).toBeGreaterThan(95);

      const after = await memoryRounds(creds);
      expect(after.map((r) => `${r.variant}:${r.status}:${r.exam_accuracy}`).sort()).toEqual(["full:examined:1", "stock:examined:0"]);
      const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
      const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
      expect(card).toMatchObject({ memory: 100, memory_retention: 100 });
    } finally {
      for (const k of ["SETUPTIER_CONFIG_DIR", "FAKE_MEMORY_DIR", "SETUPTIER_AGENT_CMD"]) delete process.env[k];
      await rm(config, { recursive: true, force: true });
      await rm(memory, { recursive: true, force: true });
    }
  });
});
