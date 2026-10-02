import { GEAR } from "@arena/loadout";
import { TrendClient } from "./trend-client";

export const metadata = { title: "Trend Check · AI Build Arena", description: "Can't keep up with AI trends? Maybe you're carrying too much. 60-second check, no signup." };

const KNOWN = new Set(GEAR.map((g) => g.id));

export default async function TrendPage({ searchParams }: PageProps<"/trend">) {
  const { ids } = await searchParams;
  const initial = typeof ids === "string" ? ids.split(",").filter((id) => KNOWN.has(id)) : [];
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Trend Check</h1>
        <p className="opacity-80">Keeping up isn&apos;t installing every trend — it&apos;s having the capabilities proven to help.</p>
      </div>
      <TrendClient initial={initial} />
    </main>
  );
}
