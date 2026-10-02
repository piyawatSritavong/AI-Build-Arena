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
    await db.from("baselines").upsert({ challenge_id: "sum-of-evens", model: "e2e-vanilla", runs: 3, pass_rate: 0.67, avg_score: 70 });
    const t = await generateApiToken();
    await db.from("api_tokens").insert({ user_id: userId, token_prefix: t.prefix, token_hash: t.hash });
    client = new Client({ name: "arena-e2e", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${t.raw}` } } }));
  });

  afterAll(async () => {
    await client?.close();
    await db.from("baselines").delete().eq("model", "e2e-vanilla");
    if (userId) await db.auth.admin.deleteUser(userId);
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

  it("solves sum-of-evens with Lift, blocks resubmission", async () => {
    const a = await call("get_challenge", { challenge_id: "sum-of-evens" });
    const answer = (a.input.numbers as number[]).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);
    const r = await call("submit_answer", { attempt_id: a.attempt_id, answer: JSON.stringify(answer), model: "e2e", tokens_used: 123 });
    expect(r).toMatchObject({ correct: true, accuracy: 1 });
    expect(r.score).toBeGreaterThan(99);
    expect(r.lift).toBeCloseTo(r.score - 70, 2);
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
});
