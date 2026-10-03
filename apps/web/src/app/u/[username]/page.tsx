import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArenaCard } from "@/components/arena-card";
import { getProfileCard } from "@/lib/cards";

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
  const card = await getProfileCard(username);
  if (!card) notFound();

  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/u/${card.username}`;
  const text = `My AI build passed ${card.passed} challenges on AI Build Arena`;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-4 py-10">
      <ArenaCard card={card} />
      <div className="flex gap-3 text-sm">
        <a
          className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share on X
        </a>
      </div>
    </main>
  );
}
