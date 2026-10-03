import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@arena/db";
import { computeScore, getChallenge } from "@arena/challenges";
import type { ResultSource } from "@arena/core";

export interface ArenaContext {
  db: SupabaseClient<Database>; // service role: every query below must scope by userId
  userId: string;
  /** Where results come from: the remote MCP (self-reported) or the SetupTier CLI. */
  source?: ResultSource;
}

const ATTEMPTS_PER_HOUR = 30;
const MAX_OPEN_ATTEMPTS = 3;

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ ...json({ error: message }), isError: true });

function parseAnswer(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Product event mirror (week-2 metrics). Never blocks the tool call. */
async function track(db: SupabaseClient<Database>, userId: string, name: string, props: Record<string, string | number | boolean>) {
  await db.from("events").insert({ user_id: userId, name, props }).then(() => undefined, () => undefined);
}

export function createArenaMcpServer({ db, userId, source = "mcp" }: ArenaContext) {
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
    async ({ challenge_id, variant = "full", mode = "ranked" }) => {
      const def = getChallenge(challenge_id);
      const { count: open } = await db
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "issued")
        .gt("expires_at", new Date().toISOString());
      if ((open ?? 0) >= MAX_OPEN_ATTEMPTS) return fail(`You have ${open} unfinished attempts. Submit them (or let them expire) before starting another.`);
      const { data: allowed } = await db.rpc("rate_limit_hit", { p_key: `attempts:${userId}`, p_window_seconds: 3600, p_max: ATTEMPTS_PER_HOUR });
      if (!allowed) return fail(`Limit of ${ATTEMPTS_PER_HOUR} new attempts per hour reached. Try again later.`);
      const { data: row } = await db.from("challenges").select("time_limit_seconds, is_active").eq("id", challenge_id).maybeSingle();
      if (!def || !row?.is_active) return fail(`Unknown challenge "${challenge_id}".`);

      const { data: build } = await db.from("builds").select("id").eq("user_id", userId).eq("is_primary", true).maybeSingle();
      if (variant === "stock" && !build) return fail("Save your build on setuptier.com first: a Stock run is measured against a build.");
      const { data: variantRow } = build
        ? await db.from("build_variants").select("id").eq("build_id", build.id).eq("kind", variant).maybeSingle()
        : { data: null };
      const seed = crypto.randomUUID();
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + row.time_limit_seconds * 1000);
      const { data: attempt, error } = await db
        .from("attempts")
        .insert({
          user_id: userId,
          build_id: build?.id ?? null,
          variant_id: variantRow?.id ?? null,
          mode,
          source,
          challenge_id,
          challenge_version: def.version,
          seed,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();
      if (error) return fail("Could not start attempt.");
      await track(db, userId, "challenge_started", { challenge_id, variant, mode, source });

      return json({
        attempt_id: attempt.id,
        title: def.title,
        instructions: def.prompt,
        variant,
        mode,
        input: def.generate(seed).input,
        time_limit_seconds: row.time_limit_seconds,
        expires_at: expiresAt.toISOString(),
        submit_with: "submit_answer({ attempt_id, answer: <JSON-encoded answer> })",
      });
    },
  );

  server.registerTool(
    "submit_answer",
    {
      title: "Submit answer",
      description: "Submit the answer for an attempt (one submission per attempt). Returns correctness, score and Lift vs the vanilla base model.",
      inputSchema: {
        attempt_id: z.string().uuid(),
        answer: z.string().max(200_000).describe("The answer, JSON-encoded exactly as the instructions specify"),
        model: z.string().max(80).optional().describe("Model that produced the answer (self-reported)"),
        tokens_used: z.number().int().nonnegative().optional().describe("Total tokens used (self-reported)"),
      },
    },
    async ({ attempt_id, answer, model, tokens_used }) => {
      const { data: attempt } = await db
        .from("attempts")
        .select("id, challenge_id, challenge_version, seed, status, issued_at, expires_at, build_id, challenges(time_limit_seconds), build_variants(kind)")
        .eq("id", attempt_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!attempt) return fail("Attempt not found.");
      if (attempt.status !== "issued") return fail(`Attempt already ${attempt.status}. Start a new one with get_challenge.`);
      const def = getChallenge(attempt.challenge_id);
      if (!def || def.version !== attempt.challenge_version) return fail("Challenge was updated; start a new attempt.");

      const now = new Date();
      const durationMs = now.getTime() - new Date(attempt.issued_at).getTime();
      const base = { submitted_at: now.toISOString(), duration_ms: durationMs, model_self_reported: model ?? null, tokens_self_reported: tokens_used ?? null };

      if (now > new Date(attempt.expires_at)) {
        await db.from("attempts").update({ ...base, status: "expired" }).eq("id", attempt.id).eq("status", "issued");
        return fail("Time limit exceeded; attempt expired.");
      }

      const { expected } = def.generate(attempt.seed);
      const result = def.verify(parseAnswer(answer), expected);

      // A Stock run is itself the baseline, so it has no Lift. (Paired Lift lands on D12.)
      const isStock = attempt.build_variants?.kind === "stock";
      let baselineScore: number | undefined;
      let baselineModel: string | undefined;
      if (attempt.build_id && !isStock) {
        const { data: build } = await db.from("builds").select("base_model").eq("id", attempt.build_id).maybeSingle();
        if (build) {
          const { data: bl } = await db.from("baselines").select("avg_score").eq("challenge_id", def.id).eq("model", build.base_model).maybeSingle();
          if (bl) [baselineScore, baselineModel] = [Number(bl.avg_score), build.base_model];
        }
      }
      const timeLimitMs = (attempt.challenges?.time_limit_seconds ?? 900) * 1000;
      const { score, lift } = computeScore({ accuracy: result.accuracy, durationMs, timeLimitMs, baselineScore });

      const { data: updated } = await db
        .from("attempts")
        .update({ ...base, status: result.correct ? "passed" : "failed", correct: result.correct, score, lift: lift ?? null })
        .eq("id", attempt.id)
        .eq("status", "issued")
        .select("id");
      if (!updated?.length) return fail("Attempt was already submitted.");
      await track(db, userId, "challenge_submitted", { challenge_id: def.id, correct: result.correct, score, has_lift: lift !== undefined });

      return json({
        correct: result.correct,
        accuracy: result.accuracy,
        score,
        lift: lift ?? null,
        lift_note: isStock
          ? "Stock run recorded: it is the baseline your Full setup's Lift is measured against."
          : baselineModel
            ? `vs vanilla ${baselineModel}`
            : "No baseline yet: run this challenge once with variant \"stock\" to measure your Lift.",
        duration_seconds: Math.round(durationMs / 1000),
        feedback: result.feedback,
      });
    },
  );

  server.registerTool(
    "my_stats",
    {
      title: "My stats",
      description: "Your attempts summary: passed/failed counts, average and best scores per challenge.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await db.from("attempts").select("challenge_id, status, score, lift").eq("user_id", userId).neq("status", "issued");
      if (error) return fail("Could not load stats.");
      const per = new Map<string, { attempts: number; passed: number; best_score: number; best_lift: number | null }>();
      for (const a of data) {
        const s = per.get(a.challenge_id) ?? { attempts: 0, passed: 0, best_score: 0, best_lift: null };
        s.attempts++;
        if (a.status === "passed") s.passed++;
        s.best_score = Math.max(s.best_score, Number(a.score ?? 0));
        if (a.lift !== null) s.best_lift = Math.max(s.best_lift ?? -Infinity, Number(a.lift));
        per.set(a.challenge_id, s);
      }
      const scores = data.map((a) => Number(a.score ?? 0));
      return json({
        total_attempts: data.length,
        passed: data.filter((a) => a.status === "passed").length,
        avg_score: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 100) / 100 : null,
        challenges: Object.fromEntries(per),
      });
    },
  );

  return server;
}
