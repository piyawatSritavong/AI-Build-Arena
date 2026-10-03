import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArenaCard } from "@/components/arena-card";
import { BackButton } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { efficiencyLabel, getProfileCard, rankLabel, reliabilityLabel, signed } from "@/lib/cards";
import { getViewer } from "@/lib/session";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, pageMeta } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const card = await getProfileCard(username);
  if (!card) return { title: "Builder not found", robots: { index: false } };
  const name = card.display_name ?? card.username;
  return pageMeta({
    title: `${name}'s AI setup (@${card.username})`,
    description: card.passed
      ? `${name}'s AI coding setup on SetupTier: ${card.build?.base_model ?? "unknown model"}, ${card.passed} challenges passed, Lift ${signed(card.avg_lift)}, reliability ${reliabilityLabel(card)}, efficiency ${efficiencyLabel(card)}, rank ${rankLabel(card)}.`
      : `${name}'s AI coding setup on SetupTier${card.build?.base_model ? ` (${card.build.base_model})` : ""}. No challenges passed yet.`,
    path: `/u/${card.username}`,
    images: [{ url: `/u/${card.username}/opengraph-image`, width: 1200, height: 630, alt: `${name}'s SetupTier card` }],
    // Cards with no passed challenge are thin pages: shareable, not indexed.
    noindex: card.passed === 0,
  });
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [card, viewer] = await Promise.all([getProfileCard(username), getViewer()]);
  if (!card) notFound();

  const isOwner = viewer?.username === card.username;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/u/${card.username}`;
  const text = isOwner ? `My AI build passed ${card.passed} challenges on SetupTier` : `Check out this AI build on SetupTier`;
  const shareHref = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <PageShell
      width="max-w-xl"
      back={<BackButton fallbackHref={isOwner ? "/me" : "/leaderboard"} />}
      topRight={
        <>
          {viewer && !isOwner && <Link href={`/u/${viewer.username}`} className={btnSecondary}>Your Card</Link>}
          <Link href="/leaderboard" className={btnSecondary}>Leaderboard</Link>
        </>
      }
      footerLeft={
        isOwner ? (
          <Link href="/me" className={btnSecondary}>Edit build</Link>
        ) : (
          <a href={shareHref} target="_blank" rel="noopener noreferrer" className={btnSecondary}>Share</a>
        )
      }
      footerRight={
        isOwner ? (
          <a href={shareHref} target="_blank" rel="noopener noreferrer" className={btnPrimary}>Share on X →</a>
        ) : viewer ? (
          <Link href={`/u/${viewer.username}`} className={btnPrimary}>Your Card →</Link>
        ) : (
          <Link href="/login?next=/me" className={btnPrimary}>Create your card →</Link>
        )
      }
    >
      <JsonLd
        data={{
          "@type": "ProfilePage",
          url: absoluteUrl(`/u/${card.username}`),
          mainEntity: {
            "@type": "Person",
            name: card.display_name ?? card.username,
            alternateName: `@${card.username}`,
            url: absoluteUrl(`/u/${card.username}`),
            ...(card.avatar_url && { image: card.avatar_url }),
            sameAs: [`https://github.com/${card.username}`],
          },
        }}
      />
      <h1 className="sr-only">{`${card.display_name ?? card.username}'s AI setup on SetupTier`}</h1>
      <div className="flex justify-center">
        <ArenaCard card={card} />
      </div>
      {isOwner && card.passed === 0 && (
        <p className="mt-4 text-center text-sm opacity-70">
          Your aura is still asleep. <Link href="/me#connect" className="underline">Connect your AI</Link> and pass a challenge to wake it.
        </p>
      )}
    </PageShell>
  );
}
