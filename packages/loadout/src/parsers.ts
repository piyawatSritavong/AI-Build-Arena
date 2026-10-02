import type { DetectedGear, LoadoutFinding, LoadoutParser, ParseResult } from "@arena/core";

// Runs in the browser: raw config text never leaves the user's machine.

const SECRET_VALUE = /^(sk-|sk-ant-|ghp_|gho_|github_pat_|glpat-|xox[abpr]-|AKIA[0-9A-Z]{12}|sb_secret_|rk_live_|sk_live_|eyJ[\w-]{20,}\.)/;
const SECRET_KEY = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;
const isPlaceholder = (v: string) => /^\$\{?[A-Z_][A-Z0-9_]*\}?$/i.test(v) || /^<.*>$/.test(v) || v === "" || /^(x+|\*+|your[-_ ].*|changeme)$/i.test(v);

/** Flags literal secrets; reports only the variable name, never the value. */
export function secretFindings(env: Record<string, unknown> | undefined, where: string): LoadoutFinding[] {
  if (!env || typeof env !== "object") return [];
  return Object.entries(env).flatMap(([k, v]) => {
    if (typeof v !== "string" || isPlaceholder(v.trim())) return [];
    if (!SECRET_VALUE.test(v.trim()) && !(SECRET_KEY.test(k) && v.trim().length >= 12)) return [];
    return [{ type: "security-risk" as const, gear: [where], message: `Hardcoded secret in ${where} (${k}). Move it to an environment variable or secret manager.`, evidence: "heuristic" as const }];
  });
}

const RISKY_HOOK = /(curl|wget)[^|;&]*\|\s*(ba|z)?sh|rm\s+-rf\s+[~/]|chmod\s+777|sudo\s/;

type ServerEntry = { command?: unknown; args?: unknown; url?: unknown; env?: unknown; headers?: unknown };

function serverGear(name: string, s: ServerEntry, source: string): ParseResult {
  const args = Array.isArray(s.args) ? s.args.filter((a): a is string => typeof a === "string") : [];
  const haystack = [name, typeof s.command === "string" ? s.command : "", ...args, typeof s.url === "string" ? s.url : ""].join(" ");
  const findings = [...secretFindings(s.env as Record<string, unknown>, name), ...secretFindings(s.headers as Record<string, unknown>, name)];
  if (args.some((a) => /^--?(api[-_]?key|token|secret)=.{8,}/i.test(a))) {
    findings.push({ type: "security-risk", gear: [name], message: `Secret passed as a command-line argument to ${name}; it can leak via process lists and logs.`, evidence: "heuristic" });
  }
  return { gear: [{ name, kind: "mcp", source, haystack }], findings };
}

function merge(results: ParseResult[]): ParseResult {
  return { gear: results.flatMap((r) => r.gear), findings: results.flatMap((r) => r.findings) };
}

/** Claude Desktop / Claude Code (.mcp.json, ~/.claude.json, settings.json) / Cursor / VS Code JSON configs. */
export const jsonConfigParser: LoadoutParser = {
  id: "json-config",
  canParse: (text) => /^\s*\{/.test(text),
  parse(text, filename = "config.json") {
    let root: unknown;
    try {
      root = JSON.parse(text);
    } catch {
      return { gear: [], findings: [] };
    }
    const out: ParseResult[] = [];
    const walk = (node: unknown, path: string, depth: number) => {
      if (!node || typeof node !== "object" || depth > 6) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const here = path ? `${path}.${key}` : key;
        if ((key === "mcpServers" || key === "servers" || key === "mcp_servers") && value && typeof value === "object" && !Array.isArray(value)) {
          for (const [name, s] of Object.entries(value as Record<string, ServerEntry>)) {
            if (s && typeof s === "object" && ("command" in s || "url" in s)) out.push(serverGear(name, s, `${filename}:${here}`));
          }
        } else if (key === "enabledPlugins" && value && typeof value === "object") {
          const gear = Object.entries(value as Record<string, unknown>)
            .filter(([, on]) => on === true)
            .map(([id]): DetectedGear => ({ name: id.split("@")[0]!, kind: "plugin", source: `${filename}:${here}`, haystack: id }));
          out.push({ gear, findings: [] });
        } else if (key === "hooks" && value && typeof value === "object" && !Array.isArray(value)) {
          for (const [event, entries] of Object.entries(value as Record<string, unknown>)) {
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
              const hooks = (entry as { hooks?: { command?: unknown }[] })?.hooks ?? [];
              for (const h of hooks) {
                if (typeof h?.command !== "string") continue;
                const name = `${event}: ${h.command.split(/\s+/).slice(0, 3).join(" ")}`.slice(0, 60);
                const findings: LoadoutFinding[] = RISKY_HOOK.test(h.command)
                  ? [{ type: "security-risk", gear: [name], message: `Hook "${name}" pipes downloads into a shell or runs destructive/privileged commands.`, evidence: "heuristic" }]
                  : [];
                out.push({ gear: [{ name, kind: "hook", source: `${filename}:${here}`, haystack: h.command }], findings });
              }
            }
          }
        } else if (key === "defaultMode" && value === "bypassPermissions") {
          out.push({ gear: [], findings: [{ type: "security-risk", gear: ["permissions"], message: "Permissions default to bypassPermissions: every tool call runs without confirmation.", evidence: "heuristic" }] });
        } else if (key === "env" && path === "" && value && typeof value === "object") {
          out.push({ gear: [], findings: secretFindings(value as Record<string, unknown>, "settings env") });
        } else {
          walk(value, here, depth + 1);
        }
      }
    };
    walk(root, "", 0);
    return merge(out);
  },
};

/** Codex config.toml: [mcp_servers.<name>] tables (+ optional .env sub-table). */
export const codexTomlParser: LoadoutParser = {
  id: "codex-toml",
  canParse: (text) => /^\s*\[mcp_servers\./m.test(text),
  parse(text, filename = "config.toml") {
    const servers = new Map<string, ServerEntry & { env: Record<string, string> }>();
    let current: { name: string; env: boolean } | null = null;
    const str = (v: string) => v.trim().replace(/^["']|["']$/g, "");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, "").trim();
      const table = line.match(/^\[mcp_servers\.("?)([^\]."]+)\1(\.env)?\]$/);
      if (table) {
        current = { name: table[2]!, env: Boolean(table[3]) };
        if (!servers.has(current.name)) servers.set(current.name, { env: {} });
        continue;
      }
      if (line.startsWith("[")) {
        current = null;
        continue;
      }
      const kv = line.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (!current || !kv) continue;
      const s = servers.get(current.name)!;
      if (current.env) s.env[kv[1]!] = str(kv[2]!);
      else if (kv[1] === "env") {
        for (const m of kv[2]!.matchAll(/([\w-]+)\s*=\s*("[^"]*"|'[^']*')/g)) s.env[m[1]!] = str(m[2]!);
      } else if (kv[1] === "command" || kv[1] === "url") s[kv[1]] = str(kv[2]!);
      else if (kv[1] === "args") s.args = [...kv[2]!.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]!);
    }
    return merge([...servers].map(([name, s]) => serverGear(name, s, `${filename}:mcp_servers`)));
  },
};

/** Fallback: one item per line (e.g. `ls ~/.claude/skills`, a pasted list of tools). */
export const listParser: LoadoutParser = {
  id: "list",
  canParse: () => true,
  parse(text, filename = "list") {
    const gear = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s*\-•\d.)]+/, "").trim())
      .filter((l) => l && !l.startsWith("#") && l.length <= 200)
      .slice(0, 300)
      .map((line): DetectedGear => {
        const parts = line.replace(/\/(SKILL\.md|README\.md)$/i, "").split(/[\\/]/).filter(Boolean);
        const name = parts.at(-1) ?? line;
        const kind = /skills?\//i.test(line) ? "skill" : /plugins?\//i.test(line) ? "plugin" : /hooks?\//i.test(line) ? "hook" : "other";
        return { name, kind, source: filename, haystack: line };
      });
    return { gear, findings: [] };
  },
};

export const PARSERS = [jsonConfigParser, codexTomlParser, listParser];

export function parseLoadout(text: string, filename?: string): ParseResult & { parser: string; error?: string } {
  const p = PARSERS.find((x) => x.canParse(text, filename))!;
  if (p === jsonConfigParser) {
    try {
      JSON.parse(text);
    } catch {
      return { gear: [], findings: [], parser: p.id, error: "This looks like JSON but does not parse. Check for trailing commas or comments." };
    }
  }
  return { ...p.parse(text, filename), parser: p.id };
}
