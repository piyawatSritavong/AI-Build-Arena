import type { ChallengeDefinition } from "@arena/core";
import { bracketBalance, csvRevenue, gridShortestPath, intervalMerge, knapsack, logSessions, romanNumerals, topoOrder, wordFrequency } from "./defs/global";
import { sumOfEvens } from "./defs/sum-of-evens";
import { thaiAddressParse, thaiDateConvert, thaiIdChecksum, thaiVatWht } from "./defs/thai";
import { thaiBahtText } from "./defs/thai-baht-text";

export { createRng } from "./rng";
export { computeScore, normalizedGain } from "./scoring";
export { wilsonLower } from "@arena/core";
export { bahtText } from "./defs/thai-baht-text";
export { toRoman } from "./defs/global";
export { invoiceTotals, thaiIdCheckDigit } from "./defs/thai";

// Registry = source of truth; `pnpm --filter @arena/challenges sync` upserts public.challenges from it.
export const challenges: ChallengeDefinition<any, any>[] = [
  sumOfEvens, bracketBalance, romanNumerals, intervalMerge, wordFrequency, csvRevenue, gridShortestPath, logSessions, topoOrder, knapsack,
  thaiBahtText, thaiDateConvert, thaiIdChecksum, thaiAddressParse, thaiVatWht,
];
const byId = new Map(challenges.map((c) => [c.id, c]));
export const getChallenge = (id: string) => byId.get(id);
