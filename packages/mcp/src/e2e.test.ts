// End-to-end: real MCP client -> running web app (/api/mcp) -> local Supabase.
// Run: ARENA_E2E_URL=http://localhost:3000 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=... pnpm --filter @arena/mcp test
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@arena/db";
import { getChallenge } from "@arena/challenges";
import { generateApiToken } from "./token";

const url = process.env.ARENA_E2E_URL;
const db = url ? createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }) : null!;

describe.skipIf(!url)("MCP e2e", () => {
  let userId = "";
  let peerId = "";
  let client: Client;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { ...JSON.parse(r.content[0]!.text), isError: r.isError };
  };

  beforeAll(async () => {
    const { data, error } = await db.auth.admin.createUser({ email: `e2e-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: "e2e-bot" } });
    if (error) throw error;
    userId = data.user.id;
    await db.from("builds").insert({ user_id: userId, name: "e2e build", base_model: "e2e-vanilla" });
    const t = await generateApiToken();
    await db.from("api_tokens").insert({ user_id: userId, token_prefix: t.prefix, token_hash: t.hash });
    client = new Client({ name: "arena-e2e", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${t.raw}` } } }));
  });

  afterAll(async () => {
    await client?.close();
    if (userId) await db.auth.admin.deleteUser(userId);
    if (peerId) await db.auth.admin.deleteUser(peerId);
  });

  it("rejects a bad token", async () => {
    const res = await fetch(`${url}/api/mcp`, { method: "POST", headers: { Authorization: "Bearer aba_nope", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("lists the 4 tools and active challenges", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_challenge", "list_challenges", "my_stats", "submit_answer"]);
    const list = await call("list_challenges");
    const ids = Object.values(list).filter(Boolean).map((c: any) => c.id);
    expect(ids).toHaveLength(15);
    expect(ids).toEqual(expect.arrayContaining(["sum-of-evens", "thai-baht-text", "thai-vat-wht"]));
  });

  it("solves sum-of-evens (no baseline yet), blocks resubmission", async () => {
    const a = await call("get_challenge", { challenge_id: "sum-of-evens" });
    const answer = (a.input.numbers as number[]).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);
    const r = await call("submit_answer", { attempt_id: a.attempt_id, answer: JSON.stringify(answer), model: "e2e", tokens_used: 123 });
    expect(r).toMatchObject({ correct: true, accuracy: 1 });
    expect(r.score).toBeGreaterThan(99);
    expect(r).toMatchObject({ lift: null, challenge_lift: null });
    expect(r.lift_note).toContain("No baseline yet");
    const again = await call("submit_answer", { attempt_id: a.attempt_id, answer: "0" });
    expect(again.isError).toBe(true);
  });

  it("scores Thai baht text with partial credit", async () => {
    const a = await call("get_challenge", { challenge_id: "thai-baht-text" });
    const { data } = await db.from("attempts").select("seed").eq("id", a.attempt_id).single();
    const expected = getChallenge("thai-baht-text")!.generate(data!.seed).expected as string[];
    const r = await call("submit_answer", { attempt_id: a.attempt_id, answer: JSON.stringify(expected.map((e, i) => (i === 0 ? "ผิด" : e))) });
    expect(r).toMatchObject({ correct: false, lift: null });
    expect(r.accuracy).toBeCloseTo(11 / 12, 5);
  });

  it("reports stats", async () => {
    const s = await call("my_stats");
    expect(s).toMatchObject({ total_attempts: 2, passed: 1 });
  });

  it("records Stock and practice runs without touching the leaderboard", async () => {
    const solve = async (variant: string, mode: string, right = true) => {
      const a = await call("get_challenge", { challenge_id: "sum-of-evens", variant, mode });
      expect(a).toMatchObject({ variant, mode });
      const answer = (a.input.numbers as number[]).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);
      return call("submit_answer", { attempt_id: a.attempt_id, answer: JSON.stringify(right ? answer : answer + 1) });
    };
    // Paired Lift: Full ≈ 100 over an own Stock of 0 → normalized gain ≈ +100, self-reported through MCP.
    const stock = await solve("stock", "ranked", false);
    expect(stock).toMatchObject({ correct: false, lift: null, challenge_lift: { basis: "own", verified: false } });
    expect(stock.challenge_lift.lift).toBeGreaterThan(99);
    expect(stock.lift_note).toContain("self-reported");
    const practice = await solve("full", "practice");
    expect(practice.correct).toBe(true);
    expect(practice.lift).toBeGreaterThan(99); // this run vs the own Stock baseline

    const { data: rows } = await db
      .from("attempts")
      .select("mode, source, build_variants(kind)")
      .eq("user_id", userId)
      .eq("challenge_id", "sum-of-evens")
      .order("issued_at");
    expect(rows!.map((r) => `${r.build_variants?.kind}/${r.mode}/${r.source}`)).toEqual(["full/ranked/mcp", "stock/ranked/mcp", "full/practice/mcp"]);

    const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
    const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
    expect((card as { passed: number }).passed).toBe(1); // only the ranked Full pass counts
  });

  it("uses the community Stock median: as a fallback, and as a floor for self-reported Stock", async () => {
    // A peer on the same base model with 5 Stock runs per challenge (MCP, weight 0.5 each): median 50.
    const { data: peer } = await db.auth.admin.createUser({ email: `e2e-peer-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: "e2e-peer" } });
    peerId = peer.user!.id;
    const { data: build } = await db.from("builds").insert({ user_id: peerId, name: "peer build", base_model: "e2e-vanilla" }).select("id").single();
    const { data: stockVariant } = await db.from("build_variants").select("id").eq("build_id", build!.id).eq("kind", "stock").single();
    const now = new Date().toISOString();
    const rows = ["sum-of-evens", "thai-baht-text"].flatMap((challenge_id) =>
      [40, 50, 50, 60, 90].map((score) => ({
        user_id: peerId, build_id: build!.id, variant_id: stockVariant!.id, challenge_id, challenge_version: getChallenge(challenge_id)!.version,
        seed: crypto.randomUUID(), issued_at: now, expires_at: now, submitted_at: now, status: "failed" as const, correct: false, score, source: "mcp" as const,
      })),
    );
    expect((await db.from("attempts").insert(rows)).error).toBeNull();

    const { data: lifts } = await db.rpc("paired_lifts", { p_user: userId });
    const by = Object.fromEntries(lifts!.map((l) => [l.challenge_id, l]));
    // sum-of-evens: own MCP Stock scored 0, but self-reported Stock cannot sit below the community median.
    expect(by["sum-of-evens"]).toMatchObject({ basis: "own", baseline_score: 50, verified: false, weight: 0.5 });
    // thai-baht-text: no Stock run of the user's own → community median of 5 runs.
    expect(by["thai-baht-text"]).toMatchObject({ basis: "community", baseline_score: 50, baseline_runs: 5 });
    expect(Number(by["thai-baht-text"]!.lift)).toBeCloseTo(((Number(by["thai-baht-text"]!.full_score) - 50) / 50) * 100, 1);

    const stats = await call("my_stats");
    expect(stats.challenges["thai-baht-text"].lift).toMatchObject({ basis: "community" });
    const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
    const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
    expect(card).toMatchObject({ lift_challenges: 2, lift_own: 1, lift_verified: 0 });
    const expected = (Number(by["sum-of-evens"]!.lift) + Number(by["thai-baht-text"]!.lift)) / 2; // equal weights
    expect(Number((card as { avg_lift: number }).avg_lift)).toBeCloseTo(expected, 1);
  });

  it("measures Efficiency against the model's community median and Reliability from 3+ runs", async () => {
    // The peer passes sum-of-evens 5 times with 246 tokens each; this user's passes reported 123 → ×2.0 leaner.
    const { data: build } = await db.from("builds").select("id").eq("user_id", peerId).single();
    const { data: fullVariant } = await db.from("build_variants").select("id").eq("build_id", build!.id).eq("kind", "full").single();
    const now = new Date().toISOString();
    const rows = Array.from({ length: 5 }, () => ({
      user_id: peerId, build_id: build!.id, variant_id: fullVariant!.id, challenge_id: "sum-of-evens", challenge_version: getChallenge("sum-of-evens")!.version,
      seed: crypto.randomUUID(), issued_at: now, expires_at: now, submitted_at: now, duration_ms: 4000, status: "passed" as const, correct: true, score: 99, source: "mcp" as const, tokens_self_reported: 246,
    }));
    expect((await db.from("attempts").insert(rows)).error).toBeNull();

    const stats = await call("my_stats");
    expect(stats.efficiency["sum-of-evens"]).toMatchObject({ tokens_per_pass: 123, vs_model_median: 2, tokens_measured: false });
    // 2 Full runs on sum-of-evens so far (ranked + practice): not enough for Reliability.
    expect(stats.reliability.lower_bound_pct).toBeNull();
    const a = await call("get_challenge", { challenge_id: "sum-of-evens", mode: "practice" });
    await call("submit_answer", { attempt_id: a.attempt_id, answer: "-1", tokens_used: 999 }); // a fail
    const after = await call("my_stats");
    expect(after.reliability).toMatchObject({ passes: 2, runs: 3, lower_bound_pct: 20.77 });

    const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
    const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
    expect(card).toMatchObject({ efficiency: 2, efficiency_challenges: 1, tokens_verified: false, cost_per_pass: null, reliability: 20.77 });
  });

  it("caps unfinished attempts at 3 and records events", async () => {
    for (let i = 0; i < 3; i++) expect((await call("get_challenge", { challenge_id: "roman-numerals" })).attempt_id).toBeTruthy();
    const blocked = await call("get_challenge", { challenge_id: "roman-numerals" });
    expect(blocked.isError).toBe(true);
    expect(blocked.error).toContain("unfinished");
    const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("name", "challenge_submitted");
    expect(count).toBe(5);
  });
});
