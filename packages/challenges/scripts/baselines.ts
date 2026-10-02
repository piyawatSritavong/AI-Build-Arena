// Measure vanilla-model baselines (no tools, no memory, single shot) for Lift.
//   pnpm --filter @arena/challenges baselines -- --models claude-opus-5-5,claude-haiku-4-5 --runs 3 [--challenges a,b] [--dry-run]
// --dry-run answers with the expected output (no API calls, no DB writes) to exercise the pipeline.
// Env: ANTHROPIC_API_KEY (or ant profile), SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Refusal fallbacks are deliberately NOT enabled: a fallback model answering would contaminate the baseline.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import type { Database } from "@arena/db";
import { challenges, computeScore } from "../src/index";

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-4-5" },
    runs: { type: "string", default: "3" },
    challenges: { type: "string" },
    effort: { type: "string", default: "high" },
    concurrency: { type: "string", default: "4" },
    "dry-run": { type: "boolean", default: false },
  },
});
const models = args.models!.split(",");
const runs = Number(args.runs);
const dryRun = args["dry-run"]!;
const selected = args.challenges ? challenges.filter((c) => args.challenges!.split(",").includes(c.id)) : challenges;
// Haiku 4.5 rejects `effort`; Claude 5.x models accept it (Opus 5.5 defaults to medium, so set it explicitly).
const supportsEffort = (model: string) => !model.startsWith("claude-haiku-4");

const anthropic = dryRun ? null : new Anthropic();
const SYSTEM = "You are answering a programming puzzle with no tools: you cannot run code. Work it out yourself, then reply with ONLY the final answer in the exact JSON format requested — no explanation, no code fences.";

function extractJson(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

type RunResult = { challengeId: string; model: string; correct: boolean; score: number; durationMs: number; inTok: number; outTok: number; error?: string };

async function runOnce(def: (typeof challenges)[number], model: string, run: number): Promise<RunResult> {
  const { input, expected } = def.generate(`baseline:${model}:${run}:${Date.now()}`);
  const started = Date.now();
  let answer: unknown = expected;
  let inTok = 0, outTok = 0, error: string | undefined;
  if (anthropic) {
    try {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 64000,
        system: SYSTEM,
        ...(supportsEffort(model) ? { output_config: { effort: args.effort as "low" | "medium" | "high" | "xhigh" | "max" } } : {}),
        messages: [{ role: "user", content: `${def.prompt}\n\nInput (JSON):\n${JSON.stringify(input)}` }],
      });
      const msg = await stream.finalMessage();
      inTok = msg.usage.input_tokens;
      outTok = msg.usage.output_tokens;
      if (msg.stop_reason === "refusal") error = `refusal (${msg.stop_details?.category ?? "unknown"})`;
      else if (msg.stop_reason === "max_tokens") error = "max_tokens";
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      answer = error ? null : extractJson(text);
    } catch (e) {
      error = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : String(e);
      answer = null;
    }
  }
  const durationMs = Date.now() - started;
  const v = def.verify(answer, expected);
  const { score } = computeScore({ accuracy: v.accuracy, durationMs, timeLimitMs: def.timeLimitSeconds * 1000 });
  return { challengeId: def.id, model, correct: v.correct, score, durationMs, inTok, outTok, error };
}

async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]!();
    }
  }));
  return out;
}

const jobs = selected.flatMap((def) => models.flatMap((model) => Array.from({ length: runs }, (_, r) => () => runOnce(def, model, r))));
console.log(`${dryRun ? "[dry-run] " : ""}${jobs.length} runs: ${selected.length} challenges × ${models.length} models × ${runs}`);
const results = await pool(jobs, Number(args.concurrency));

const rows: Database["public"]["Tables"]["baselines"]["Insert"][] = [];
for (const def of selected) {
  for (const model of models) {
    const rs = results.filter((r) => r.challengeId === def.id && r.model === model);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    rows.push({
      challenge_id: def.id,
      model,
      runs: rs.length,
      pass_rate: Math.round((rs.filter((r) => r.correct).length / rs.length) * 10_000) / 10_000,
      avg_score: Math.round(avg(rs.map((r) => r.score)) * 100) / 100,
      avg_duration_ms: Math.round(avg(rs.map((r) => r.durationMs))),
      measured_at: new Date().toISOString(),
    });
    const errs = rs.flatMap((r) => (r.error ? [r.error] : []));
    console.log(`${def.id.padEnd(20)} ${model.padEnd(18)} pass ${rows.at(-1)!.pass_rate} score ${rows.at(-1)!.avg_score}${errs.length ? `  errors: ${errs.join("; ")}` : ""}`);
  }
}
const tokens = results.reduce((a, r) => ({ in: a.in + r.inTok, out: a.out + r.outTok }), { in: 0, out: 0 });
console.log(`tokens: ${tokens.in} in / ${tokens.out} out`);

if (!dryRun) {
  const db = createClient<Database>((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { error } = await db.from("baselines").upsert(rows);
  if (error) throw error;
  console.log(`upserted ${rows.length} baselines`);
}
