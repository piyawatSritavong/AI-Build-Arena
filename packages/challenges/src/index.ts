import type { ChallengeDefinition } from "@arena/core";
import { sumOfEvens } from "./defs/sum-of-evens";
import { thaiBahtText } from "./defs/thai-baht-text";

export { createRng } from "./rng";
export { computeScore } from "./scoring";
export { bahtText } from "./defs/thai-baht-text";

// Registry: ids must match public.challenges.id (seed/migration).
export const challenges: ChallengeDefinition<any, any>[] = [sumOfEvens, thaiBahtText];
const byId = new Map(challenges.map((c) => [c.id, c]));
export const getChallenge = (id: string) => byId.get(id);
