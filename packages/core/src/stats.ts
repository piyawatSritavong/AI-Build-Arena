/**
 * Reliability: lower bound of the 95% Wilson interval for a pass rate, 0–100, so one lucky pass is not 100%.
 * Mirrors public.wilson_lower() in SQL.
 */
export function wilsonLower(passes: number, runs: number, z = 1.96): number | null {
  if (runs <= 0) return null;
  const p = passes / runs;
  const v = (p + (z * z) / (2 * runs) - z * Math.sqrt((p * (1 - p)) / runs + (z * z) / (4 * runs * runs))) / (1 + (z * z) / runs);
  return Math.round(Math.max(0, 100 * v) * 100) / 100;
}
