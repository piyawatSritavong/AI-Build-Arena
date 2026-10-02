import type { Metadata } from "next";
import Link from "next/link";
import { readTrendStats, statsQuery } from "./stats";

export async function generateMetadata({ searchParams }: PageProps<"/trend/result">): Promise<Metadata> {
  const s = readTrendStats(await searchParams);
  const title = `Meta Sync ${s.sync}% · AI Build Arena Trend Check`;
  const images = [{ url: `/api/og/trend?${statsQuery(s)}`, width: 1200, height: 630 }];
  return { title, openGraph: { title, images }, twitter: { card: "summary_large_image", title, images } };
}

export default async function TrendResultPage({ searchParams }: PageProps<"/trend/result">) {
  const s = readTrendStats(await searchParams);
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/trend/result?${statsQuery(s)}`;
  const text = `My AI setup: Meta Sync ${s.sync}%, carrying ${s.hype} hype + ${s.fading} fading tools. Check yours in 60s:`;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/og/trend?${statsQuery(s)}`} alt={`Meta Sync ${s.sync}%`} className="w-full rounded-xl border border-foreground/10" />
      <div className="flex flex-wrap justify-center gap-3 text-sm">
        <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="rounded-md bg-foreground px-4 py-2 text-background">
          Share on X
        </a>
        <Link href="/trend" className="rounded-md border border-foreground/20 px-4 py-2">
          Run your own Trend Check
        </Link>
      </div>
    </main>
  );
}
