import { GEAR, type GearEntry } from "./registry";

// Editorial v0 ratings (label: "editorial"). They get replaced by ablation evidence as Lift data accrues.
// Rule: tool-maker money never affects these.
export type Trend = "proven" | "hype" | "hidden-gem" | "fading";

export const TREND: Record<string, { trend: Trend; note: string }> = {
  github: { trend: "proven", note: "Issues/PRs without leaving the agent." },
  playwright: { trend: "proven", note: "Lets the agent verify UI changes in a real browser." },
  context7: { trend: "proven", note: "Current library docs instead of stale training data." },
  sentry: { trend: "proven", note: "Real stack traces for debugging." },
  linear: { trend: "proven", note: "Ticket context in the loop." },
  supabase: { trend: "proven", note: "Schema-aware DB work." },
  postgres: { trend: "proven", note: "Schema-aware DB work." },
  figma: { trend: "proven", note: "Design-to-code with real specs." },
  serena: { trend: "hidden-gem", note: "Symbol-level code navigation; fewer whole-file reads." },
  "chrome-devtools": { trend: "hidden-gem", note: "Console, network and performance traces for the agent." },
  rtk: { trend: "hidden-gem", note: "Compresses command output to save tokens." },
  ccusage: { trend: "hidden-gem", note: "See where your tokens actually go." },
  memory: { trend: "hype", note: "Popular, but benefit is unmeasured until Memory Fitness results exist." },
  "basic-memory": { trend: "hype", note: "Popular, but benefit is unmeasured until Memory Fitness results exist." },
  mem0: { trend: "hype", note: "Popular, but benefit is unmeasured until Memory Fitness results exist." },
  "task-master": { trend: "hype", note: "Planning layers are popular; Lift not yet measured." },
  "sequential-thinking": { trend: "fading", note: "Current models reason natively (adaptive thinking)." },
  puppeteer: { trend: "fading", note: "Superseded by Playwright / Chrome DevTools MCPs." },
  filesystem: { trend: "fading", note: "Coding agents ship built-in file tools." },
  fetch: { trend: "fading", note: "Most clients ship built-in web fetch." },
  git: { trend: "fading", note: "Agents run git directly through the shell." },
  everything: { trend: "fading", note: "Reference/test server, not for daily use." },
};

/** Capabilities with broad evidence of helping coding work (editorial v0). Meta Sync % = share covered. */
export const PROVEN_CAPABILITIES = [
  { id: "repo", label: "Repo & PR access", categories: ["git-hosting"], suggest: "github" },
  { id: "browser", label: "Browser verification", categories: ["browser"], suggest: "playwright" },
  { id: "docs", label: "Up-to-date library docs", categories: ["docs"], suggest: "context7" },
  { id: "db", label: "Database access", categories: ["database"], suggest: "supabase" },
  { id: "errors", label: "Error tracking", categories: ["observability"], suggest: "sentry" },
  { id: "issues", label: "Issue tracker", categories: ["issues"], suggest: "linear" },
] as const;

const byId = new Map(GEAR.map((g) => [g.id, g]));

export interface TrendReport {
  syncPct: number;
  capabilities: { id: string; label: string; covered: boolean; suggest: GearEntry }[];
  hype: GearEntry[];
  fading: GearEntry[];
  gemsOwned: GearEntry[];
  gemsToTry: GearEntry[];
}

export function trendCheck(registryIds: string[]): TrendReport {
  const owned = [...new Set(registryIds)].map((id) => byId.get(id)).filter((g): g is GearEntry => Boolean(g));
  const cats = new Set(owned.map((g) => g.category));
  const capabilities = PROVEN_CAPABILITIES.map((c) => ({ id: c.id, label: c.label, covered: c.categories.some((k) => cats.has(k)), suggest: byId.get(c.suggest)! }));
  const rated = (t: Trend) => owned.filter((g) => TREND[g.id]?.trend === t);
  const gems = Object.entries(TREND).filter(([, v]) => v.trend === "hidden-gem").map(([id]) => byId.get(id)!);
  return {
    syncPct: Math.round((capabilities.filter((c) => c.covered).length / capabilities.length) * 100),
    capabilities,
    hype: rated("hype"),
    fading: rated("fading"),
    gemsOwned: rated("hidden-gem"),
    gemsToTry: gems.filter((g) => !owned.includes(g)).slice(0, 3),
  };
}
