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
  const linkIds: string[] = [];
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
    for (const id of linkIds) await db.auth.admin.deleteUser(id);
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
    expect(ids).toHaveLength(16);
    expect(ids).toEqual(expect.arrayContaining(["sum-of-evens", "thai-baht-text", "thai-vat-wht"]));
  });

  it("solves sum-of-evens (no baseline yet), blocks resubmission", async () => {
    const a = await call("get_challenge", { challenge_id: "sum-of-evens" });
    const answer = (a.input.numbers as number[]).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);
    const r = await call("submit_answer", { attempt_id: a.attempt_id, answer: JSON.stringify(answer), model: "e2e", tokens_used: 1230 });
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
    // The peer passes sum-of-evens 5 times with 2460 tokens each; this user's passes reported 1230 → ×2.0 leaner.
    const { data: build } = await db.from("builds").select("id").eq("user_id", peerId).single();
    const { data: fullVariant } = await db.from("build_variants").select("id").eq("build_id", build!.id).eq("kind", "full").single();
    const now = new Date().toISOString();
    const rows = Array.from({ length: 5 }, () => ({
      user_id: peerId, build_id: build!.id, variant_id: fullVariant!.id, challenge_id: "sum-of-evens", challenge_version: getChallenge("sum-of-evens")!.version,
      seed: crypto.randomUUID(), issued_at: now, expires_at: now, submitted_at: now, duration_ms: 4000, status: "passed" as const, correct: true, score: 99, source: "mcp" as const, tokens_self_reported: 2460,
    }));
    expect((await db.from("attempts").insert(rows)).error).toBeNull();

    const stats = await call("my_stats");
    expect(stats.efficiency["sum-of-evens"]).toMatchObject({ tokens_per_pass: 1230, vs_model_median: 2, tokens_measured: false });
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

  it("computes Range and filters / sorts Leaderboard v2", async () => {
    // Only sum-of-evens (logic, the hardest logic challenge is difficulty 1) is passed: full credit in 1 category.
    const { count: cats } = await db.from("challenges").select("category", { count: "exact", head: true }).eq("is_active", true).eq("category", "logic");
    expect(cats).toBeGreaterThan(0);
    const { data: all } = await db.rpc("range_stats", { p_user: userId }).single();
    const { data: categories } = await db.from("challenges").select("category").eq("is_active", true);
    const total = new Set(categories!.map((c) => c.category)).size;
    expect(all).toMatchObject({ categories_passed: 1, categories: total });
    expect(Number(all!.range)).toBeCloseTo(100 / total, 1);
    const { data: global } = await db.rpc("range_stats", { p_user: userId, p_league: "global" }).single();
    const globalCats = new Set((await db.from("challenges").select("category").eq("is_active", true).eq("league", "global")).data!.map((c) => c.category)).size;
    expect(Number(global!.range)).toBeCloseTo(100 / globalCats, 1); // logic, algorithm, data, memory

    const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
    const { data: peerProfile } = await db.from("profiles").select("username").eq("id", peerId).single();
    const board = async (args: Record<string, string>) => {
      const { data, error } = await db.rpc("leaderboard", { p_model: "e2e-vanilla", ...args });
      expect(error).toBeNull();
      return data!;
    };
    // Same-Breed e2e-vanilla: both builders. Duo (MCP) keeps them; Autonomous (CLI) has nobody (all MCP results).
    expect((await board({})).map((r) => r.username).sort()).toEqual([profile!.username, peerProfile!.username].sort());
    expect(await board({ p_source: "cli" })).toEqual([]);
    expect((await board({ p_source: "mcp" })).length).toBe(2);
    // Sorts: rank follows the sorted number, highest first. The peer passed 5/5 → higher Reliability than 2/3.
    for (const sort of ["score", "lift", "reliability", "range"] as const) {
      const rows = await board({ p_sort: sort });
      const key = { score: "total_score", lift: "avg_lift", reliability: "reliability", range: "range" }[sort] as "total_score";
      const values = rows.map((r) => Number(r[key]));
      expect(values).toEqual([...values].sort((x, y) => y - x));
      expect(rows[0]!.rank).toBe(1);
    }
    expect((await board({ p_sort: "reliability" }))[0]!.username).toBe(peerProfile!.username);
    // Efficiency: only this user has a community comparison (the peer's own runs are the median) → peer unranked.
    const eff = await board({ p_sort: "efficiency" });
    expect(eff.map((r) => [r.username, r.rank])).toEqual([[profile!.username, 1], [peerProfile!.username, null]]);
    // Profession tag filter.
    await db.from("profiles").update({ professions: ["programmer"] }).eq("id", userId);
    expect((await board({ p_profession: "programmer" })).map((r) => r.username)).toEqual([profile!.username]);
    const { data: card } = await db.rpc("profile_card", { p_username: profile!.username });
    expect(card).toMatchObject({ range_categories: 1, range_total: total, professions: ["programmer"] });
  });

  it("lists anchors in regional leagues and scales Overall by the anchor factor", async () => {
    const thai = await call("list_challenges", { league: "thai" });
    const listed = Object.values(thai).filter(Boolean) as { id: string; league: string; is_anchor: boolean }[];
    expect(listed.filter((c) => c.league === "thai")).toHaveLength(5);
    expect(listed.filter((c) => c.is_anchor).map((c) => c.id).sort()).toEqual(["bracket-balance", "csv-revenue", "interval-merge"]);

    // 5 builders on a fresh model play an anchor (90) and a Thai challenge (60): Thai is harder → factor 90 / 60 = 1.5.
    const model = `e2e-link-${Date.now()}`;
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      const { data } = await db.auth.admin.createUser({ email: `e2e-link-${i}-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: `e2e-link-${i}` } });
      const id = data.user!.id;
      linkIds.push(id);
      const { data: b } = await db.from("builds").insert({ user_id: id, name: "link", base_model: model }).select("id").single();
      const { data: v } = await db.from("build_variants").select("id").eq("build_id", b!.id).eq("kind", "full").single();
      const row = (challenge_id: string, score: number) => ({
        user_id: id, build_id: b!.id, variant_id: v!.id, challenge_id, challenge_version: getChallenge(challenge_id)!.version,
        seed: crypto.randomUUID(), issued_at: now, expires_at: now, submitted_at: now, status: "passed" as const, correct: true, score, source: "cli" as const,
      });
      expect((await db.from("attempts").insert([row("bracket-balance", 90), row("thai-baht-text", 60)])).error).toBeNull();
    }
    const { data: factors } = await db.rpc("league_factors");
    const th = factors!.find((f) => f.league === "thai")!;
    expect(th.builders).toBeGreaterThanOrEqual(5);
    expect(Number(factors!.find((f) => f.league === "global")!.factor)).toBe(1);
    // Other e2e users may also have anchor + Thai runs, so check the formula rather than an exact 1.5.
    expect(Number(th.factor)).toBeCloseTo(Math.min(2, Math.max(0.5, Number(th.anchor_mean) / Number(th.league_mean))), 2);

    const overall = (await db.rpc("leaderboard", { p_model: model })).data!;
    expect(overall).toHaveLength(5);
    for (const r of overall) expect(Number(r.total_score)).toBeCloseTo(90 + 60 * Number(th.factor), 1);
    const thaiOnly = (await db.rpc("leaderboard", { p_model: model, p_league: "thai" })).data!;
    for (const r of thaiOnly) expect(Number(r.total_score)).toBe(60); // inside a league nothing is scaled
    const { data: card } = await db.rpc("profile_card", { p_username: overall[0]!.username });
    expect(card).toMatchObject({ anchors_passed: 1, league_ranks: { global: expect.any(Number), thai: expect.any(Number) } });
  });

  it("runs the Memory Fitness learn day through MCP and keeps the exam closed until due", async () => {
    const learn = await call("get_challenge", { challenge_id: "memory-fitness", mode: "practice" });
    expect(learn).toMatchObject({ phase: "learn" });
    expect(learn.input.facts).toHaveLength(12);
    const again = await call("get_challenge", { challenge_id: "memory-fitness", mode: "practice" });
    expect(again.attempt_id).toBe(learn.attempt_id); // same round until it is submitted
    const r = await call("submit_answer", { attempt_id: learn.attempt_id, answer: JSON.stringify({ q1: "x" }) });
    expect(r).toMatchObject({ phase: "learn", correct: false });
    expect(r.lift_note).toContain("exam opens");
    const early = await call("get_challenge", { challenge_id: "memory-fitness" });
    expect(early.isError).toBe(true);
    expect(early.error).toContain("Memory exam opens");
    const stats = await call("my_stats");
    expect(stats.memory.full).toMatchObject({ status: "waiting", learn_quiz_pct: 0, exam_recall_pct: null });
  });

  it("flags anomalies, lowers trust, caps one account's weight and hides accounts under review", async () => {
    const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
    const card = async () => (await db.rpc("profile_card", { p_username: profile!.username })).data as { passed: number; trust: number; flagged_attempts: number };
    const passedBefore = (await card()).passed;
    const expectedFor = async (attemptId: string, id: string) => {
      const { data } = await db.from("attempts").select("seed").eq("id", attemptId).single();
      return getChallenge(id)!.generate(data!.seed).expected;
    };
    // 1. A difficulty-2 pass submitted instantly: an AI cannot read, solve and submit that fast.
    const fast = await call("get_challenge", { challenge_id: "interval-merge" });
    const r1 = await call("submit_answer", { attempt_id: fast.attempt_id, answer: JSON.stringify(await expectedFor(fast.attempt_id, "interval-merge")) });
    expect(r1).toMatchObject({ correct: true, flags: ["too_fast"] });
    expect(r1.flag_note).toContain("does not count");
    expect((await card()).passed).toBe(passedBefore); // kept, but not counted
    // 2. An impossible token count is ignored for Efficiency.
    const t = await call("get_challenge", { challenge_id: "sum-of-evens", mode: "practice" });
    const sum = (t.input.numbers as number[]).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);
    expect(await call("submit_answer", { attempt_id: t.attempt_id, answer: JSON.stringify(sum), tokens_used: 3 })).toMatchObject({ flags: ["tokens_implausible"] });
    expect((await call("my_stats")).efficiency["sum-of-evens"].tokens_per_pass).toBe(1230);
    // 3. A blank Stock answer is no baseline (no sandbagging Stock).
    const before = (await db.rpc("paired_lifts", { p_user: userId, p_challenge: "sum-of-evens" })).data![0]!;
    const blank = await call("get_challenge", { challenge_id: "sum-of-evens", variant: "stock" });
    expect(await call("submit_answer", { attempt_id: blank.attempt_id, answer: "" })).toMatchObject({ flags: ["blank_answer"] });
    const after = (await db.rpc("paired_lifts", { p_user: userId, p_challenge: "sum-of-evens" })).data![0]!;
    expect(after.baseline_runs).toBe(before.baseline_runs);
    // Trust: unknown GitHub age 0.6 × (1 − 0.15 × 3 flags) = 0.33, still on the board.
    const stats = await call("my_stats");
    expect(stats.trust).toMatchObject({ score: 0.33, flagged_last_90_days: 3 });
    const board = async () => ((await db.rpc("leaderboard", { p_model: "e2e-vanilla" })).data ?? []).map((r) => r.username);
    expect(await board()).toContain(profile!.username);
    // 4th flag → 0.6 × 0.4 = 0.24 < 0.25: under review, off the public board; the card still shows it.
    const fast2 = await call("get_challenge", { challenge_id: "interval-merge" });
    await call("submit_answer", { attempt_id: fast2.attempt_id, answer: JSON.stringify(await expectedFor(fast2.attempt_id, "interval-merge")) });
    expect(await board()).not.toContain(profile!.username);
    expect(await card()).toMatchObject({ trust: 0.24, flagged_attempts: 4 });

    // One account = one vote: 6 zero-score Stock runs from one account do not outvote 2 accounts at 80.
    const model = `e2e-cap-${Date.now()}`;
    const now = new Date().toISOString();
    for (const [i, scores] of [[0, [0, 0, 0, 0, 0, 0]], [1, [80]], [2, [80]]] as const) {
      const { data } = await db.auth.admin.createUser({ email: `e2e-cap-${i}-${Date.now()}@arena.test`, email_confirm: true, user_metadata: { user_name: `e2e-cap-${i}` } });
      linkIds.push(data.user!.id);
      const { data: b } = await db.from("builds").insert({ user_id: data.user!.id, name: "cap", base_model: model }).select("id").single();
      const { data: v } = await db.from("build_variants").select("id").eq("build_id", b!.id).eq("kind", "stock").single();
      const rows = scores.map((score) => ({
        user_id: data.user!.id, build_id: b!.id, variant_id: v!.id, challenge_id: "sum-of-evens", challenge_version: 1,
        seed: crypto.randomUUID(), issued_at: now, expires_at: now, submitted_at: now, status: "failed" as const, correct: false, score, source: "mcp" as const,
      }));
      expect((await db.from("attempts").insert(rows)).error).toBeNull();
    }
    const { data: median } = await db.rpc("community_stock_baseline", { p_challenge: "sum-of-evens", p_model: model }).single();
    expect(median).toMatchObject({ score: 80, runs: 8 });
  });

  it("caps unfinished attempts at 3 and records events", async () => {
    for (let i = 0; i < 3; i++) expect((await call("get_challenge", { challenge_id: "roman-numerals" })).attempt_id).toBeTruthy();
    const blocked = await call("get_challenge", { challenge_id: "roman-numerals" });
    expect(blocked.isError).toBe(true);
    expect(blocked.error).toContain("unfinished");
    const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("name", "challenge_submitted");
    expect(count).toBe(9); // 5 earlier + 4 in the anti-cheat test
  });
});
