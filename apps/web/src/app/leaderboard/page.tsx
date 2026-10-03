import Link from "next/link";
import { LEAGUES, leagueInfo, liftTrust, PROFESSIONS, type League, type LiftTrust } from "@arena/core";
import { SpriteView } from "@/components/sprite";
import { efficiencyLabel, fmt, reliabilityLabel, signed } from "@/lib/cards";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { createPublicClient } from "@/lib/supabase/public";
import { BackLink } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, pageMeta } from "@/lib/site";

const OVERALL_META = {
  title: "AI Setup Leaderboard",
  description: "Rankings of AI coding setups (Claude Code, Codex, Cursor with MCP servers and skills) by verified challenge score and Lift over the same client with nothing added.",
};
const leagueMeta = (id: League | undefined) => {
  const l = id && leagueInfo(id);
  if (!l) return OVERALL_META;
  return {
    title: l.kind === "global" ? "Global League Leaderboard" : `${l.name} Leaderboard`,
    description: `${l.name} rankings of AI setups: ${l.description} By score, Lift, Reliability, Efficiency and Range.`,
  };
};
const parseLeague = (v: string | undefined) => (v && leagueInfo(v) ? (v as League) : undefined);

export async function generateMetadata({ searchParams }: PageProps<"/leaderboard">) {
  const league = parseLeague(one((await searchParams).league));
  return pageMeta({ ...leagueMeta(league), path: league ? `/leaderboard?league=${league}` : "/leaderboard" });
}

const TABS = [{ league: undefined, label: "Overall" }, ...LEAGUES.map((l) => ({ league: l.id as League, label: l.name }))];

const SORTS = [
  { id: "score", label: "Score" },
  { id: "lift", label: "Lift" },
  { id: "reliability", label: "Reliability" },
  { id: "efficiency", label: "Efficiency" },
  { id: "range", label: "Range" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

const DIVISIONS = [
  { id: undefined, label: "All", hint: "" },
  { id: "duo", label: "Duo", hint: "You + your AI through the MCP connector. Results are self-reported." },
  { id: "autonomous", label: "Autonomous", hint: "Your AI alone, run and measured by the setuptier CLI. Lift counts verified pairs only." },
] as const;
type Division = "duo" | "autonomous";

type Filters = { league?: League; sort: Sort; division?: Division; model?: string; profession?: string };

function href(f: Filters, change: Partial<Filters>) {
  const next = { ...f, ...change };
  const q = new URLSearchParams();
  if (next.league) q.set("league", next.league);
  if (next.sort !== "score") q.set("sort", next.sort);
  if (next.division) q.set("division", next.division);
  if (next.model) q.set("model", next.model);
  if (next.profession) q.set("profession", next.profession);
  const qs = q.toString();
  return qs ? `/leaderboard?${qs}` : "/leaderboard";
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pill = (active: boolean) => `rounded-full px-3 py-1 ${active ? "bg-foreground text-background" : "border border-foreground/20 hover:bg-foreground/5"}`;

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const sp = await searchParams;
  const rawLeague = one(sp.league);
  const rawSort = one(sp.sort);
  const rawDivision = one(sp.division);
  const rawProfession = one(sp.profession);
  const f: Filters = {
    league: parseLeague(rawLeague),
    sort: SORTS.some((x) => x.id === rawSort) ? (rawSort as Sort) : "score",
    division: rawDivision === "duo" || rawDivision === "autonomous" ? rawDivision : undefined,
    model: one(sp.model)?.slice(0, 80) || undefined,
    profession: PROFESSIONS.some((p) => p.id === rawProfession) ? rawProfession : undefined,
  };
  const db = createPublicClient();
  const [{ data: rows }, { data: models }, { data: factors }, viewer] = await Promise.all([
    db.rpc("leaderboard", {
      p_league: f.league,
      p_limit: 100,
      p_sort: f.sort,
      p_model: f.model,
      p_source: f.division === "duo" ? "mcp" : f.division === "autonomous" ? "cli" : undefined,
      p_profession: f.profession,
    }),
    db.rpc("leaderboard_models"),
    db.rpc("league_factors"),
    getViewer(),
  ]);
  const division = DIVISIONS.find((d) => d.id === f.division)!;
  const filtered = Boolean(f.division || f.model || f.profession);
  // Phones show the sorted number and Lift; the other metrics appear from the sm breakpoint.
  const col = (id: Sort) => (f.sort === id ? "font-semibold" : id === "lift" ? "" : "hidden sm:table-cell");

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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{leagueMeta(f.league).title}</h1>
      {!!rows?.length && !filtered && f.sort === "score" && (
        <JsonLd
          data={{
            "@type": "ItemList",
            name: leagueMeta(f.league).title,
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: rows.length,
            itemListElement: rows.slice(0, 50).map((r, i) => ({ "@type": "ListItem", position: r.rank ?? i + 1, name: r.display_name ?? r.username, url: absoluteUrl(`/u/${r.username}`) })),
          }}
        />
      )}
      <div className="space-y-3 text-sm">
        <nav aria-label="League" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.label} href={href(f, { league: t.league })} className={pill(t.league === f.league)}>
              {t.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort by" className="flex flex-wrap items-center gap-2">
          <span className="opacity-60">Sort</span>
          {SORTS.map((x) => (
            <Link key={x.id} href={href(f, { sort: x.id })} className={pill(x.id === f.sort)}>
              {x.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Division" className="flex flex-wrap items-center gap-2">
          <span className="opacity-60">Division</span>
          {DIVISIONS.map((d) => (
            <Link key={d.label} href={href(f, { division: d.id })} className={pill(d.id === f.division)} title={d.hint || undefined}>
              {d.label}
            </Link>
          ))}
        </nav>
        <form action="/leaderboard" className="flex flex-wrap items-center gap-2">
          {f.league && <input type="hidden" name="league" value={f.league} />}
          {f.sort !== "score" && <input type="hidden" name="sort" value={f.sort} />}
          {f.division && <input type="hidden" name="division" value={f.division} />}
          <label className="flex items-center gap-2">
            <span className="opacity-60">Model</span>
            <AutoSubmitSelect name="model" defaultValue={f.model ?? ""} className="rounded-lg border border-foreground/20 bg-background px-2 py-1">
              <option value="">Open class (all models)</option>
              {(models ?? []).map((m) => (
                <option key={m.base_model} value={m.base_model}>
                  Same-Breed: {m.base_model} ({m.builders})
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
          <label className="flex items-center gap-2">
            <span className="opacity-60">Profession</span>
            <AutoSubmitSelect name="profession" defaultValue={f.profession ?? ""} className="rounded-lg border border-foreground/20 bg-background px-2 py-1">
              <option value="">Everyone</option>
              {PROFESSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
          <noscript>
            <button className="rounded-lg border border-foreground/20 px-2 py-1">Apply</button>
          </noscript>
          {filtered && (
            <Link href={href(f, { division: undefined, model: undefined, profession: undefined })} className="underline opacity-70">
              Clear filters
            </Link>
          )}
        </form>
        {division.hint && <p className="text-xs opacity-60">{division.hint}</p>}
        {!f.league && f.sort === "score" && <ScaleNote factors={factors ?? []} />}
      </div>
      {!rows?.length ? (
        <p className="opacity-70">{filtered ? "Nobody matches these filters yet." : "No passed challenges yet. Join, connect your AI and be the first on the board."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm [&_td]:px-2 [&_td:first-child]:pl-0 [&_th]:px-2 [&_th:first-child]:pl-0">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2">#</th>
                <th>Builder</th>
                <th className="hidden lg:table-cell">Model*</th>
                <th className="hidden text-right sm:table-cell">Passed</th>
                <th className={`text-right ${col("score")}`}>Score</th>
                <th className={`text-right ${col("lift")}`}>Lift</th>
                <th className={`text-right ${col("reliability")}`}>Rel.</th>
                <th className={`text-right ${col("efficiency")}`}>Eff.</th>
                <th className={`text-right ${col("range")}`}>Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {rows.map((r) => (
                <tr key={r.username}>
                  <td className="py-2">{r.rank ?? "–"}</td>
                  <td>
                    <Link href={`/u/${r.username}`} className="flex items-center gap-2 hover:underline">
                      <SpriteView id={r.sprite_id} px={2} />
                      <span className="leading-tight">
                        {r.display_name ?? r.username}
                        <span className="block text-xs opacity-60 lg:hidden">{r.base_model ?? "—"}*</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden opacity-70 lg:table-cell">{r.base_model ?? "—"}</td>
                  <td className="hidden text-right sm:table-cell">{r.passed}</td>
                  <td className={`text-right ${col("score")}`}>{fmt(r.total_score, 0)}</td>
                  <td className={`text-right ${col("lift")}`}>
                    {signed(r.avg_lift)}
                    {r.lift_challenges > 0 && <LiftMark trust={liftTrust({ lift_challenges: r.lift_challenges, lift_verified: r.lift_verified, lift_own: r.lift_own })} />}
                  </td>
                  <td className={`text-right ${col("reliability")}`}>{reliabilityLabel(r)}</td>
                  <td className={`text-right ${col("efficiency")}`}>{efficiencyLabel({ efficiency: r.efficiency, tokens_per_pass: r.tokens_per_pass })}</td>
                  <td className={`text-right ${col("range")}`}>{fmt(r.range, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs opacity-50">
            Lift = how much a setup beats the same client with nothing added (Stock), −100 to +100. ✓ CLI-verified · † vs community median (no own Stock run yet) · no mark = self-reported.
            Rel. = pass-rate lower bound over challenges run 3+ times. Eff. = ×N fewer tokens per pass than the median for the model (or tokens per pass).
            Range = how many challenge categories are passed, weighted by the hardest difficulty passed (0–100). – = not measured yet.
            <br />* Model is self-declared by each builder. Scores come from verified answers.
          </p>
        </div>
      )}
    </div>
    </PageShell>
  );
}

function LiftMark({ trust }: { trust: LiftTrust | null }) {
  if (trust === "verified") return <span title="CLI-verified" className="ml-1 text-emerald-500">✓</span>;
  if (trust === "community") return <span title="vs community median" className="ml-1 opacity-60">†</span>;
  return null;
}

/** How Overall adds leagues together: each regional league's scores × its anchor factor. */
function ScaleNote({ factors }: { factors: { league: string; factor: number; builders: number }[] }) {
  const regional = factors.filter((f) => leagueInfo(f.league)?.kind === "regional");
  if (!regional.length) return null;
  return (
    <p className="text-xs opacity-60">
      Overall puts every league on the Global scale with anchor challenges (played in every league):{" "}
      {regional
        .map((f) => `${leagueInfo(f.league)!.name} ×${Number(f.factor).toFixed(2)}${f.builders < 5 ? ` (needs 5 builders on both, ${f.builders} so far)` : ` (${f.builders} builders)`}`)
        .join(" · ")}
      .
    </p>
  );
}
