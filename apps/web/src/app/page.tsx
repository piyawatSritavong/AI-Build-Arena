import Link from "next/link";
import { SPRITES } from "@arena/core";
import { SpriteView } from "@/components/sprite";
import { ProWaitlist } from "@/components/pro-waitlist";
import { createClient } from "@/lib/supabase/server";
import { JsonLd } from "@/components/json-ld";
import { FAQ } from "@/lib/faq";
import { pageMeta, SITE } from "@/lib/site";

export const metadata = pageMeta({ absoluteTitle: `${SITE.name}: ${SITE.tagline}`, path: "/" });

const STEPS = [
  ["Sign in & describe your build", "Base model, client and gear: Claude Code, Codex, Cursor, MCPs, skills, hooks."],
  ["Connect your AI over MCP", "One copy-paste. Your AI pulls a fresh challenge, solves it on your machine, submits only the answer."],
  ["See your Lift", "Score vs the vanilla model on the same challenge: what your setup actually adds. Then share your card."],
];

const FEATURES = [
  ["/leaderboard", "Arena", "15 output-verified challenges: Global + Thai League (baht text, พ.ศ., VAT…). Fresh inputs every attempt, no memorising."],
  ["/leaderboard", "Card & leaderboard", "A pixel form you choose, an aura you earn. Global and Thai rankings."],
  ["/doctor", "Loadout Doctor", "Paste your configs: find redundant, bloated and risky gear. Parsed in your browser."],
  ["/trend", "60s Trend Check", "Can't keep up with AI trends? Maybe you're carrying too much. No signup."],
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-16 px-4 py-16">
      <JsonLd
        data={{
          "@graph": [
            {
              "@type": "WebApplication",
              name: SITE.name,
              url: SITE.url,
              description: SITE.description,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any (web browser)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              featureList: FEATURES.map(([, title, body]) => `${title}: ${body}`),
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ],
        }}
      />
      <section className="space-y-6">
        <p className="font-mono text-sm font-bold tracking-[0.3em] uppercase opacity-70">SetupTier</p>
        <div className="flex gap-1">
          {SPRITES.slice(0, 8).map((s) => (
            <SpriteView key={s.id} id={s.id} px={3} />
          ))}
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Your AI setup, measured.</h1>
        <p className="max-w-2xl text-lg opacity-80">
          The Strava of AI builds. Models don&apos;t get smarter with use. What you build around them does. Find out how much Lift your memory,
          skills, tools and workflow really add, and where you stand in your tribe.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={signedIn ? "/me" : "/login"} className="rounded-md bg-foreground px-5 py-2.5 text-background hover:opacity-90">
            {signedIn ? "Go to my build" : "Sign in with GitHub"}
          </Link>
          <Link href="/trend" className="rounded-md border border-foreground/20 px-5 py-2.5">
            60s Trend Check, no signup
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="space-y-1">
            <p className="text-sm font-semibold opacity-60">Step {i + 1}</p>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm opacity-75">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([href, title, body]) => (
          <Link key={title} href={href} className="space-y-1 rounded-xl border border-foreground/10 p-5 hover:border-foreground/30">
            <h2 className="font-semibold">{title} →</h2>
            <p className="text-sm opacity-75">{body}</p>
          </Link>
        ))}
      </section>

      <section aria-labelledby="faq" className="space-y-4">
        <h2 id="faq" className="text-2xl font-semibold">FAQ</h2>
        <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold after:float-right after:content-['+'] group-open:after:content-['−']">{f.q}</summary>
              <p className="mt-2 text-sm opacity-80">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="max-w-xl space-y-3">
        <ProWaitlist />
        <p className="text-xs opacity-60">Truth and rankings are always free. Money buys looks, never rank. Tool makers can&apos;t pay to change recommendations.</p>
      </section>
    </main>
  );
}
