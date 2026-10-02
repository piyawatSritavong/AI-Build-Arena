import type { ScoreInput, ScoreResult } from "@arena/core";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** score = 100 × accuracy × (0.8 + 0.2 × speed); speed = remaining fraction of the time limit. */
export function computeScore({ accuracy, durationMs, timeLimitMs, baselineScore }: ScoreInput): ScoreResult {
  const acc = Math.min(1, Math.max(0, accuracy));
  const speed = Math.min(1, Math.max(0, 1 - durationMs / timeLimitMs));
  const score = round2(100 * acc * (0.8 + 0.2 * speed));
  return baselineScore === undefined ? { score } : { score, lift: round2(score - baselineScore) };
}
