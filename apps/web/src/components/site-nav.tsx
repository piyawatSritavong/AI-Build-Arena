import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "./back-button";

const btn = "rounded-md border border-foreground/15 px-3 py-1.5 text-sm hover:bg-foreground/5";

export async function SiteNav() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("username").eq("id", userId).maybeSingle()
    : { data: null };
  const cardHref = profile ? `/u/${profile.username}` : "/login?next=/me";

  return (
    <nav aria-label="Site" className="sticky top-0 z-10 border-b border-foreground/10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-4 py-2">
        <BackButton className={btn} />
        <Link href="/" className={btn}>
          กลับหน้าหลัก
        </Link>
        <Link href={cardHref} className={btn}>
          Your Card
        </Link>
        <Link href="/leaderboard" className={btn}>
          Leaderboard
        </Link>
      </div>
    </nav>
  );
}
