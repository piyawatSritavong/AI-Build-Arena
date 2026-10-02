"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { analyzeLoadout, parseLoadout, type LoadoutReport } from "@arena/loadout";
import { saveScan } from "./actions";
import { capture } from "@/components/analytics";

const BADGE: Record<string, string> = {
  redundant: "bg-amber-400 text-black",
  conflicting: "bg-orange-500 text-black",
  bloated: "bg-purple-400 text-black",
  unused: "bg-slate-400 text-black",
  "security-risk": "bg-red-500 text-white",
};

export function DoctorClient({ signedIn }: { signedIn: boolean }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [report, setReport] = useState<LoadoutReport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFiles(list: FileList | null) {
    // FileReader API: contents stay in this tab.
    setFiles(await Promise.all([...(list ?? [])].slice(0, 10).map(async (f) => ({ name: f.name, text: (await f.text()).slice(0, 500_000) }))));
  }

  function analyze() {
    const inputs = [...files, ...(text.trim() ? [{ name: "pasted", text }] : [])];
    const parsed = inputs.map((i) => parseLoadout(i.text, i.name));
    setErrors(parsed.flatMap((p, i) => (p.error ? [`${inputs[i]!.name}: ${p.error}`] : [])));
    const r = analyzeLoadout(parsed);
    setReport(r);
    capture("doctor_analyzed", { items: r.summary.total, findings: r.findings.length, clean: r.summary.cleanBuild });
    setSaved(null);
  }

  const trendHref = report ? `/trend?ids=${[...new Set(report.gear.flatMap((g) => (g.registryId ? [g.registryId] : [])))].join(",")}` : "/trend";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={'Paste claude_desktop_config.json, ~/.claude/settings.json, .mcp.json, Codex config.toml, or a list (e.g. `ls ~/.claude/skills`)'}
          className="w-full rounded-md border border-foreground/20 bg-transparent p-3 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input type="file" multiple accept=".json,.toml,.txt,.md" onChange={(e) => onFiles(e.target.files)} className="text-xs" />
          <button onClick={analyze} disabled={!text.trim() && !files.length} className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90 disabled:opacity-40">
            Analyze loadout
          </button>
        </div>
        <p className="text-xs opacity-60">Parsed in your browser. Secret values are never shown, stored, or sent; only the report is saved if you click Save.</p>
      </div>

      {errors.map((e) => (
        <p key={e} className="text-sm text-red-500">{e}</p>
      ))}

      {report && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            {report.summary.cleanBuild ? (
              <span className="rounded-full bg-emerald-400 px-3 py-1 text-sm font-semibold text-black">✓ Clean Build</span>
            ) : (
              <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-black">{report.findings.length} finding(s)</span>
            )}
            <span className="text-sm opacity-70">
              {report.summary.total} items · {report.summary.mcpServers} MCP servers (~{report.summary.estToolTokens.toLocaleString("en-US")} tokens of tool definitions) · {report.summary.unknown} not in registry
            </span>
          </div>

          {!!report.findings.length && (
            <ul className="space-y-2">
              {report.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[f.type]}`}>{f.type}</span>
                  <span>
                    {f.message} <span className="text-xs opacity-50">({f.evidence})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer opacity-80">Detected gear ({report.gear.length})</summary>
            <table className="mt-2 w-full text-xs">
              <tbody className="divide-y divide-foreground/10">
                {report.gear.map((g, i) => (
                  <tr key={i}>
                    <td className="py-1">{g.name}</td>
                    <td className="opacity-70">{g.kind}</td>
                    <td>{g.entry ? `${g.entry.name} · ${g.entry.category}` : <span className="opacity-50">unknown</span>}</td>
                    <td className="opacity-50">{g.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={trendHref} className="rounded-md border border-foreground/20 px-4 py-2">
              Trend Check this loadout →
            </Link>
            {signedIn ? (
              <button
                disabled={pending || saved === "Saved."}
                onClick={() =>
                  startTransition(async () => {
                    const r = await saveScan(
                      { ...report.summary, gear: report.gear.map((g) => ({ name: g.name, kind: g.kind, registryId: g.registryId ?? null })) },
                      report.findings,
                    );
                    setSaved(r.ok ? "Saved." : (r.error ?? "Error"));
                  })
                }
                className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
              >
                {saved ?? (pending ? "Saving…" : "Save report to my build")}
              </button>
            ) : (
              <Link href="/login?next=/doctor" className="rounded-md px-4 py-2 underline opacity-80">
                Sign in to save reports
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
