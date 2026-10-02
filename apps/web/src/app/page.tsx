import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold tracking-tight">AI Build Arena</h1>
      <p className="text-lg opacity-80">
        The Strava of AI builds. Measure your setup, see your Lift over the vanilla model, and find your place in the tribe.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={signedIn ? "/me" : "/login"} className="rounded-md bg-foreground px-5 py-2.5 text-background hover:opacity-90">
          {signedIn ? "Go to my build" : "Sign in with GitHub"}
        </Link>
        <Link href="/leaderboard" className="rounded-md border border-foreground/20 px-5 py-2.5">
          Leaderboard
        </Link>
        <Link href="/trend" className="rounded-md border border-foreground/20 px-5 py-2.5">
          60s Trend Check
        </Link>
        <Link href="/doctor" className="rounded-md border border-foreground/20 px-5 py-2.5">
          Loadout Doctor
        </Link>
      </div>
    </main>
  );
}
