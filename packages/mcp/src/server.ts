import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@arena/db";
import { getChallenge } from "@arena/challenges";
import { startAttempt, submitAttempt } from "./arena";
import type { ResultSource } from "@arena/core";

export interface ArenaContext {
  db: SupabaseClient<Database>; // service role: every query below must scope by userId
  userId: string;
  /** Where results come from: the remote MCP (self-reported) or the SetupTier CLI. */
  source?: ResultSource;
}


const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ ...json({ error: message }), isError: true });



export function createArenaMcpServer({ db, userId, source = "mcp" }: ArenaContext) {
  const user = { db, userId, source };
  const server = new McpServer({ name: "setuptier", version: "0.1.0" });

  server.registerTool(
    "list_challenges",
    {
      title: "List challenges",
      description: "List active SetupTier challenges. Pick one, then call get_challenge.",
      inputSchema: { league: z.enum(["global", "thai"]).optional().describe("Filter by league") },
      annotations: { readOnlyHint: true },
    },
    async ({ league }) => {
      let q = db.from("challenges").select("id, league, category, title, summary, difficulty, time_limit_seconds").eq("is_active", true).order("difficulty");
      if (league) q = q.eq("league", league);
      const { data, error } = await q;
      if (error) return fail("Could not load challenges.");
      return json(data.filter((c) => getChallenge(c.id)));
    },
  );

  server.registerTool(
    "get_challenge",
    {
      title: "Start a challenge attempt",
      description:
        "Starts a timed attempt and returns the instructions plus a freshly generated input. Solve it locally (write and run code), then call submit_answer with the attempt_id. Each attempt has its own random input and accepts one submission.",
      inputSchema: {
        challenge_id: z.string().describe("Id from list_challenges"),
        variant: z
          .enum(["full", "stock"])
          .optional()
          .describe('"full" (default) = your whole setup. "stock" = the same client with none of your MCP servers, skills, memory or custom instructions: this is the baseline your Lift is measured against.'),
        mode: z
          .enum(["ranked", "practice"])
          .optional()
          .describe('"ranked" (default) counts for the leaderboard. "practice" repeats a challenge to measure Reliability without touching your rank.'),
      },
    },
    async ({ challenge_id, variant, mode }) => {
      const r = await startAttempt(user, { challengeId: challenge_id, variant, mode });
      if (!r.ok) return fail(r.error);
      const { ok: _ok, ...attempt } = r;
      return json({ ...attempt, submit_with: "submit_answer({ attempt_id, answer: <JSON-encoded answer> })" });
    },
  );

  server.registerTool(
    "submit_answer",
    {
      title: "Submit answer",
      description: "Submit the answer for an attempt (one submission per attempt). Returns correctness, score and Lift.",
      inputSchema: {
        attempt_id: z.string().uuid(),
        answer: z.string().max(200_000).describe("The answer, JSON-encoded exactly as the instructions specify"),
        model: z.string().max(80).optional().describe("Model that produced the answer (self-reported)"),
        tokens_used: z.number().int().nonnegative().optional().describe("Total tokens used (self-reported)"),
      },
    },
    async ({ attempt_id, answer, model, tokens_used }) => {
      const r = await submitAttempt(user, { attemptId: attempt_id, answer, model, tokensSelfReported: tokens_used });
      if (!r.ok) return fail(r.error);
      const { ok: _ok, ...result } = r;
      return json(result);
    },
  );

  server.registerTool(
    "my_stats",
    {
      title: "My stats",
      description: "Your attempts summary: passed/failed counts, average and best scores, and Lift (Full vs Stock) per challenge, Reliability (pass-rate lower bound) and Efficiency (tokens per pass).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await db.from("attempts").select("challenge_id, status, score").eq("user_id", userId).neq("status", "issued");
      if (error) return fail("Could not load stats.");
      const [{ data: lifts }, { data: rel }, { data: eff }, { data: range }] = await Promise.all([
        db.rpc("paired_lifts", { p_user: userId }),
        db.rpc("reliability_stats", { p_user: userId }).maybeSingle(),
        db.rpc("efficiency_stats", { p_user: userId }),
        db.rpc("range_stats", { p_user: userId }).maybeSingle(),
      ]);
      const liftOf = new Map((lifts ?? []).map((l) => [l.challenge_id, { lift: Number(l.lift), basis: l.basis, verified: l.verified }]));
      const per = new Map<string, { attempts: number; passed: number; best_score: number; lift: { lift: number; basis: string; verified: boolean } | null }>();
      for (const a of data) {
        const s = per.get(a.challenge_id) ?? { attempts: 0, passed: 0, best_score: 0, lift: liftOf.get(a.challenge_id) ?? null };
        s.attempts++;
        if (a.status === "passed") s.passed++;
        s.best_score = Math.max(s.best_score, Number(a.score ?? 0));
        per.set(a.challenge_id, s);
      }
      const scores = data.map((a) => Number(a.score ?? 0));
      return json({
        total_attempts: data.length,
        passed: data.filter((a) => a.status === "passed").length,
        avg_score: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 100) / 100 : null,
        reliability: rel
          ? { lower_bound_pct: Number(rel.reliability), passes: rel.passes, runs: rel.runs, note: "95% Wilson lower bound over challenges run 3+ times" }
          : { lower_bound_pct: null, note: "Run a challenge 3+ times (mode practice is fine) to measure Reliability." },
        range: range ? { score: Number(range.range), categories_passed: range.categories_passed, categories: range.categories, note: "0–100, categories passed weighted by the hardest difficulty passed" } : null,
        efficiency: Object.fromEntries(
          (eff ?? []).map((e) => [e.challenge_id, { tokens_per_pass: e.tokens, seconds_per_pass: e.seconds, vs_model_median: e.efficiency, tokens_measured: e.tokens_measured }]),
        ),
        challenges: Object.fromEntries(per),
      });
    },
  );

  return server;
}
