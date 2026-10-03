import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArenaCard } from "@/components/arena-card";
import { BackButton } from "@/components/back-button";
import { PageShell } from "@/components/page-shell";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { getProfileCard } from "@/lib/cards";
import { getViewer } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const card = await getProfileCard(username);
  if (!card) return { title: "Not found · AI Build Arena" };
  const title = `${card.display_name ?? card.username}'s AI Build · AI Build Arena`;
  const description = `${card.passed} challenges passed · avg Lift ${card.avg_lift ?? "—"} · ${card.build?.base_model ?? "no build"}`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [card, viewer] = await Promise.all([getProfileCard(username), getViewer()]);
  if (!card) notFound();

  const isOwner = viewer?.username === card.username;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/u/${card.username}`;
  const text = isOwner ? `My AI build passed ${card.passed} challenges on AI Build Arena` : `Check out this AI build on AI Build Arena`;
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
