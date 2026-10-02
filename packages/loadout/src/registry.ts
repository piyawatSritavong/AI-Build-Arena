import type { GearKind } from "@arena/core";

export interface GearEntry {
  id: string;
  name: string;
  kind: GearKind;
  category: string; // same category = overlapping capability (redundancy check)
  capabilities: string[];
  /** Case-insensitive regexes tested against "<name> <command> <args> <url>". */
  match: string[];
  risk?: string;
}

const g = (id: string, name: string, kind: GearKind, category: string, capabilities: string[], match: string[], risk?: string): GearEntry =>
  ({ id, name, kind, category, capabilities, match, ...(risk ? { risk } : {}) });

// Curated starter registry (~50). Categories drive redundancy; keep them coarse.
export const GEAR: GearEntry[] = [
  g("filesystem", "Filesystem MCP", "mcp", "filesystem", ["read-files", "write-files"], ["server-filesystem", "^filesystem\\b"], "Grant only the directories you need."),
  g("desktop-commander", "Desktop Commander", "mcp", "filesystem", ["read-files", "write-files", "shell"], ["desktop-commander"], "Can run shell commands on your machine."),
  g("github", "GitHub MCP", "mcp", "git-hosting", ["issues", "pull-requests", "repos"], ["server-github", "github-mcp", "githubcopilot\\.com/mcp", "^github\\b"]),
  g("gitlab", "GitLab MCP", "mcp", "git-hosting", ["issues", "merge-requests", "repos"], ["gitlab"]),
  g("git", "Git MCP", "mcp", "git", ["git-history", "diff"], ["mcp-server-git", "^git\\b"]),
  g("memory", "Memory (knowledge graph) MCP", "mcp", "memory", ["long-term-memory"], ["server-memory", "^memory\\b"]),
  g("basic-memory", "Basic Memory", "mcp", "memory", ["long-term-memory", "markdown-notes"], ["basic-memory"]),
  g("mem0", "Mem0", "mcp", "memory", ["long-term-memory"], ["mem0"]),
  g("context7", "Context7", "mcp", "docs", ["library-docs"], ["context7"]),
  g("sequential-thinking", "Sequential Thinking MCP", "mcp", "reasoning", ["step-planning"], ["sequential-?thinking"]),
  g("fetch", "Fetch MCP", "mcp", "web-fetch", ["fetch-url"], ["mcp-server-fetch", "^fetch\\b"]),
  g("firecrawl", "Firecrawl", "mcp", "web-fetch", ["fetch-url", "crawl"], ["firecrawl"]),
  g("brave-search", "Brave Search MCP", "mcp", "web-search", ["web-search"], ["brave"]),
  g("exa", "Exa", "mcp", "web-search", ["web-search"], ["exa-mcp", "^exa\\b", "mcp\\.exa\\.ai"]),
  g("tavily", "Tavily", "mcp", "web-search", ["web-search"], ["tavily"]),
  g("perplexity", "Perplexity MCP", "mcp", "web-search", ["web-search", "answers"], ["perplexity"]),
  g("playwright", "Playwright MCP", "mcp", "browser", ["browser-automation"], ["playwright"]),
  g("puppeteer", "Puppeteer MCP", "mcp", "browser", ["browser-automation"], ["puppeteer"]),
  g("chrome-devtools", "Chrome DevTools MCP", "mcp", "browser", ["browser-automation", "devtools"], ["chrome-devtools"]),
  g("browserbase", "Browserbase", "mcp", "browser", ["browser-automation", "cloud-browser"], ["browserbase"]),
  g("postgres", "Postgres MCP", "mcp", "database", ["sql"], ["server-postgres", "postgres"], "Use a read-only role where possible."),
  g("sqlite", "SQLite MCP", "mcp", "database", ["sql"], ["sqlite"]),
  g("supabase", "Supabase MCP", "mcp", "database", ["sql", "migrations", "edge-functions"], ["supabase"], "Scope to a dev project / read-only mode."),
  g("vercel", "Vercel MCP", "mcp", "deploy", ["deployments", "logs"], ["vercel"]),
  g("cloudflare", "Cloudflare MCP", "mcp", "deploy", ["workers", "dns"], ["cloudflare"]),
  g("netlify", "Netlify MCP", "mcp", "deploy", ["deployments"], ["netlify"]),
  g("sentry", "Sentry MCP", "mcp", "observability", ["errors"], ["sentry"]),
  g("datadog", "Datadog MCP", "mcp", "observability", ["metrics", "logs"], ["datadog"]),
  g("linear", "Linear MCP", "mcp", "issues", ["issues"], ["linear"]),
  g("atlassian", "Atlassian (Jira/Confluence) MCP", "mcp", "issues", ["issues", "wiki"], ["atlassian", "jira"]),
  g("task-master", "Task Master", "mcp", "planning", ["task-breakdown"], ["task-master"]),
  g("notion", "Notion MCP", "mcp", "notes", ["docs", "databases"], ["notion"]),
  g("obsidian", "Obsidian MCP", "mcp", "notes", ["markdown-notes"], ["obsidian"]),
  g("slack", "Slack MCP", "mcp", "chat", ["messages"], ["slack"]),
  g("figma", "Figma MCP", "mcp", "design", ["design-files"], ["figma"]),
  g("stripe", "Stripe MCP", "mcp", "payments", ["payments"], ["stripe"], "Never use live keys with an agent."),
  g("docker", "Docker MCP", "mcp", "containers", ["containers"], ["docker"]),
  g("kubernetes", "Kubernetes MCP", "mcp", "containers", ["cluster-ops"], ["kubernetes", "\\bk8s\\b"], "Cluster write access; prefer read-only contexts."),
  g("aws", "AWS MCP", "mcp", "cloud", ["cloud-ops"], ["\\baws\\b", "awslabs"]),
  g("google-drive", "Google Drive MCP", "mcp", "cloud-files", ["files"], ["gdrive", "google-drive"]),
  g("time", "Time MCP", "mcp", "utility", ["time"], ["mcp-server-time", "^time\\b"]),
  g("everything", "Everything (MCP reference server)", "mcp", "testing", ["demo"], ["server-everything"], "Reference/test server: not meant for daily use."),
  g("serena", "Serena", "mcp", "code-intel", ["symbol-search", "refactor"], ["serena"]),
  g("zapier", "Zapier MCP", "mcp", "automation", ["integrations"], ["zapier"]),
  g("rtk", "RTK (token-saving CLI proxy)", "cli", "token-saver", ["output-compression"], ["\\brtk\\b"]),
  g("ccusage", "ccusage", "cli", "usage-analytics", ["usage-reports"], ["ccusage"]),
  g("claude-code-router", "Claude Code Router", "cli", "model-routing", ["model-routing"], ["claude-code-router"]),
  g("superpowers", "Superpowers (skills plugin)", "plugin", "workflow", ["skills"], ["superpowers"]),
  g("code-review-plugin", "Code Review plugin", "plugin", "review", ["code-review"], ["^code-review"]),
  g("frontend-design-plugin", "Frontend Design plugin", "plugin", "ui-design", ["design-guidance"], ["^frontend-design"]),
];

/** Capabilities some clients ship built in; an MCP in these categories may duplicate them. */
export const BUILT_IN: Record<string, string> = {
  "web-fetch": "built-in web fetch",
  "web-search": "built-in web search",
  filesystem: "built-in file tools",
  git: "git via the built-in shell",
};

const compiled = GEAR.map((e) => ({ e, res: e.match.map((m) => new RegExp(m, "i")) }));
export function matchGear(haystack: string, name?: string): GearEntry | undefined {
  const n = (name ?? "").toLowerCase();
  return compiled.find(({ res }) => res.some((r) => (r.source.startsWith("^") ? r.test(n) : r.test(haystack))))?.e;
}
