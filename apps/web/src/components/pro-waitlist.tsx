"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/pro/actions";
import { capture } from "@/components/analytics";

const PERKS = ["Impact + unlimited ablation tests", "Detailed Gap analysis + Catch-up Quests", "Full history & portfolio export", "Multiple builds"];

export function ProWaitlist() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});
  if (state.status === "joined" || state.status === "already") {
    return <p className="text-sm text-emerald-500">You&apos;re on the Pro waitlist. Truth and rankings stay free forever.</p>;
  }
  return (
    <form action={action} onSubmit={() => capture("pro_waitlist_clicked")} className="space-y-3 rounded-xl border border-foreground/15 p-4">
      <p className="font-semibold">Pro — coming soon</p>
      <ul className="list-inside list-disc text-sm opacity-80">
        {PERKS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-xs opacity-60">What would you pay per month?</legend>
        {[["5", "$5"], ["9", "$9"], ["15", "$15"], ["0", "Free only"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" name="price" value={v} defaultChecked={v === "9"} /> {l}
          </label>
        ))}
      </fieldset>
      <button disabled={pending} className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
        Join the Pro waitlist
      </button>
      {state.status === "signin" && (
        <p className="text-sm">
          <Link href="/login?next=/" className="underline">Sign in with GitHub</Link> to join (so we can tell you when it&apos;s ready).
        </p>
      )}
      {state.status === "error" && <p className="text-sm text-red-500">Something went wrong. Try again.</p>}
    </form>
  );
}
