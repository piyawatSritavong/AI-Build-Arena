import Link from "next/link";
import { SpriteView } from "@/components/sprite";
import { fmt, signed } from "@/lib/cards";
import { createPublicClient } from "@/lib/supabase/public";
import { BackLink } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Leaderboard · SetupTier" };

const TABS = [
  { league: undefined, label: "Overall" },
  { league: "global", label: "Global" },
  { league: "thai", label: "Thai League" },
] as const;

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const { league: raw } = await searchParams;
  const league = raw === "global" || raw === "thai" ? raw : undefined;
  const [{ data: rows }, viewer] = await Promise.all([
    createPublicClient().rpc("leaderboard", { p_league: league, p_limit: 100 }),
    getViewer(),
  ]);

  return (
    <PageShell
      back={<BackLink href="/" label="Home" />}
      topRight={viewer && <Link href={`/u/${viewer.username}`} className={btnSecondary}>Your Card</Link>}
      footerLeft={<Link href="/trend" className={btnSecondary}>60s Trend Check</Link>}
      footerRight={
        viewer ? (
          <Link href="/me" className={btnPrimary}>My build →</Link>
        ) : (
          <Link href="/login?next=/me" className={btnPrimary}>Join the Arena →</Link>
        )
      }
    >
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <nav className="flex gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.label}
            href={t.league ? `/leaderboard?league=${t.league}` : "/leaderboard"}
            className={`rounded-full px-3 py-1 ${t.league === league ? "bg-foreground text-background" : "border border-foreground/20"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {!rows?.length ? (
        <p className="opacity-70">No passed challenges yet. Join, connect your AI and be the first on the board.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2">#</th>
                <th>Builder</th>
                <th>Model</th>
                <th className="text-right">Passed</th>
                <th className="text-right">Score</th>
                <th className="text-right">Avg Lift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {rows.map((r) => (
                <tr key={r.username}>
                  <td className="py-2">{r.rank}</td>
                  <td>
                    <Link href={`/u/${r.username}`} className="flex items-center gap-2 hover:underline">
                      <SpriteView id={r.sprite_id} px={2} />
                      {r.display_name ?? r.username}
                    </Link>
                  </td>
                  <td className="opacity-70">{r.base_model ?? "—"}</td>
                  <td className="text-right">{r.passed}</td>
                  <td className="text-right">{fmt(r.total_score, 0)}</td>
                  <td className="text-right">{signed(r.avg_lift)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </PageShell>
  );
}
