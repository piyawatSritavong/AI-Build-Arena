import { access, readdir, readFile, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ParseResult } from "@arena/core";
import { analyzeLoadout, listParser, parseLoadout, toScanPayload, type ScanPayload } from "@arena/loadout";
import { VERSION } from "./version";

// Reads AI client configs on this machine and keeps only tool names, kinds and findings.
// Raw config text, commands, arguments, URLs, paths, env values and instruction files never leave this process.

const MAX_BYTES = 20 * 1024 * 1024;

interface Location {
  source: string;
  files: string[]; // JSON or TOML configs
  lists?: { dir: string; prefix: string; kind: "skills" | "agents" | "commands" }[];
}

const home = () => process.env.SETUPTIER_HOME ?? homedir();

function desktopConfig() {
  const h = home();
  if (platform() === "darwin") return join(h, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform() === "win32") return join(process.env.APPDATA ?? join(h, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(h, ".config", "Claude", "claude_desktop_config.json");
}

export function locations(opts: { project?: string }): Location[] {
  const h = home();
  const out: Location[] = [
    {
      source: "claude-code",
      files: [join(h, ".claude.json"), join(h, ".claude", "settings.json")],
      lists: [
        { dir: join(h, ".claude", "skills"), prefix: "skills", kind: "skills" },
        { dir: join(h, ".claude", "agents"), prefix: "agents", kind: "agents" },
        { dir: join(h, ".claude", "commands"), prefix: "commands", kind: "commands" },
      ],
    },
    { source: "claude-desktop", files: [desktopConfig()] },
    { source: "cursor", files: [join(h, ".cursor", "mcp.json")] },
    { source: "codex", files: [join(h, ".codex", "config.toml")] },
  ];
  if (opts.project) {
    const p = opts.project;
    out.push({
      source: "claude-code-project",
      files: [join(p, ".mcp.json"), join(p, ".claude", "settings.json")],
      lists: [{ dir: join(p, ".claude", "skills"), prefix: "skills", kind: "skills" }],
    });
  }
  return out;
}

const exists = (f: string) => access(f).then(() => true, () => false);

async function readSmall(file: string) {
  try {
    const s = await stat(file);
    if (!s.isFile() || s.size > MAX_BYTES) return null;
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function listNames(dir: string) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => !e.name.startsWith(".")).map((e) => e.name.replace(/\.md$/i, ""));
  } catch {
    return [];
  }
}

export interface ScanResult {
  payload: ScanPayload;
  found: { source: string; files: number; items: number }[];
}

export async function scanMachine(opts: { project?: string } = {}): Promise<ScanResult> {
  const parsed: ParseResult[] = [];
  const found: ScanResult["found"] = [];
  for (const loc of locations(opts)) {
    let files = 0;
    let items = 0;
    for (const f of loc.files) {
      const text = await readSmall(f);
      if (text === null) continue;
      files++;
      // Pass only a neutral label as the "filename": the real path is not needed and must not end up in findings.
      const r = parseLoadout(text, `${loc.source}${f.endsWith(".toml") ? ".toml" : ".json"}`);
      if (r.error) continue;
      parsed.push(r);
      items += r.gear.length;
    }
    for (const l of loc.lists ?? []) {
      const names = await listNames(l.dir);
      if (!names.length) continue;
      files++;
      // listParser infers kind from a "skills/<name>"-style line; agents and commands stay "other".
      const r = listParser.parse(names.map((n) => `${l.prefix}/${n}`).join("\n"), loc.source);
      parsed.push(r);
      items += r.gear.length;
    }
    if (files) found.push({ source: loc.source, files, items });
  }

  const h = home();
  const instructions = {
    user: (await exists(join(h, ".claude", "CLAUDE.md"))) || (await exists(join(h, ".codex", "AGENTS.md"))),
    project: opts.project ? (await exists(join(opts.project, "CLAUDE.md"))) || (await exists(join(opts.project, "AGENTS.md"))) : false,
  };
  // Judge duplicates and bloat per client: sources are labelled "<client>.json", "<client>.toml" or "<client>".
  const report = analyzeLoadout(parsed, { scope: (g) => g.source.split(/[.:]/)[0]! });
  return {
    payload: toScanPayload(report, { cli: VERSION, sources: found.map((f) => f.source), instructions }),
    found,
  };
}

/** Human-readable preview of exactly what would be uploaded. */
export function describePayload(p: ScanPayload): string {
  const lines: string[] = [];
  const byKind = new Map<string, string[]>();
  for (const g of p.gear) byKind.set(g.kind, [...(byKind.get(g.kind) ?? []), g.registryId ? `${g.name} (${g.registryId})` : g.name]);
  for (const [kind, names] of byKind) lines.push(`  ${kind.padEnd(7)} ${names.join(", ")}`);
  if (!p.gear.length) lines.push("  (no tools found)");
  lines.push("", `Findings: ${p.findings.length ? "" : "none (Clean Build)"}`);
  for (const f of p.findings) lines.push(`  [${f.type}] ${f.message}`);
  lines.push(
    "",
    `Instruction files present: user ${p.instructions.user ? "yes" : "no"}, project ${p.instructions.project ? "yes" : "no"} (content is never read out)`,
    `~${p.summary.estToolTokens.toLocaleString("en-US")} tokens of MCP tool definitions per session`,
  );
  return lines.join("\n");
}
