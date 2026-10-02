import type { ChallengeDefinition } from "@arena/core";
import { createRng } from "../rng";

export const sumOfEvens: ChallengeDefinition<{ numbers: number[] }, number> = {
  id: "sum-of-evens",
  version: 1,
  league: "global",
  category: "logic",
  title: "Sum of Evens",
  summary: "Warm-up: sum the even numbers in a generated list.",
  difficulty: 1,
  timeLimitSeconds: 300,
  prompt: [
    "Return the sum of all **even** integers in `input.numbers` (negative numbers included; 0 is even).",
    "",
    "Answer format: a single JSON number, e.g. `1234`.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const numbers = Array.from({ length: 200 }, () => rng.int(-1000, 1000));
    return { input: { numbers }, expected: numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0) };
  },
  verify(submitted, expected) {
    const n = typeof submitted === "string" ? Number(submitted.trim()) : submitted;
    const correct = n === expected;
    return { correct, accuracy: correct ? 1 : 0 };
  },
};
