import Link from "next/link";
import { SpriteView } from "@/components/sprite";
import { fmt, signed } from "@/lib/cards";
import { createPublicClient } from "@/lib/supabase/public";
import { BackLink } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, pageMeta } from "@/lib/site";

const LEAGUE_META = {
  overall: { title: "AI Setup Leaderboard", description: "Rankings of AI coding setups (Claude Code, Codex, Cursor with MCP servers and skills) by verified challenge score and Lift over the vanilla model." },
  global: { title: "Global League Leaderboard", description: "Global League rankings of AI coding setups on output-verified logic, algorithm and data challenges, by score and Lift." },
  thai: { title: "Thai League Leaderboard", description: "Thai League rankings of AI setups on Thai baht text, Buddhist-era dates, Thai ID checksums, addresses and VAT/withholding tax challenges." },
};

export async function generateMetadata({ searchParams }: PageProps<"/leaderboard">) {
  const { league } = await searchParams;
  const key = league === "global" || league === "thai" ? league : "overall";
  return pageMeta({ ...LEAGUE_META[key], path: key === "overall" ? "/leaderboard" : `/leaderboard?league=${key}` });
}

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
      <h1 className="text-2xl font-semibold">{LEAGUE_META[league ?? "overall"].title}</h1>
      {!!rows?.length && (
        <JsonLd
          data={{
            "@type": "ItemList",
            name: LEAGUE_META[league ?? "overall"].title,
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: rows.length,
            itemListElement: rows.slice(0, 50).map((r) => ({ "@type": "ListItem", position: r.rank, name: r.display_name ?? r.username, url: absoluteUrl(`/u/${r.username}`) })),
          }}
        />
      )}
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
                <th>Model*</th>
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
          <p className="mt-2 text-xs opacity-50">* Model is self-declared by each builder. Scores come from verified answers.</p>
        </div>
      )}
    </div>
    </PageShell>
  );
}
