import type { ChallengeDefinition } from "@arena/core";
import { createRng } from "../rng";

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Integer -> Thai words (no unit). `hasHigher`: a non-zero digit exists above this number (turns units 1 into เอ็ด). */
function intToThai(n: bigint, hasHigher = false): string {
  if (n === 0n) return "";
  const million = n / 1_000_000n;
  const rest = n % 1_000_000n;
  let out = million > 0n ? intToThai(million, hasHigher) + "ล้าน" : "";
  const digits = rest.toString().padStart(6, "0").split("").map(Number);
  digits.forEach((d, i) => {
    const place = 5 - i;
    if (d === 0) return;
    if (place === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : DIGITS[d] + "สิบ";
    else if (place === 0 && d === 1 && (hasHigher || million > 0n || rest > 1n)) out += "เอ็ด";
    else out += DIGITS[d] + PLACES[place];
  });
  return out;
}

/** Amount in satang -> Thai baht text (Excel BAHTTEXT conventions). */
export function bahtText(satangTotal: bigint): string {
  const baht = satangTotal / 100n;
  const satang = satangTotal % 100n;
  if (baht === 0n && satang === 0n) return "ศูนย์บาทถ้วน";
  const bahtPart = baht > 0n ? intToThai(baht) + "บาท" : "";
  return bahtPart + (satang === 0n ? "ถ้วน" : intToThai(satang) + "สตางค์");
}

const formatAmount = (s: bigint) => `${s / 100n}.${(s % 100n).toString().padStart(2, "0")}`;

export const thaiBahtText: ChallengeDefinition<{ amounts: string[] }, string[]> = {
  id: "thai-baht-text",
  version: 1,
  league: "thai",
  category: "thai-text",
  title: "Baht Text",
  summary: "Convert amounts into Thai baht text (BAHTTEXT rules).",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "Convert each amount in `input.amounts` (baht, 2 decimals) to Thai baht text, like Excel `BAHTTEXT`.",
    "",
    "Rules:",
    "- Whole baht only → end with `บาทถ้วน`; with satang → `...บาท...สตางค์`; baht 0 with satang → only `...สตางค์`; 0.00 → `ศูนย์บาทถ้วน`.",
    "- Tens: 1 → `สิบ`, 2 → `ยี่สิบ`. Units digit 1 → `เอ็ด` when any higher non-zero digit exists (also across ล้าน); otherwise `หนึ่ง`.",
    "- Leading 1 in ร้อย/พัน/หมื่น/แสน/ล้าน is spoken: `หนึ่งร้อย`, `หนึ่งล้าน`.",
    "- Examples: 101.00 → `หนึ่งร้อยเอ็ดบาทถ้วน`; 1000001.00 → `หนึ่งล้านเอ็ดบาทถ้วน`; 21.21 → `ยี่สิบเอ็ดบาทยี่สิบเอ็ดสตางค์`; 0.01 → `หนึ่งสตางค์`.",
    "",
    "Answer format: JSON array of strings in the same order, no spaces, e.g. `[\"หนึ่งบาทถ้วน\", ...]`.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const amounts = Array.from({ length: 12 }, (_, i) => {
      const bahtMax = [100, 1_000, 100_000, 10_000_000, 999_999_999][i % 5]!;
      let baht = BigInt(rng.int(0, bahtMax));
      if (i % 4 === 3) baht = baht * 1_000_000n + BigInt(rng.pick([0, 1, 10, 11, 21, 101])); // ล้าน + เอ็ด traps
      const satang = BigInt(rng.pick([0, 0, 1, 11, 21, rng.int(2, 99)]));
      return baht * 100n + satang;
    });
    return { input: { amounts: amounts.map(formatAmount) }, expected: amounts.map(bahtText) };
  },
  verify(submitted, expected) {
    if (!Array.isArray(submitted) || submitted.length !== expected.length) {
      return { correct: false, accuracy: 0, feedback: `Expected a JSON array of ${expected.length} strings.` };
    }
    const hits = expected.filter((e, i) => typeof submitted[i] === "string" && submitted[i].replace(/\s+/g, "") === e).length;
    return { correct: hits === expected.length, accuracy: hits / expected.length };
  },
};
