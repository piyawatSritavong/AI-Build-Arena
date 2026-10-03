import { GEAR } from "@arena/loadout";
import { TrendClient } from "./trend-client";

export const metadata = { title: "Trend Check · SetupTier", description: "Can't keep up with AI trends? Maybe you're carrying too much. 60-second check, no signup." };

const KNOWN = new Set(GEAR.map((g) => g.id));

export default async function TrendPage({ searchParams }: PageProps<"/trend">) {
  const { ids } = await searchParams;
  const initial = typeof ids === "string" ? ids.split(",").filter((id) => KNOWN.has(id)) : [];
  return <TrendClient initial={initial} />;
}
