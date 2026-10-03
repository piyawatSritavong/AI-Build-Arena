"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/pro/actions";
import { capture } from "@/components/analytics";

const FREE_PERKS = [
  "15 output-verified challenges, Global + Thai League",
  "Your Lift vs the stock client",
  "Pixel card, aura and leaderboard rank",
  "Trend Check + Loadout Doctor",
  "Claude Code, Codex, Cursor over MCP",
];
const PRO_PERKS = ["Everything in Free", "Impact + unlimited ablation tests", "Detailed Gap analysis + Catch-up Quests", "Full history & portfolio export", "Multiple builds"];

// Willingness-to-pay survey: the chosen price is what the waitlist records (0 = free only).
const PRICES = [
  { value: "5", label: "$5" },
  { value: "9", label: "$9" },
  { value: "15", label: "$15" },
  { value: "0", label: "Free only" },
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-0.5 h-4 w-4 shrink-0">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ name, header, featured, blurb, price, action, perks }: {
  name: string;
  header?: ReactNode;
  featured?: boolean;
  blurb: string;
  price: ReactNode;
  action: ReactNode;
  perks: string[];
}) {
  return (
    <div className={`flex flex-col rounded-2xl ${featured ? "bg-foreground/[0.04] shadow-xl shadow-black/10 ring-1 ring-foreground/15 dark:shadow-black/40" : "bg-foreground/[0.03] ring-1 ring-foreground/10"}`}>
      <div
        className={`relative flex items-center justify-between overflow-hidden rounded-t-2xl px-5 pt-4 pb-7 ${featured ? "bg-[linear-gradient(120deg,#4c1d95,#1e3a8a_55%,#0e7490)] text-white" : ""}`}
      >
        {featured && (
          <span
            aria-hidden
            className="absolute inset-0 opacity-25 [background-image:linear-gradient(#fff3_1px,transparent_1px),linear-gradient(90deg,#fff3_1px,transparent_1px)] [background-size:12px_12px]"
          />
        )}
        <span className="relative text-lg font-semibold">{name}</span>
        {header && <span className="relative">{header}</span>}
      </div>
      <div className="-mt-3 flex flex-1 flex-col rounded-2xl bg-background p-4 ring-1 ring-foreground/10">
        <p className="min-h-10 px-1 text-sm opacity-75">{blurb}</p>
        <div className="mt-4 space-y-3 rounded-xl bg-foreground/[0.03] p-3 ring-1 ring-foreground/10">
          {price}
          {action}
        </div>
        <ul className="mt-5 space-y-2.5 px-1 text-sm">
          {perks.map((p) => (
            <li key={p} className="flex gap-2">
              <Check />
              <span className="opacity-85">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Price({ amount, note }: { amount: string; note: string }) {
  return (
    <div className="flex items-end gap-1.5 px-1">
      <span className="text-lg opacity-60">$</span>
      <span className="text-4xl leading-none font-semibold tracking-tight">{amount}</span>
      <span className="pb-0.5 text-[11px] leading-tight whitespace-pre opacity-60">{note}</span>
    </div>
  );
}

export function ProWaitlist({ signedIn = true }: { signedIn?: boolean }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});
  const [price, setPrice] = useState("9");
  const joined = state.status === "joined" || state.status === "already";

  return (
    <section aria-labelledby="plans" className="space-y-8">
      <div className="space-y-2 text-center">
        <h2 id="plans" className="text-3xl font-semibold tracking-tight">Choose your plan</h2>
        <p className="text-sm opacity-70">Free covers everything that decides your rank. Pro is coming; tell us what it&apos;s worth to you.</p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2 sm:items-start">
        <PlanCard
          name="Free"
          blurb="Measure your setup, get your card and climb the leaderboards."
          price={<Price amount="0" note={"USD /\nforever"} />}
          action={
            signedIn ? (
              <span className="flex w-full items-center justify-center rounded-lg bg-foreground/5 px-4 py-2 text-sm opacity-60">Your current plan</span>
            ) : (
              <Link href="/login?next=/me" className="flex w-full items-center justify-center rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15">
                Start free
              </Link>
            )
          }
          perks={FREE_PERKS}
        />

        <form action={action} onSubmit={() => capture("pro_waitlist_clicked", { price: Number(price) })}>
          <input type="hidden" name="price" value={price} />
          <PlanCard
            featured
            name="Pro"
            header={<span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium backdrop-blur">Coming soon</span>}
            blurb="Find out exactly which gear earns its place, and what to add next."
            price={
              <div className="space-y-3">
                <Price amount={price === "0" ? "0" : price} note={price === "0" ? "USD /\nfree only" : "USD /\nmonth"} />
                <div role="radiogroup" aria-label="What would you pay per month?" className="grid grid-cols-4 gap-1 rounded-lg bg-foreground/5 p-1">
                  {PRICES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={price === p.value}
                      disabled={joined}
                      onClick={() => setPrice(p.value)}
                      className={`rounded-md px-1 py-1 text-xs whitespace-nowrap transition ${price === p.value ? "bg-background font-semibold shadow-sm ring-1 ring-foreground/10" : "opacity-60 hover:opacity-100"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="px-1 text-[11px] opacity-55">What would you pay per month? Pick one, nothing is charged.</p>
              </div>
            }
            action={
              joined ? (
                <p className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <Check /> You&apos;re on the waitlist
                </p>
              ) : (
                <div className="space-y-2">
                  <button disabled={pending} className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">
                    {pending ? "Joining…" : "Join the Pro waitlist"}
                  </button>
                  {state.status === "signin" && (
                    <p className="px-1 text-xs">
                      <Link href="/login?next=/" className="underline">Sign in with GitHub</Link> to join, so we can tell you when it&apos;s ready.
                    </p>
                  )}
                  {state.status === "error" && <p className="px-1 text-xs text-red-500">Something went wrong. Try again.</p>}
                </div>
              )
            }
            perks={PRO_PERKS}
          />
        </form>
      </div>

      <p className="mx-auto max-w-xl text-center text-xs opacity-60">
        Truth and rankings are always free. Money buys looks, never rank. Tool makers can&apos;t pay to change recommendations.
      </p>
    </section>
  );
}
