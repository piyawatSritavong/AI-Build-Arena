import { describe, expect, it } from "vitest";
import { bahtText, challenges, computeScore, createRng } from "./index";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng("s1"), b = createRng("s1"), c = createRng("s2");
    const seq = (r: ReturnType<typeof createRng>) => Array.from({ length: 5 }, () => r.int(0, 1e6));
    expect(seq(a)).toEqual(seq(b));
    expect(seq(createRng("s1"))).not.toEqual(seq(c));
  });
});

describe("bahtText", () => {
  it.each([
    [0n, "ศูนย์บาทถ้วน"],
    [100n, "หนึ่งบาทถ้วน"],
    [1100n, "สิบเอ็ดบาทถ้วน"],
    [2100n, "ยี่สิบเอ็ดบาทถ้วน"],
    [10100n, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [100000100n, "หนึ่งล้านเอ็ดบาทถ้วน"],
    [100000000n, "หนึ่งล้านบาทถ้วน"],
    [1100000000n, "สิบเอ็ดล้านบาทถ้วน"],
    [2121n, "ยี่สิบเอ็ดบาทยี่สิบเอ็ดสตางค์"],
    [1n, "หนึ่งสตางค์"],
    [150n, "หนึ่งบาทห้าสิบสตางค์"],
    [123456789n, "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์"],
  ])("%s satang", (s, text) => expect(bahtText(s)).toBe(text));
});

describe.each(challenges.map((c) => [c.id, c] as const))("%s", (_, c) => {
  it("generates deterministically and accepts its own expected answer", () => {
    const g1 = c.generate("seed-x"), g2 = c.generate("seed-x");
    expect(g1).toEqual(g2);
    expect(c.verify(JSON.parse(JSON.stringify(g1.expected)), g1.expected)).toMatchObject({ correct: true, accuracy: 1 });
  });
  it("rejects garbage without throwing", () => {
    const { expected } = c.generate("seed-y");
    for (const bad of [null, "nope", 42, [], {}]) expect(c.verify(bad, expected).correct).toBe(false);
  });
});

describe("computeScore", () => {
  it("rewards accuracy and speed, computes lift", () => {
    expect(computeScore({ accuracy: 1, durationMs: 0, timeLimitMs: 1000 })).toEqual({ score: 100 });
    expect(computeScore({ accuracy: 1, durationMs: 2000, timeLimitMs: 1000, baselineScore: 70 })).toEqual({ score: 80, lift: 10 });
  });
});
