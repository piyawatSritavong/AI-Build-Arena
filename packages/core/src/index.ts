// Package contracts shared by apps/web, packages/mcp, packages/challenges, packages/loadout.
// Changing these is a cross-team change: update all implementers in the same PR.

/**
 * League registry = source of truth (synced to public.leagues by `pnpm --filter @arena/challenges sync`).
 * Global = language-neutral challenges. Regional = a country's own language and rules (community-authored later).
 * Anchor challenges (Global challenges with `anchor: true`) are played in every league so regional scores can be
 * put on the Global scale. Adding a region: a value in the public.league enum + an entry here + its challenges.
 */
export const LEAGUES = [
  { id: "global", kind: "global", region: null, name: "Global", short: "", locale: "en", description: "Language-neutral logic, algorithm and data challenges." },
  { id: "thai", kind: "regional", region: "TH", name: "Thai League", short: "TH", locale: "th", description: "Thai baht text, Buddhist-era dates, Thai ID checksums, addresses and VAT / withholding tax." },
] as const;
export type League = (typeof LEAGUES)[number]["id"];
export type LeagueInfo = (typeof LEAGUES)[number];
export const LEAGUE_IDS = LEAGUES.map((l) => l.id) as [League, ...League[]];
export const leagueInfo = (id: string): LeagueInfo | undefined => LEAGUES.find((l) => l.id === id);

/** JSON-serialisable value handed to / received from the contestant's AI. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Output-verified challenge (Advent of Code style). Implemented in packages/challenges. */
export interface ChallengeDefinition<Input extends Json = Json, Answer extends Json = Json> {
  id: string; // matches public.challenges.id
  version: number; // bump when generator/verifier semantics change
  league: League;
  category: string;
  title: string;
  summary: string; // one line for list_challenges / leaderboard
  difficulty: 1 | 2 | 3 | 4 | 5;
  timeLimitSeconds: number;
  /** Anchor: a Global challenge every league also plays, used to put regional scores on one scale. */
  anchor?: boolean;
  /** Markdown instructions shown via MCP get_challenge. Must state the exact answer format. */
  prompt: string;
  /** Deterministic: same seed => same input and expected answer. */
  generate(seed: string): { input: Input; expected: Answer };
  /** Compare submitted answer with expected. Must never throw on malformed input. */
  verify(submitted: unknown, expected: Answer): VerifyResult;
}

export interface VerifyResult {
  correct: boolean;
  /** 0..1 partial credit; 1 when fully correct. */
  accuracy: number;
  feedback?: string;
}

/** Scoring inputs; implemented in packages/challenges (scoring.ts). */
export interface ScoreInput {
  accuracy: number;
  durationMs: number;
  timeLimitMs: number;
}
export interface ScoreResult {
  score: number; // 0..100
}
/** Where a Lift's baseline came from: the user's own Stock runs, or the community median for the same model. */
export type LiftBasis = "own" | "community";

/**
 * Measurement contracts (schema v2). A build has variants; every attempt runs one of them.
 * Full = the user's whole setup; Stock = the same client with none of the user's add-ons (Paired Lift);
 * Ablation = Full minus some gear; Custom = forks and other experiments.
 */
export const VARIANT_KINDS = ["full", "stock", "ablation", "custom"] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];
/** Ranked runs count for the leaderboard; practice runs feed Reliability and Ablation only. */
export const ATTEMPT_MODES = ["ranked", "practice"] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];
/** mcp = self-reported through the remote MCP; cli = run and counted by the SetupTier CLI. */
export type ResultSource = "mcp" | "cli";
/** How much of a build's loadout the public report shows. */
export const LOADOUT_VISIBILITY = ["hidden", "categories", "names", "install"] as const;
export type LoadoutVisibility = (typeof LOADOUT_VISIBILITY)[number];

/** Profession tags (multi-select, max 5). Must match the profiles.professions check constraint. */
export const PROFESSIONS = [
  { id: "programmer", label: "Programmer" },
  { id: "data-analyst", label: "Data analyst" },
  { id: "graphic-designer", label: "Graphic designer" },
  { id: "uiux-designer", label: "UI/UX designer" },
  { id: "video-editor", label: "Video editor" },
  { id: "writer", label: "Writer / content creator" },
  { id: "marketer", label: "Marketer" },
  { id: "researcher", label: "Researcher" },
  { id: "student", label: "Student" },
  { id: "ops", label: "Ops / admin" },
] as const;
export type Profession = (typeof PROFESSIONS)[number]["id"];

/** Remote MCP tool names (packages/mcp). */
export const MCP_TOOLS = ["list_challenges", "get_challenge", "submit_answer", "my_stats"] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

/** Loadout Doctor (packages/loadout). Parsing runs in the browser; raw config is never uploaded. */
export type GearKind = "mcp" | "skill" | "plugin" | "hook" | "cli" | "extension" | "memory" | "other";
export interface DetectedGear {
  name: string;
  kind: GearKind;
  registryId?: string; // gear_registry.id when matched
  source: string; // which config file/section it came from
  /** Text used for registry matching (name + command + args/url). Never contains env values. */
  haystack?: string;
}
export type FindingType = "redundant" | "conflicting" | "bloated" | "unused" | "security-risk";
export interface LoadoutFinding {
  type: FindingType;
  gear: string[];
  message: string;
  evidence: "registry" | "heuristic" | "ablation" | "editorial";
}
export interface ParseResult {
  gear: DetectedGear[];
  findings: LoadoutFinding[]; // issues spotted while parsing (e.g. hardcoded secrets); never include secret values
}
export interface LoadoutParser {
  id: string; // e.g. "json-config", "codex-toml", "list"
  canParse(text: string, filename?: string): boolean;
  parse(text: string, filename?: string): ParseResult;
}

/** Base models selectable on a build; baselines are measured per id so Lift lines up. */
export const KNOWN_MODELS = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-4-5",
  "claude-fable-5-1",
  "gpt-5",
  "gpt-5-mini",
  "gemini-2.5-pro",
  "other",
] as const;
export * from "./card";
export * from "./stats";
