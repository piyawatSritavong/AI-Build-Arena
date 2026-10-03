import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptMode, Json, LiftBasis, ResultSource } from "@arena/core";
import type { Database } from "@arena/db";
import { computeScore, detectFlags, flagNote, getChallenge, normalizedGain, type AttemptFlag } from "@arena/challenges";

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
  /** Memory Fitness only: "learn" (save the facts, answer the quiz) or "exam" (recall without the facts). */
  phase?: "learn" | "exam";
  exam_due_at?: string;
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

  if (def.memory) return startMemory({ db, userId, source }, { def, buildId: build?.id ?? null, variantId: variantRow?.id ?? null, variant, mode, timeLimit: row.time_limit_seconds });
  return insertAttempt({ db, userId, source }, { def, buildId: build?.id ?? null, variantId: variantRow?.id ?? null, variant, mode, timeLimit: row.time_limit_seconds });
}

type AttemptPlan = { def: NonNullable<ReturnType<typeof getChallenge>>; buildId: string | null; variantId: string | null; variant: "full" | "stock"; mode: AttemptMode; timeLimit: number };

async function insertAttempt({ db, userId, source }: ArenaUser, p: AttemptPlan, seed: string = crypto.randomUUID()): Promise<StartedAttempt | Fail> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + p.timeLimit * 1000);
  const { data: attempt, error } = await db
    .from("attempts")
    .insert({
      user_id: userId,
      build_id: p.buildId,
      variant_id: p.variantId,
      mode: p.mode,
      source,
      challenge_id: p.def.id,
      challenge_version: p.def.version,
      seed,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Could not start attempt." };
  await track(db, userId, "challenge_started", { challenge_id: p.def.id, variant: p.variant, mode: p.mode, source });

  return {
    ok: true,
    attempt_id: attempt.id,
    title: p.def.title,
    instructions: p.def.prompt,
    input: p.def.generate(seed).input,
    time_limit_seconds: p.timeLimit,
    expires_at: expiresAt.toISOString(),
    variant: p.variant,
    mode: p.mode,
    ...(p.def.memory ? { phase: "exam" as const } : {}),
  };
}

const DAY_MS = 86_400_000;

/**
 * Memory Fitness: no active round → learn day (an enrollment, not an attempt: its id is the attempt_id to submit);
 * a round waiting and due → the exam, an ordinary attempt on the enrollment's seed; not due yet → when to come back.
 */
async function startMemory(user: ArenaUser, p: AttemptPlan): Promise<StartedAttempt | Fail> {
  const { db, userId, source } = user;
  const memory = p.def.memory!;
  const now = new Date();
  // Rounds that ran out of time lapse here, so a new one can start.
  await db.from("memory_enrollments").update({ status: "expired" }).eq("user_id", userId).eq("status", "learning").lt("learn_expires_at", now.toISOString());
  await db.from("memory_enrollments").update({ status: "expired" }).eq("user_id", userId).eq("status", "waiting").lt("exam_closes_at", now.toISOString());
  let q = db.from("memory_enrollments").select("id, seed, status, learn_expires_at, exam_due_at, exam_closes_at").eq("user_id", userId).eq("challenge_id", p.def.id).in("status", ["learning", "waiting"]);
  q = p.variantId ? q.eq("variant_id", p.variantId) : q.is("variant_id", null);
  const { data: active } = await q.maybeSingle();

  if (active?.status === "waiting") {
    const due = new Date(active.exam_due_at!);
    if (now < due) return { ok: false, error: `Memory exam opens ${due.toISOString()} (${Math.ceil((due.getTime() - now.getTime()) / 3_600_000)} h from now). Come back then, in a new session.` };
    const exam = await insertAttempt(user, p, active.seed);
    if (exam.ok) await db.from("memory_enrollments").update({ exam_attempt_id: exam.attempt_id }).eq("id", active.id);
    return exam;
  }

  const seed = active?.seed ?? crypto.randomUUID();
  let enrollment = active;
  if (!enrollment) {
    const { data, error } = await db
      .from("memory_enrollments")
      .insert({
        user_id: userId,
        build_id: p.buildId,
        variant_id: p.variantId,
        source,
        challenge_id: p.def.id,
        challenge_version: p.def.version,
        seed,
        learn_expires_at: new Date(now.getTime() + p.timeLimit * 1000).toISOString(),
      })
      .select("id, seed, status, learn_expires_at, exam_due_at, exam_closes_at")
      .single();
    if (error) return { ok: false, error: "Could not start the memory round." };
    enrollment = data;
    await track(db, userId, "memory_learn_started", { variant: p.variant, source });
  }
  return {
    ok: true,
    attempt_id: enrollment.id,
    title: `${p.def.title} (learn day)`,
    instructions: memory.learnPrompt,
    input: memory.learn(seed).input,
    time_limit_seconds: p.timeLimit,
    expires_at: enrollment.learn_expires_at,
    variant: p.variant,
    mode: p.mode,
    phase: "learn",
    exam_due_at: new Date(now.getTime() + memory.days * DAY_MS).toISOString(),
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
  phase?: "learn" | "exam";
  exam_due_at?: string;
  exam_closes_at?: string;
  /** Anomaly flags (anti-cheat v1) and what they mean for this result. */
  flags?: AttemptFlag[];
  flag_note?: string;
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
  input: { attemptId: string; answer: string; model?: string; tokensSelfReported?: number; tokensMeasured?: number; costUsd?: number; client?: string },
): Promise<SubmittedAnswer | Fail> {
  const { data: attempt } = await db
    .from("attempts")
    .select("id, challenge_id, challenge_version, seed, status, issued_at, expires_at, build_id, source, challenges(time_limit_seconds), build_variants(kind)")
    .eq("id", input.attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!attempt) return submitLearnDay({ db, userId, source }, input);
  if (attempt.status !== "issued") return { ok: false, error: `Attempt already ${attempt.status}. Start a new one.` };
  const def = getChallenge(attempt.challenge_id);
  if (!def || def.version !== attempt.challenge_version) return { ok: false, error: "Challenge was updated; start a new attempt." };

  const now = new Date();
  const durationMs = now.getTime() - new Date(attempt.issued_at).getTime();
  // Measured tokens are accepted only for attempts the CLI started (an MCP client cannot claim "measured").
  const fromCli = source === "cli" && attempt.source === "cli";
  const measured = fromCli ? input.tokensMeasured : undefined;
  const base = {
    submitted_at: now.toISOString(),
    duration_ms: durationMs,
    model_self_reported: input.model?.slice(0, 80) ?? null,
    tokens_self_reported: input.tokensSelfReported ?? null,
    tokens_measured: measured ?? null,
    cost_usd: fromCli && input.costUsd !== undefined ? Math.round(input.costUsd * 10_000) / 10_000 : null,
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
  const flags = detectFlags({ source: attempt.source, correct: result.correct, difficulty: def.difficulty, durationMs, tokensSelfReported: input.tokensSelfReported, answer: input.answer });

  // A Stock run is itself a baseline, so it has no Lift of its own.
  const isStock = attempt.build_variants?.kind === "stock";
  let lift: number | null = null;
  if (attempt.build_id && !isStock) {
    const { data: bl } = await db.rpc("lift_baseline", { p_user: userId, p_build: attempt.build_id, p_challenge: def.id }).maybeSingle();
    if (bl?.score != null) lift = normalizedGain(score, Number(bl.score));
  }

  const { data: updated } = await db
    .from("attempts")
    .update({ ...base, status: result.correct ? "passed" : "failed", correct: result.correct, score, lift, flags })
    .eq("id", attempt.id)
    .eq("status", "issued")
    .select("id");
  if (!updated?.length) return { ok: false, error: "Attempt was already submitted." };
  await track(db, userId, "challenge_submitted", { challenge_id: def.id, correct: result.correct, score, has_lift: lift !== null, source, flags: flags.join(",") });
  if (flags.length) await db.rpc("refresh_trust_score", { p_user: userId });
  if (def.memory) {
    await db
      .from("memory_enrollments")
      .update({ status: "examined", exam_accuracy: result.accuracy, examined_at: now.toISOString() })
      .eq("exam_attempt_id", attempt.id)
      .eq("status", "waiting");
  }

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
    ...(def.memory ? { phase: "exam" as const } : {}),
    ...(flags.length ? { flags, flag_note: flagNote(flags, def.difficulty) } : {}),
  };
}

/** Memory Fitness learn day: grade the quiz (the day-1 baseline) and schedule the exam. */
async function submitLearnDay({ db, userId }: ArenaUser, input: { attemptId: string; answer: string }): Promise<SubmittedAnswer | Fail> {
  const { data: e } = await db
    .from("memory_enrollments")
    .select("id, challenge_id, challenge_version, seed, status, issued_at, learn_expires_at")
    .eq("id", input.attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!e) return { ok: false, error: "Attempt not found." };
  if (e.status !== "learning") return { ok: false, error: `Learn day already ${e.status === "waiting" ? "submitted" : e.status}.` };
  const def = getChallenge(e.challenge_id);
  if (!def?.memory || def.version !== e.challenge_version) return { ok: false, error: "Challenge was updated; start a new round." };
  const now = new Date();
  if (now > new Date(e.learn_expires_at)) {
    await db.from("memory_enrollments").update({ status: "expired" }).eq("id", e.id).eq("status", "learning");
    return { ok: false, error: "Time limit exceeded; the learn day expired. Start a new round." };
  }
  const result = def.verify(parseAnswer(input.answer), def.memory.learn(e.seed).expected);
  const due = new Date(now.getTime() + def.memory.days * DAY_MS);
  const closes = new Date(due.getTime() + def.memory.examWindowDays * DAY_MS);
  const { data: updated } = await db
    .from("memory_enrollments")
    .update({ status: "waiting", learned_at: now.toISOString(), learn_accuracy: result.accuracy, exam_due_at: due.toISOString(), exam_closes_at: closes.toISOString() })
    .eq("id", e.id)
    .eq("status", "learning")
    .select("id");
  if (!updated?.length) return { ok: false, error: "Learn day was already submitted." };
  await track(db, userId, "memory_learned", { accuracy: result.accuracy });
  const durationMs = now.getTime() - new Date(e.issued_at).getTime();
  return {
    ok: true,
    correct: result.correct,
    accuracy: result.accuracy,
    score: computeScore({ accuracy: result.accuracy, durationMs, timeLimitMs: def.timeLimitSeconds * 1000 }).score,
    lift: null,
    challenge_lift: null,
    lift_note: `Learn day recorded (quiz ${Math.round(result.accuracy * 100)}%). The exam opens ${due.toISOString()} and closes ${closes.toISOString()}: call get_challenge("${def.id}") again then, in a new session.`,
    duration_seconds: Math.round(durationMs / 1000),
    feedback: result.feedback,
    phase: "learn",
    exam_due_at: due.toISOString(),
    exam_closes_at: closes.toISOString(),
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
