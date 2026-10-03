import type { FindingType, GearKind } from "@arena/core";
import type { LoadoutReport } from "./analyze";

/**
 * What the CLI is allowed to upload after a scan: names, kinds and findings only.
 * Never commands, arguments, URLs, file paths, env values or instruction text.
 * The CLI shows this exact payload before sending; the server re-validates and re-sanitizes it.
 */
export interface ScanPayload {
  version: 1;
  cli: string; // CLI version
  sources: string[]; // which config locations were found, e.g. "claude-code", "claude-desktop"
  instructions: { user: boolean; project: boolean }; // CLAUDE.md / AGENTS.md present (content never read out)
  gear: { name: string; kind: GearKind; registryId: string | null; category: string | null }[];
  findings: { type: FindingType; gear: string[]; message: string }[];
  summary: LoadoutReport["summary"];
}

const KINDS: readonly GearKind[] = ["mcp", "skill", "plugin", "hook", "cli", "extension", "memory", "other"];
const FINDING_TYPES: readonly FindingType[] = ["redundant", "conflicting", "bloated", "unused", "security-risk"];
const SOURCES = new Set(["claude-code", "claude-code-project", "claude-desktop", "cursor", "codex"]);

const SECRET = /(sk-[\w-]{6,}|sk-ant-[\w-]+|ghp_\w+|gho_\w+|github_pat_\w+|glpat-[\w-]+|xox[abpr]-[\w-]+|AKIA[0-9A-Z]{12,}|sb_secret_\w+|[rs]k_live_\w+|eyJ[\w-]{20,}\.[\w.-]+)/g;
const PATH = /(?:[A-Za-z]:)?(?:~|\.{1,2})?[\\/]?(?:[^\s\\/:"'`]+[\\/])+([^\s\\/:"'`]+)/g;
const URL_RE = /\bhttps?:\/\/([^\s/?#]+)[^\s]*/g;
const FLAG = /(^|\s)--?[A-Za-z][\w-]*(=\S*)?/g; // command-line flags can carry tokens (--api-key=...)

/** Keeps a short label: paths collapse to their last segment, URLs to their host, secrets are removed. */
export function sanitizeLabel(text: string, max = 60): string {
  return text
    .replace(SECRET, "[redacted]")
    .replace(URL_RE, "$1")
    .replace(PATH, "$1")
    .replace(FLAG, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function toScanPayload(report: LoadoutReport, meta: { cli: string; sources: string[]; instructions: ScanPayload["instructions"] }): ScanPayload {
  return {
    version: 1,
    cli: meta.cli,
    sources: meta.sources,
    instructions: meta.instructions,
    gear: report.gear.map((g) => ({
      name: sanitizeLabel(g.name),
      kind: g.kind,
      registryId: g.registryId ?? null,
      category: g.entry?.category ?? null,
    })),
    findings: report.findings.map((f) => ({ type: f.type, gear: f.gear.map((n) => sanitizeLabel(n)), message: sanitizeLabel(f.message, 240) })),
    summary: report.summary,
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? sanitizeLabel(v, max) : null);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 1_000_000) : 0);

/** Server side: accept only the documented shape, cap sizes, sanitize every string again. */
export function parseScanPayload(input: unknown): ScanPayload | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  if (p.version !== 1 || !Array.isArray(p.gear) || !Array.isArray(p.findings) || !p.summary || typeof p.summary !== "object") return null;
  const gear = p.gear.slice(0, 300).flatMap((g) => {
    const r = g as Record<string, unknown>;
    const name = str(r?.name, 60);
    if (!name || !KINDS.includes(r.kind as GearKind)) return [];
    return [{ name, kind: r.kind as GearKind, registryId: str(r.registryId, 60), category: str(r.category, 40) }];
  });
  const findings = p.findings.slice(0, 200).flatMap((f) => {
    const r = f as Record<string, unknown>;
    if (!FINDING_TYPES.includes(r?.type as FindingType)) return [];
    const names = Array.isArray(r.gear) ? r.gear.slice(0, 20).flatMap((n) => (str(n, 60) ? [str(n, 60)!] : [])) : [];
    return [{ type: r.type as FindingType, gear: names, message: str(r.message, 240) ?? "" }];
  });
  const s = p.summary as Record<string, unknown>;
  const byKind = Object.fromEntries(
    Object.entries((s.byKind as Record<string, unknown>) ?? {})
      .filter(([k]) => KINDS.includes(k as GearKind))
      .map(([k, v]) => [k, int(v)]),
  );
  const instr = (p.instructions as Record<string, unknown>) ?? {};
  return {
    version: 1,
    cli: str(p.cli, 20) ?? "unknown",
    sources: Array.isArray(p.sources) ? p.sources.filter((x): x is string => typeof x === "string" && SOURCES.has(x)).slice(0, 10) : [],
    instructions: { user: instr.user === true, project: instr.project === true },
    gear,
    findings,
    summary: {
      total: int(s.total),
      byKind,
      matched: int(s.matched),
      unknown: int(s.unknown),
      mcpServers: int(s.mcpServers),
      estToolTokens: int(s.estToolTokens),
      cleanBuild: s.cleanBuild === true,
    },
  };
}
