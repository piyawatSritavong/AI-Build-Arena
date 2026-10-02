import { PROVEN_CAPABILITIES } from "@arena/loadout";

const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Number.parseInt(String(v ?? 0), 10) || 0));

/** Share cards carry counts only (no tool names) so links reveal nothing about the setup. */
export function readTrendStats(q: Record<string, string | string[] | undefined>) {
  return {
    sync: int(q.s, 100),
    proven: int(q.p, PROVEN_CAPABILITIES.length),
    provenTotal: PROVEN_CAPABILITIES.length,
    hype: int(q.h, 99),
    fading: int(q.f, 99),
    gems: int(q.g, 99),
  };
}
export const statsQuery = (s: ReturnType<typeof readTrendStats>) => `s=${s.sync}&p=${s.proven}&h=${s.hype}&f=${s.fading}&g=${s.gems}`;
