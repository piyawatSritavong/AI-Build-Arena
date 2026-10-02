import type { DetectedGear, LoadoutFinding, ParseResult } from "@arena/core";
import { BUILT_IN, matchGear, type GearEntry } from "./registry";

/** Categories where two tools almost always overlap. */
const OVERLAP = new Set(["memory", "browser", "web-search", "web-fetch", "filesystem"]);
const BLOAT_MCP = 8;
const TOKENS_PER_SERVER = 700; // rough: ~5 tool definitions × ~140 tokens, loaded every session

export interface AnalyzedGear extends DetectedGear {
  entry?: GearEntry;
}
export interface LoadoutReport {
  gear: AnalyzedGear[];
  findings: LoadoutFinding[];
  summary: {
    total: number;
    byKind: Record<string, number>;
    matched: number;
    unknown: number;
    mcpServers: number;
    estToolTokens: number;
    cleanBuild: boolean;
  };
}

export function analyzeLoadout(parsed: ParseResult[]): LoadoutReport {
  const gear: AnalyzedGear[] = parsed
    .flatMap((p) => p.gear)
    .map((g) => {
      const entry = matchGear(g.haystack ?? g.name, g.name);
      return entry ? { ...g, registryId: entry.id, entry } : g;
    });
  const findings: LoadoutFinding[] = parsed.flatMap((p) => p.findings);

  const byEntry = new Map<string, AnalyzedGear[]>();
  for (const g of gear) if (g.entry) byEntry.set(g.entry.id, [...(byEntry.get(g.entry.id) ?? []), g]);

  for (const [, list] of byEntry) {
    if (list.length > 1) {
      findings.push({ type: "redundant", gear: list.map((g) => g.name), message: `${list[0]!.entry!.name} is configured ${list.length} times (${[...new Set(list.map((g) => g.source))].join(", ")}).`, evidence: "registry" });
    }
    const e = list[0]!.entry!;
    if (e.risk) findings.push({ type: "security-risk", gear: [e.name], message: `${e.name}: ${e.risk}`, evidence: "registry" });
  }

  const byCategory = new Map<string, GearEntry[]>();
  for (const [, list] of byEntry) {
    const e = list[0]!.entry!;
    byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  }
  for (const [cat, entries] of byCategory) {
    if (entries.length > 1 && OVERLAP.has(cat)) {
      findings.push({ type: "redundant", gear: entries.map((e) => e.name), message: `${entries.length} tools cover "${cat}": ${entries.map((e) => e.name).join(", ")}. Keep the one that measurably helps; each extra one costs context.`, evidence: "registry" });
    }
    if (BUILT_IN[cat] && entries.some((e) => e.kind === "mcp")) {
      findings.push({ type: "unused", gear: entries.map((e) => e.name), message: `${entries.map((e) => e.name).join(", ")} may duplicate your client's ${BUILT_IN[cat]}.`, evidence: "heuristic" });
    }
  }

  const mcpServers = gear.filter((g) => g.kind === "mcp").length;
  const estToolTokens = mcpServers * TOKENS_PER_SERVER;
  if (mcpServers > BLOAT_MCP) {
    findings.push({ type: "bloated", gear: [], message: `${mcpServers} MCP servers ≈ ${estToolTokens.toLocaleString("en-US")} tokens of tool definitions loaded every session. Disable the ones you rarely use.`, evidence: "heuristic" });
  }

  const byKind: Record<string, number> = {};
  for (const g of gear) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
  const matched = gear.filter((g) => g.entry).length;
  return {
    gear,
    findings,
    summary: { total: gear.length, byKind, matched, unknown: gear.length - matched, mcpServers, estToolTokens, cleanBuild: gear.length > 0 && findings.length === 0 },
  };
}
