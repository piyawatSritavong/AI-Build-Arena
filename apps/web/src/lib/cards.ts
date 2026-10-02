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
