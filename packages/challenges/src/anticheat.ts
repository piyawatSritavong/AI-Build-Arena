import type { ResultSource } from "@arena/core";

/** Anomaly flags stored on attempts.flags (must match the check constraint in *_anti_cheat_v1.sql). */
export type AttemptFlag = "too_fast" | "tokens_implausible" | "blank_answer";

/** Reading a challenge, writing and running code and submitting takes an AI at least this long per difficulty level. */
export const MIN_MS_PER_DIFFICULTY = 2000;
/** Any real run reads the challenge prompt (≥ 1k tokens); nothing needs 20M tokens. */
export const TOKENS_PLAUSIBLE = { min: 500, max: 20_000_000 } as const;

const BLANK = new Set(["", '""', "null", "{}", "[]"]);

/**
 * Flags for one submitted attempt. too_fast applies to self-reported (MCP) passes only: CLI runs are timed by the CLI.
 * Effects (SQL): too_fast passes count nowhere until reviewed; implausible token counts are ignored; a blank Stock run
 * is no baseline. Every flag lowers the account's trust score.
 */
export function detectFlags(a: {
  source: ResultSource;
  correct: boolean;
  difficulty: number;
  durationMs: number;
  tokensSelfReported?: number;
  answer: string;
}): AttemptFlag[] {
  const flags: AttemptFlag[] = [];
  if (a.source === "mcp" && a.correct && a.difficulty >= 2 && a.durationMs < MIN_MS_PER_DIFFICULTY * a.difficulty) flags.push("too_fast");
  if (a.tokensSelfReported !== undefined && (a.tokensSelfReported < TOKENS_PLAUSIBLE.min || a.tokensSelfReported > TOKENS_PLAUSIBLE.max)) flags.push("tokens_implausible");
  if (BLANK.has(a.answer.trim())) flags.push("blank_answer");
  return flags;
}

export function flagNote(flags: AttemptFlag[], difficulty: number): string | undefined {
  if (!flags.length) return undefined;
  const why: Record<AttemptFlag, string> = {
    too_fast: `solved faster than an AI can read, solve and submit a difficulty-${difficulty} challenge (${(MIN_MS_PER_DIFFICULTY * difficulty) / 1000}s): kept, but it does not count until reviewed`,
    tokens_implausible: `the token count is outside ${TOKENS_PLAUSIBLE.min}–${TOKENS_PLAUSIBLE.max.toLocaleString("en-US")}, so it is ignored for Efficiency`,
    blank_answer: "the answer was empty, so this run is not used as a Stock baseline",
  };
  return `Flagged: ${flags.map((f) => why[f]).join("; ")}. Flags lower your account's trust score.`;
}
