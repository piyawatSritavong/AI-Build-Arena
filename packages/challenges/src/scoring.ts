import type { ScoreInput, ScoreResult } from "@arena/core";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** score = 100 × accuracy × (0.8 + 0.2 × speed); speed = remaining fraction of the time limit. */
export function computeScore({ accuracy, durationMs, timeLimitMs }: ScoreInput): ScoreResult {
  const acc = Math.min(1, Math.max(0, accuracy));
  const speed = Math.min(1, Math.max(0, 1 - durationMs / timeLimitMs));
  return { score: round2(100 * acc * (0.8 + 0.2 * speed)) };
}

/**
 * Lift as normalized gain on the 0–100 score, from −100 to +100, so challenges of different difficulty compare:
 * Full ≥ base: share of the remaining headroom gained; Full < base: share of the baseline lost.
 * Mirrors public.normalized_gain() in SQL.
 */
export function normalizedGain(full: number, base: number): number {
  if (full >= base) return base >= 100 ? 0 : round2(((full - base) / (100 - base)) * 100);
  return round2(((full - base) / base) * 100);
}
