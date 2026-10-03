import { GEAR } from "@arena/loadout";
import { TrendClient } from "./trend-client";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "AI Tools Trend Check (60 seconds, no signup)",
  description: "Can't keep up with AI trends? Tick the AI coding tools, MCP servers and skills you use and see which are proven, which are hype and which are fading. 60 seconds, no signup.",
  path: "/trend",
});

const KNOWN = new Set(GEAR.map((g) => g.id));

export default async function TrendPage({ searchParams }: PageProps<"/trend">) {
  const { ids } = await searchParams;
  const initial = typeof ids === "string" ? ids.split(",").filter((id) => KNOWN.has(id)) : [];
  return <TrendClient initial={initial} />;
}
