"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GEAR, TREND, trendCheck, type GearEntry } from "@arena/loadout";
import { capture } from "@/components/analytics";

const byCategory = Object.entries(
  GEAR.reduce<Record<string, GearEntry[]>>((acc, g) => ((acc[g.category] ??= []).push(g), acc), {}),
).sort(([a], [b]) => a.localeCompare(b));

function Bucket({ title, items, tone }: { title: string; items: GearEntry[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
      <ul className="space-y-1 text-sm">
        {items.map((g) => (
          <li key={g.id}>
            <b>{g.name}</b> <span className="opacity-70">— {TREND[g.id]?.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendClient({ initial }: { initial: string[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [done, setDone] = useState(initial.length > 0);
  const report = useMemo(() => trendCheck([...picked]), [picked]);
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const share = `/trend/result?s=${report.syncPct}&p=${report.capabilities.filter((c) => c.covered).length}&h=${report.hype.length}&f=${report.fading.length}&g=${report.gemsOwned.length}`;

  return (
    <div className="space-y-6">
      {!done && (
        <>
          <p className="text-sm opacity-80">Tick what you use (≈60 seconds). Nothing is sent anywhere.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {byCategory.map(([cat, items]) => (
              <fieldset key={cat} className="space-y-1">
                <legend className="text-xs font-semibold uppercase opacity-60">{cat}</legend>
                {items.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.has(g.id)} onChange={() => toggle(g.id)} />
                    {g.name}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <button onClick={() => (setDone(true), capture("trend_checked", { picked: picked.size, sync: report.syncPct }))} className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90">
            Check my trend fit
          </button>
        </>
      )}

      {done && (
        <section className="space-y-5">
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold">{report.syncPct}%</span>
            <span className="pb-1 opacity-70">Meta Sync — proven capabilities covered</span>
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {report.capabilities.map((c) => (
              <li key={c.id}>
                {c.covered ? "✅" : "⬜"} {c.label}
                {!c.covered && <span className="opacity-60"> — try {c.suggest.name}</span>}
              </li>
            ))}
          </ul>
          <Bucket title="🔥 Hype you're carrying (unmeasured)" items={report.hype} tone="text-amber-500" />
          <Bucket title="🍂 Fading — probably safe to drop" items={report.fading} tone="text-slate-400" />
          <Bucket title="💎 Hidden gems you already have" items={report.gemsOwned} tone="text-emerald-500" />
          <Bucket title="💎 Hidden gems to try" items={report.gemsToTry} tone="text-emerald-500" />
          <p className="text-xs opacity-60">Ratings are editorial v0 and get replaced by measured Lift as data accrues. Tool makers can&apos;t pay to change them.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={share} className="rounded-md bg-foreground px-4 py-2 text-background">
              Get share card
            </Link>
            <button onClick={() => setDone(false)} className="rounded-md border border-foreground/20 px-4 py-2">
              Edit my tools
            </button>
            <Link href="/doctor" className="rounded-md px-4 py-2 underline opacity-80">
              Deep scan with Loadout Doctor
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
