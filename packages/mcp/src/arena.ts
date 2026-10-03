import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptMode, Json, LiftBasis, ResultSource } from "@arena/core";
import type { Database } from "@arena/db";
import { computeScore, getChallenge, normalizedGain } from "@arena/challenges";

// Attempt lifecycle shared by the remote MCP tools and the CLI API.
// db is a service-role client: every query scopes by userId.

export const ATTEMPTS_PER_HOUR = 30;
export const MAX_OPEN_ATTEMPTS = 3;

export interface ArenaUser {
  db: SupabaseClient<Database>;
  userId: string;
  source: ResultSource;
}

type Fail = { ok: false; error: string };

export type StartedAttempt = {
  ok: true;
  attempt_id: string;
  title: string;
  instructions: string;
  input: Json;
  time_limit_seconds: number;
  expires_at: string;
  variant: "full" | "stock";
  mode: AttemptMode;
};

/** Product event mirror (week-2 metrics). Never blocks the caller. */
export async function track(db: SupabaseClient<Database>, userId: string, name: string, props: Record<string, string | number | boolean>) {
  await db.from("events").insert({ user_id: userId, name, props }).then(() => undefined, () => undefined);
}

export async function startAttempt(
  { db, userId, source }: ArenaUser,
  { challengeId, variant = "full", mode = "ranked" }: { challengeId: string; variant?: "full" | "stock"; mode?: AttemptMode },
): Promise<StartedAttempt | Fail> {
  const def = getChallenge(challengeId);
  const { count: open } = await db
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "issued")
    .gt("expires_at", new Date().toISOString());
  if ((open ?? 0) >= MAX_OPEN_ATTEMPTS) return { ok: false, error: `You have ${open} unfinished attempts. Submit them (or let them expire) before starting another.` };
  const { data: allowed } = await db.rpc("rate_limit_hit", { p_key: `attempts:${userId}`, p_window_seconds: 3600, p_max: ATTEMPTS_PER_HOUR });
  if (!allowed) return { ok: false, error: `Limit of ${ATTEMPTS_PER_HOUR} new attempts per hour reached. Try again later.` };
  const { data: row } = await db.from("challenges").select("time_limit_seconds, is_active").eq("id", challengeId).maybeSingle();
  if (!def || !row?.is_active) return { ok: false, error: `Unknown challenge "${challengeId}".` };

  const { data: build } = await db.from("builds").select("id").eq("user_id", userId).eq("is_primary", true).maybeSingle();
  if (variant === "stock" && !build) return { ok: false, error: "Save your build on setuptier.com first: a Stock run is measured against a build." };
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
      challenge_id: challengeId,
      challenge_version: def.version,
      seed,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Could not start attempt." };
  await track(db, userId, "challenge_started", { challenge_id: challengeId, variant, mode, source });

  return {
    ok: true,
    attempt_id: attempt.id,
    title: def.title,
    instructions: def.prompt,
    input: def.generate(seed).input,
    time_limit_seconds: row.time_limit_seconds,
    expires_at: expiresAt.toISOString(),
    variant,
    mode,
  };
}

/** The challenge's Paired Lift after this submission (see supabase/migrations/*_paired_lift.sql). */
export type ChallengeLift = { lift: number; basis: LiftBasis; verified: boolean; full_runs: number; baseline_runs: number };

export type SubmittedAnswer = {
  ok: true;
  correct: boolean;
  accuracy: number;
  score: number;
  /** This run vs the baseline (normalized gain, −100…+100); Full runs only. */
  lift: number | null;
  /** Mean ranked Full vs baseline for this challenge: the number on the card and leaderboard. */
  challenge_lift: ChallengeLift | null;
  lift_note: string;
  duration_seconds: number;
  feedback?: string;
};

function parseAnswer(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function submitAttempt(
  { db, userId, source }: ArenaUser,
  input: { attemptId: string; answer: string; model?: string; tokensSelfReported?: number; tokensMeasured?: number; client?: string },
): Promise<SubmittedAnswer | Fail> {
  const { data: attempt } = await db
    .from("attempts")
    .select("id, challenge_id, challenge_version, seed, status, issued_at, expires_at, build_id, source, challenges(time_limit_seconds), build_variants(kind)")
    .eq("id", input.attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!attempt) return { ok: false, error: "Attempt not found." };
  if (attempt.status !== "issued") return { ok: false, error: `Attempt already ${attempt.status}. Start a new one.` };
  const def = getChallenge(attempt.challenge_id);
  if (!def || def.version !== attempt.challenge_version) return { ok: false, error: "Challenge was updated; start a new attempt." };

  const now = new Date();
  const durationMs = now.getTime() - new Date(attempt.issued_at).getTime();
  // Measured tokens are accepted only for attempts the CLI started (an MCP client cannot claim "measured").
  const measured = source === "cli" && attempt.source === "cli" ? input.tokensMeasured : undefined;
  const base = {
    submitted_at: now.toISOString(),
    duration_ms: durationMs,
    model_self_reported: input.model?.slice(0, 80) ?? null,
    tokens_self_reported: input.tokensSelfReported ?? null,
    tokens_measured: measured ?? null,
    client: input.client?.slice(0, 40) ?? null,
  };

  if (now > new Date(attempt.expires_at)) {
    await db.from("attempts").update({ ...base, status: "expired" }).eq("id", attempt.id).eq("status", "issued");
    return { ok: false, error: "Time limit exceeded; attempt expired." };
  }

  const { expected } = def.generate(attempt.seed);
  const result = def.verify(parseAnswer(input.answer), expected);

  const timeLimitMs = (attempt.challenges?.time_limit_seconds ?? 900) * 1000;
  const { score } = computeScore({ accuracy: result.accuracy, durationMs, timeLimitMs });

  // A Stock run is itself a baseline, so it has no Lift of its own.
  const isStock = attempt.build_variants?.kind === "stock";
  let lift: number | null = null;
  if (attempt.build_id && !isStock) {
    const { data: bl } = await db.rpc("lift_baseline", { p_user: userId, p_build: attempt.build_id, p_challenge: def.id }).maybeSingle();
    if (bl?.score != null) lift = normalizedGain(score, Number(bl.score));
  }

  const { data: updated } = await db
    .from("attempts")
    .update({ ...base, status: result.correct ? "passed" : "failed", correct: result.correct, score, lift })
    .eq("id", attempt.id)
    .eq("status", "issued")
    .select("id");
  if (!updated?.length) return { ok: false, error: "Attempt was already submitted." };
  await track(db, userId, "challenge_submitted", { challenge_id: def.id, correct: result.correct, score, has_lift: lift !== null, source });

  const { data: pair } = await db.rpc("paired_lifts", { p_user: userId, p_challenge: def.id }).maybeSingle();
  const challengeLift: ChallengeLift | null = pair
    ? { lift: Number(pair.lift), basis: pair.basis as LiftBasis, verified: pair.verified, full_runs: pair.full_runs, baseline_runs: pair.baseline_runs }
    : null;

  return {
    ok: true,
    correct: result.correct,
    accuracy: result.accuracy,
    score,
    lift,
    challenge_lift: challengeLift,
    lift_note: liftNote(isStock, challengeLift),
    duration_seconds: Math.round(durationMs / 1000),
    feedback: result.feedback,
  };
}

function liftNote(isStock: boolean, c: ChallengeLift | null): string {
  const stockHint = 'Run this challenge with variant "stock" (the same client with none of your add-ons) to measure your own Lift.';
  if (!c) return isStock ? "Stock run recorded. Your Lift appears once this build has a ranked Full run on this challenge." : `No baseline yet. ${stockHint}`;
  const vs =
    c.basis === "own"
      ? `vs your own Stock runs (${c.baseline_runs})${c.verified ? ", verified by the CLI" : ", self-reported"}`
      : `vs the community Stock median for your model (${c.baseline_runs} runs). ${stockHint}`;
  return `Challenge Lift ${c.lift >= 0 ? "+" : ""}${c.lift} ${vs}.`;
}
