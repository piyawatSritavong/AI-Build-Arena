// Package contracts shared by apps/web, packages/mcp, packages/challenges, packages/loadout.
// Changing these is a cross-team change: update all implementers in the same PR.

export type League = "global" | "thai";

/** JSON-serialisable value handed to / received from the contestant's AI. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Output-verified challenge (Advent of Code style). Implemented in packages/challenges. */
export interface ChallengeDefinition<Input extends Json = Json, Answer extends Json = Json> {
  id: string; // matches public.challenges.id
  version: number; // bump when generator/verifier semantics change
  league: League;
  category: string;
  title: string;
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
  baselineScore?: number;
}
export interface ScoreResult {
  score: number; // 0..100
  lift?: number; // score - baselineScore
}

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
}
export type FindingType = "redundant" | "conflicting" | "bloated" | "unused" | "security-risk";
export interface LoadoutFinding {
  type: FindingType;
  gear: string[];
  message: string;
  evidence: "registry" | "heuristic" | "ablation";
}
export interface LoadoutParser {
  id: string; // e.g. "claude-code-settings", "mcp-json"
  canParse(text: string, filename?: string): boolean;
  parse(text: string, filename?: string): DetectedGear[];
}
