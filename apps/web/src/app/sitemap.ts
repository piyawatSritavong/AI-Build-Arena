import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

const STATIC: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/leaderboard", priority: 0.9, changeFrequency: "daily" },
  { path: "/trend", priority: 0.8, changeFrequency: "weekly" },
  { path: "/doctor", priority: 0.8, changeFrequency: "monthly" },
];

/** Public cards of ranked builders only: unranked cards are thin pages and stay out of the index. */
async function rankedUsernames(): Promise<string[]> {
  try {
    const { data } = await createPublicClient().rpc("leaderboard", { p_limit: 1000 });
    return [...new Set((data ?? []).filter((r) => r.passed > 0).map((r) => r.username))];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const users = await rankedUsernames();
  return [
    ...STATIC.map((s) => ({ url: absoluteUrl(s.path), lastModified: now, changeFrequency: s.changeFrequency, priority: s.priority })),
    ...users.map((u) => ({ url: absoluteUrl(`/u/${encodeURIComponent(u)}`), lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
