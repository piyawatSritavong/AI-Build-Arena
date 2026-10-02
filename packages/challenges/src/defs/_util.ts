import type { VerifyResult } from "@arena/core";
import type { Rng } from "../rng";

/** JSON with object keys sorted, for order-insensitive object comparison. */
export const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);
export const money = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;

const result = (hits: number, total: number): VerifyResult => ({ correct: total > 0 && hits === total, accuracy: total ? hits / total : 0 });

/** Whole-answer exact match. */
export function verifyExact(submitted: unknown, expected: unknown): VerifyResult {
  return result(same(submitted, expected) ? 1 : 0, 1);
}

/** Array answer, partial credit per position. */
export function verifyItems<T>(submitted: unknown, expected: T[], eq: (a: unknown, b: T) => boolean = same): VerifyResult {
  if (!Array.isArray(submitted) || submitted.length !== expected.length) {
    return { correct: false, accuracy: 0, feedback: `Expected a JSON array of ${expected.length} items.` };
  }
  return result(expected.filter((e, i) => eq(submitted[i], e)).length, expected.length);
}

/** Object answer, partial credit per key (extra keys count against you). */
export function verifyRecord<T>(submitted: unknown, expected: Record<string, T>, eq: (a: unknown, b: T) => boolean = same): VerifyResult {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) return { correct: false, accuracy: 0, feedback: "Expected a JSON object." };
  const sub = submitted as Record<string, unknown>;
  const keys = Object.keys(expected);
  const extra = Object.keys(sub).filter((k) => !(k in expected)).length;
  return result(keys.filter((k) => eq(sub[k], expected[k]!)).length, keys.length + extra);
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Round-half-up integer division for non-negative integers. */
export const roundDiv = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));
export const satangToBaht = (s: number) => s / 100;
