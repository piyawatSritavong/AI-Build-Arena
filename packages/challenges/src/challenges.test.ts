import { describe, expect, it } from "vitest";
import { LEAGUES } from "@arena/core";
import { bahtText, challenges, computeScore, createRng, normalizedGain, wilsonLower } from "./index";

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
  it("rewards accuracy and speed", () => {
    expect(computeScore({ accuracy: 1, durationMs: 0, timeLimitMs: 1000 })).toEqual({ score: 100 });
    expect(computeScore({ accuracy: 1, durationMs: 2000, timeLimitMs: 1000 })).toEqual({ score: 80 });
  });
});

describe("normalizedGain", () => {
  it("scales gains by headroom and losses by the baseline, within −100…+100", () => {
    expect(normalizedGain(100, 50)).toBe(100);
    expect(normalizedGain(75, 50)).toBe(50);
    expect(normalizedGain(25, 50)).toBe(-50);
    expect(normalizedGain(50, 0)).toBe(50);
    expect(normalizedGain(0, 0)).toBe(0);
    expect(normalizedGain(100, 100)).toBe(0);
    expect(normalizedGain(90, 100)).toBe(-10);
    expect(normalizedGain(0, 80)).toBe(-100);
  });
});

describe("wilsonLower", () => {
  it("does not give a lucky single pass 100%, and tightens with more runs", () => {
    expect(wilsonLower(1, 1)).toBe(20.65);
    expect(wilsonLower(3, 3)).toBe(43.85);
    expect(wilsonLower(10, 10)).toBe(72.25);
    expect(wilsonLower(5, 10)).toBe(23.66);
    expect(wilsonLower(0, 5)).toBe(0);
    expect(wilsonLower(0, 0)).toBeNull();
  });
});

import { invoiceTotals, thaiIdCheckDigit, toRoman } from "./index";

describe("registry", () => {
  it("has 11 global (incl. Memory Fitness) + 5 thai with unique ids and sane metadata", () => {
    expect(challenges.filter((c) => c.league === "global")).toHaveLength(11);
    expect(challenges.filter((c) => c.league === "thai")).toHaveLength(5);
    expect(new Set(challenges.map((c) => c.id)).size).toBe(16);
    for (const c of challenges) expect(c.timeLimitSeconds).toBeGreaterThan(0);
  });
  it("keeps inputs small enough for an MCP tool result (< 40 KB)", () => {
    for (const c of challenges) expect(JSON.stringify(c.generate("size").input).length).toBeLessThan(40_000);
  });
  it("different seeds give different inputs", () => {
    for (const c of challenges) expect(c.generate("a").input).not.toEqual(c.generate("b").input);
  });
});

describe("reference solvers", () => {
  it("roman", () => expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(toRoman)).toEqual(["I", "IV", "IX", "XIV", "XL", "XC", "CD", "MCMXCIV", "MMMCMXCIX"]));
  it("thai id check digit", () => expect(thaiIdCheckDigit("110170020345")).toBe(0));
  it("vat/wht", () => {
    expect(invoiceTotals({ items: [{ description: "x", amount: 10700 }], vat_mode: "inclusive", wht_rate: 3 })).toEqual({ base: 10000, vat: 700, wht: 300, net: 10400 });
    expect(invoiceTotals({ items: [{ description: "x", amount: 1000.5 }], vat_mode: "exclusive", wht_rate: 0 })).toEqual({ base: 1000.5, vat: 70.04, wht: 0, net: 1070.54 });
    expect(invoiceTotals({ items: [{ description: "x", amount: 100 }], vat_mode: "none", wht_rate: 5 })).toEqual({ base: 100, vat: 0, wht: 5, net: 95 });
  });
});

describe("leagues + anchors", () => {
  it("every challenge belongs to a registered league", () => {
    const ids = LEAGUES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of challenges) expect(ids).toContain(c.league);
    expect(LEAGUES.filter((l) => l.kind === "global")).toHaveLength(1);
    for (const l of LEAGUES) expect(l.kind === "global" ? l.region === null : /^[A-Z]{2}$/.test(l.region ?? "")).toBe(true);
  });
  it("anchors are language-neutral Global challenges across several categories", () => {
    const anchors = challenges.filter((c) => c.anchor);
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const a of anchors) expect(a.league).toBe("global");
    expect(new Set(anchors.map((a) => a.category)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("memory fitness", () => {
  const def = challenges.find((c) => c.id === "memory-fitness")!;
  it("learn day shows the facts and a 4-question quiz; the exam asks the other 8 without the facts", () => {
    const learn = def.memory!.learn("seed-1");
    const exam = def.generate("seed-1");
    const li = learn.input as { facts: string[]; questions: Record<string, string> };
    const ei = exam.input as { questions: Record<string, string>; facts?: unknown };
    expect(li.facts).toHaveLength(12);
    expect(Object.keys(li.questions)).toHaveLength(4);
    expect(Object.keys(ei.questions)).toHaveLength(8);
    expect(ei.facts).toBeUndefined();
    // Every expected answer appears in exactly the learned facts; quiz and exam ask about different facts.
    const facts = li.facts.join("\n");
    for (const v of [...Object.values(learn.expected as Record<string, string>), ...Object.values(exam.expected as Record<string, string>)]) expect(facts).toContain(v);
    const quizQ = new Set(Object.values(li.questions));
    for (const q of Object.values(ei.questions)) expect(quizQ.has(q)).toBe(false);
    expect(def.memory!.learn("seed-1")).toEqual(learn); // deterministic
  });
  it("grades recall leniently on case/spacing and passes at 6 of 8", () => {
    const exam = def.generate("seed-2");
    const exp = exam.expected as Record<string, string>;
    const keys = Object.keys(exp);
    expect(def.verify(Object.fromEntries(keys.map((k) => [k, ` ${exp[k]!.toUpperCase()} `])), exp)).toMatchObject({ correct: true, accuracy: 1 });
    const six = Object.fromEntries(keys.map((k, i) => [k, i < 6 ? exp[k]! : "no idea"]));
    expect(def.verify(six, exp)).toMatchObject({ correct: true, accuracy: 0.75 });
    const five = Object.fromEntries(keys.map((k, i) => [k, i < 5 ? exp[k]! : ""]));
    expect(def.verify(five, exp).correct).toBe(false);
  });
});
