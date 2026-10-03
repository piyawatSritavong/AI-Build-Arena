import type { ProfileCard } from "@arena/core";
import { createPublicClient } from "@/lib/supabase/public";

export async function getProfileCard(username: string): Promise<ProfileCard | null> {
  const { data, error } = await createPublicClient().rpc("profile_card", { p_username: username });
  if (error || !data) return null;
  return data as unknown as ProfileCard;
}

export const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : Number(n).toFixed(digits));
export const signed = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}`);

export const rankLabel = (card: { global_rank: number | null; thai_rank: number | null }) =>
  [card.global_rank && `#${card.global_rank}`, card.thai_rank && `TH #${card.thai_rank}`].filter(Boolean).join(" · ") || "—";

/** Reliability as a whole percent ("≥" because it is the lower bound of the pass rate). */
export const reliabilityLabel = (card: Pick<ProfileCard, "reliability">) => (card.reliability === null ? "—" : `${Math.round(Number(card.reliability))}%`);

const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
/** ×N vs the community median for the model when known, otherwise raw tokens per pass. */
export const efficiencyLabel = (card: Pick<ProfileCard, "efficiency" | "tokens_per_pass">) =>
  card.efficiency !== null ? `×${Number(card.efficiency).toFixed(1)}` : card.tokens_per_pass !== null ? `${kTokens(Number(card.tokens_per_pass))} tok` : "—";

/** One line under the numbers: what was measured and how far to trust it. */
export function cardFootnote(card: ProfileCard, liftTrustLabel: string | null) {
  const parts = [
    liftTrustLabel
      ? `Lift: vs the same client with nothing added (−100…+100), ${liftTrustLabel}, ${card.lift_challenges} challenge${card.lift_challenges === 1 ? "" : "s"}.`
      : "Lift appears after a Stock run (the same client with nothing added).",
    card.reliability !== null
      ? `Reliability: pass rate lower bound (95%) over ${card.reliability_runs} runs.`
      : "Reliability appears after running a challenge 3+ times.",
    card.efficiency !== null
      ? `Efficiency: ${Number(card.efficiency) >= 1 ? "fewer" : "more"} tokens per pass than the median for this model${card.tokens_verified ? ", CLI-measured" : ", self-reported"}.`
      : card.tokens_per_pass !== null
        ? `Efficiency: tokens per pass${card.tokens_verified ? " (CLI-measured)" : " (self-reported)"}; the ×N comparison needs 5 passes by others on this model.`
        : "Efficiency appears once passes report tokens.",
  ];
  if (card.range !== null) parts.push(`Range ${fmt(card.range, 0)}/100: categories passed, weighted by difficulty.`);
  const extras = [card.seconds_per_pass !== null && `${fmt(card.seconds_per_pass, 0)}s per pass`, card.cost_per_pass !== null && `~$${Number(card.cost_per_pass).toFixed(3)} per pass`].filter(Boolean);
  return [...parts, extras.length ? `${extras.join(" · ")}.` : ""].join(" ");
}
