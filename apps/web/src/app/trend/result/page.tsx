import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { readTrendStats, statsQuery } from "./stats";
import { pageMeta } from "@/lib/site";

export async function generateMetadata({ searchParams }: PageProps<"/trend/result">): Promise<Metadata> {
  const s = readTrendStats(await searchParams);
  // Shared result cards: rich previews on social, but one URL per stats combo, so keep them out of the index.
  return pageMeta({
    title: `Meta Sync ${s.sync}% · Trend Check`,
    description: `This AI setup is ${s.sync}% in sync with the current meta, carrying ${s.hype} hype and ${s.fading} fading tools. Check yours in 60 seconds.`,
    path: `/trend/result?${statsQuery(s)}`,
    images: [{ url: `/api/og/trend?${statsQuery(s)}`, width: 1200, height: 630 }],
    noindex: true,
  });
}

export default async function TrendResultPage({ searchParams }: PageProps<"/trend/result">) {
  const s = readTrendStats(await searchParams);
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/trend/result?${statsQuery(s)}`;
  const text = `My AI setup: Meta Sync ${s.sync}%, carrying ${s.hype} hype + ${s.fading} fading tools. Check yours in 60s:`;
  return (
    <PageShell
      width="max-w-2xl"
      back={<BackLink href="/trend" label="Trend Check" />}
      footerLeft={<Link href="/login?next=/me" className={btnSecondary}>Measure your Lift</Link>}
      footerRight={
        <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
          Share on X →
        </a>
      }
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Your Trend Check card</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/og/trend?${statsQuery(s)}`} alt={`Meta Sync ${s.sync}%`} className="w-full rounded-xl border border-foreground/10" />
        <p className="text-sm opacity-70">The card shows counts only, never your tool names.</p>
      </div>
    </PageShell>
  );
}
