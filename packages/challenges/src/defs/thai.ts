import type { ChallengeDefinition, Json } from "@arena/core";
import { createRng } from "../rng";
import { money, roundDiv, verifyItems } from "./_util";

type Def<I extends Json, A extends Json> = ChallengeDefinition<I, A>;

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export const thaiDateConvert: Def<{ items: { direction: "th->iso" | "iso->th"; value: string }[] }, string[]> = {
  id: "thai-date-convert",
  version: 1,
  league: "thai",
  category: "thai-date",
  title: "พ.ศ. ↔ ค.ศ. Dates",
  summary: "Convert Thai Buddhist-era dates to ISO and back.",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "Each item in `input.items` has a `direction` and a `value`. พ.ศ. = ค.ศ. + 543.",
    "- `th->iso`: value is a Thai date like `5 มกราคม 2567`, `5 ม.ค. 2567`, `5 ม.ค. 67` (2-digit year means 25xx), or prefixed with `พ.ศ.` before the year. Return ISO `YYYY-MM-DD` (ค.ศ.).",
    "- `iso->th`: value is ISO `YYYY-MM-DD`. Return `<day> <full Thai month> <พ.ศ. year>` with no leading zero on the day and no `พ.ศ.` prefix, e.g. `29 กุมภาพันธ์ 2567`.",
    "",
    "Answer format: JSON array of strings in the same order.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const items: { direction: "th->iso" | "iso->th"; value: string }[] = [];
    const expected: string[] = [];
    for (let i = 0; i < 15; i++) {
      const y = rng.int(1950, 2035);
      const m = rng.int(0, 11);
      const leapTrap = i % 5 === 4;
      const year = leapTrap ? y - (y % 4) : y; // multiple of 4 → 29 ก.พ. is valid (1950–2035 has no century exception)
      const month = leapTrap ? 1 : m;
      const day = leapTrap ? 29 : rng.int(1, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const be = year + 543;
      const thFull = `${day} ${MONTHS[month]} ${be}`;
      if (rng.next() < 0.5) {
        items.push({ direction: "iso->th", value: iso });
        expected.push(thFull);
      } else {
        const style = rng.int(0, 3);
        const value = [thFull, `${day} ${MONTHS_ABBR[month]} ${be}`, `${day} ${MONTHS_ABBR[month]} ${be % 100}`, `${day} ${MONTHS[month]} พ.ศ. ${be}`][style]!;
        items.push({ direction: "th->iso", value });
        expected.push(iso);
      }
    }
    return { input: { items }, expected };
  },
  verify: (s, e) => verifyItems(s, e, (a, b) => typeof a === "string" && a.trim().replace(/\s+/g, " ") === b),
};

export function thaiIdCheckDigit(first12: string) {
  const sum = first12.split("").reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10;
}

export const thaiIdChecksum: Def<{ ids: string[] }, boolean[]> = {
  id: "thai-id-checksum",
  version: 1,
  league: "thai",
  category: "thai-id",
  title: "Thai ID Checksum",
  summary: "Validate synthetic Thai national ID numbers (mod-11 check digit).",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "`input.ids` are **synthetic** 13-digit Thai national ID numbers, sometimes written with dashes (`1-2345-67890-12-1`) or spaces.",
    "Valid = after removing dashes/spaces it is exactly 13 digits, the first digit is not 0, and the check digit is correct:",
    "`sum = Σ digit[i] × (13 − i)` for i = 0..11, `check = (11 − sum mod 11) mod 10`, must equal digit[12].",
    "",
    "Answer format: JSON array of booleans in the same order.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const ids: string[] = [];
    const expected: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      let body = String(rng.int(1, 8)) + Array.from({ length: 11 }, () => rng.int(0, 9)).join("");
      let check = thaiIdCheckDigit(body);
      const kind = rng.int(0, 5);
      if (kind === 3) check = (check + rng.int(1, 9)) % 10; // wrong check digit
      if (kind === 4) body = "0" + body.slice(1); // leading zero
      let digits = body + check;
      if (kind === 5) digits = rng.next() < 0.5 ? digits.slice(0, 12) : digits + rng.int(0, 9); // wrong length
      const valid = digits.length === 13 && digits[0] !== "0" && thaiIdCheckDigit(digits.slice(0, 12)) === Number(digits[12]);
      const style = rng.int(0, 2);
      const shown =
        style === 1 && digits.length === 13
          ? `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`
          : style === 2 && digits.length === 13
            ? `${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits[12]}`
            : digits;
      ids.push(shown);
      expected.push(valid);
    }
    return { input: { ids }, expected };
  },
  verify: (s, e) => verifyItems(s, e),
};

// [subdistrict, district, province, postcode]; Bangkok uses แขวง/เขต instead of ตำบล/อำเภอ.
const PLACES: [string, string, string, string][] = [
  ["บางนา", "บางนา", "กรุงเทพมหานคร", "10260"],
  ["ลาดยาว", "จตุจักร", "กรุงเทพมหานคร", "10900"],
  ["สีลม", "บางรัก", "กรุงเทพมหานคร", "10500"],
  ["ช้างเผือก", "เมืองเชียงใหม่", "เชียงใหม่", "50300"],
  ["สุเทพ", "เมืองเชียงใหม่", "เชียงใหม่", "50200"],
  ["ในเมือง", "เมืองขอนแก่น", "ขอนแก่น", "40000"],
  ["หาดใหญ่", "หาดใหญ่", "สงขลา", "90110"],
  ["ปากเกร็ด", "ปากเกร็ด", "นนทบุรี", "11120"],
  ["บางพลีใหญ่", "บางพลี", "สมุทรปราการ", "10540"],
  ["ตลาดใหญ่", "เมืองภูเก็ต", "ภูเก็ต", "83000"],
  ["หนองปรือ", "บางละมุง", "ชลบุรี", "20150"],
  ["ในเมือง", "เมืองนครราชสีมา", "นครราชสีมา", "30000"],
];
const ROADS = ["สุขุมวิท", "พหลโยธิน", "รัชดาภิเษก", "เพชรเกษม", "มิตรภาพ", "นิมมานเหมินท์", "สีลม", "เทพารักษ์"];
const FIELDS = ["house_no", "moo", "road", "subdistrict", "district", "province", "postcode"] as const;
type Address = Record<(typeof FIELDS)[number], string | null>;

export const thaiAddressParse: Def<{ addresses: string[] }, Address[]> = {
  id: "thai-address-parse",
  version: 1,
  league: "thai",
  category: "thai-text",
  title: "Thai Address Parser",
  summary: "Split free-form Thai addresses into structured fields.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "Parse each string in `input.addresses` into an object with keys:",
    "`house_no`, `moo`, `road`, `subdistrict`, `district`, `province`, `postcode`.",
    "- Strip prefixes: `หมู่`/`ม.`, `ถนน`/`ถ.`, `ตำบล`/`ต.`/`แขวง`, `อำเภอ`/`อ.`/`เขต`, `จังหวัด`/`จ.`.",
    "- `province` is the full name; `กทม.` and `กรุงเทพฯ` mean `กรุงเทพมหานคร`.",
    "- `moo` (digits only) and `road` are `null` when absent. All values are strings or null.",
    "",
    'Answer format: JSON array of objects in the same order, e.g. `[{"house_no":"99/1","moo":"3","road":"สุขุมวิท","subdistrict":"บางนา","district":"บางนา","province":"กรุงเทพมหานคร","postcode":"10260"}]`.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const addresses: string[] = [];
    const expected: Address[] = [];
    for (let i = 0; i < 10; i++) {
      const [sub, dist, prov, postcode] = rng.pick(PLACES);
      const bkk = prov === "กรุงเทพมหานคร";
      const house = rng.next() < 0.5 ? String(rng.int(1, 999)) : `${rng.int(1, 999)}/${rng.int(1, 99)}`;
      const moo = !bkk && rng.next() < 0.6 ? String(rng.int(1, 15)) : null;
      const road = rng.next() < 0.7 ? rng.pick(ROADS) : null;
      const abbr = rng.next() < 0.5;
      const parts = [house];
      if (moo) parts.push(abbr ? `ม.${moo}` : `หมู่ ${moo}`);
      if (road) parts.push(abbr ? `ถ.${road}` : `ถนน${road}`);
      parts.push(bkk ? `แขวง${sub}` : abbr ? `ต.${sub}` : `ตำบล${sub}`);
      parts.push(bkk ? `เขต${dist}` : abbr ? `อ.${dist}` : `อำเภอ${dist}`);
      parts.push(bkk ? rng.pick(["กรุงเทพมหานคร", "กทม.", "กรุงเทพฯ"]) : abbr ? `จ.${prov}` : `จังหวัด${prov}`);
      parts.push(postcode);
      addresses.push(parts.join(" "));
      expected.push({ house_no: house, moo, road, subdistrict: sub, district: dist, province: prov, postcode });
    }
    return { input: { addresses }, expected };
  },
  verify(submitted, expected) {
    if (!Array.isArray(submitted) || submitted.length !== expected.length) return { correct: false, accuracy: 0, feedback: `Expected ${expected.length} objects.` };
    let hits = 0;
    expected.forEach((e, i) => {
      const s = submitted[i] as Record<string, unknown> | null;
      for (const f of FIELDS) if (s && typeof s === "object" && (s[f] ?? null) === e[f]) hits++;
    });
    const total = expected.length * FIELDS.length;
    return { correct: hits === total, accuracy: hits / total };
  },
};

type Invoice = { items: { description: string; amount: number }[]; vat_mode: "inclusive" | "exclusive" | "none"; wht_rate: 0 | 1 | 3 | 5 };
type Totals = { base: number; vat: number; wht: number; net: number };

/** All math in satang, round half up at each step. */
export function invoiceTotals(inv: Invoice): Totals {
  const gross = inv.items.reduce((a, i) => a + Math.round(i.amount * 100), 0);
  const base = inv.vat_mode === "inclusive" ? roundDiv(gross * 100, 107) : gross;
  const vat = inv.vat_mode === "inclusive" ? gross - base : inv.vat_mode === "exclusive" ? roundDiv(base * 7, 100) : 0;
  const wht = roundDiv(base * inv.wht_rate, 100);
  return { base: base / 100, vat: vat / 100, wht: wht / 100, net: (base + vat - wht) / 100 };
}

const SERVICES = ["ค่าออกแบบเว็บไซต์", "ค่าที่ปรึกษา", "ค่าเช่าสำนักงาน", "ค่าขนส่ง", "ค่าโฆษณา", "ค่าบำรุงรักษาระบบ", "ค่าอบรม"];

export const thaiVatWht: Def<{ invoices: Invoice[] }, Totals[]> = {
  id: "thai-vat-wht",
  version: 1,
  league: "thai",
  category: "thai-tax",
  title: "VAT & Withholding Tax",
  summary: "Compute VAT 7% and withholding tax for Thai invoices.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "For each invoice in `input.invoices` compute `base` (pre-VAT), `vat`, `wht` (ภาษีหัก ณ ที่จ่าย) and `net` (amount actually paid).",
    "Work in satang and round **half up** to the satang at each step:",
    "- `gross` = sum of item `amount`s.",
    "- `vat_mode` `exclusive`: base = gross, vat = 7% × base. `inclusive`: base = gross × 100 / 107, vat = gross − base. `none`: base = gross, vat = 0.",
    "- wht = `wht_rate`% × base (withholding is on the pre-VAT amount).",
    "- net = base + vat − wht.",
    "",
    'Answer format: JSON array of `{ "base": n, "vat": n, "wht": n, "net": n }` in baht (2 decimals), same order.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const invoices: Invoice[] = Array.from({ length: 10 }, () => ({
      items: Array.from({ length: rng.int(1, 4) }, () => ({ description: rng.pick(SERVICES), amount: rng.int(10_000, 10_000_000) / 100 })),
      vat_mode: rng.pick(["inclusive", "exclusive", "exclusive", "none"] as const),
      wht_rate: rng.pick([0, 1, 3, 3, 5] as const),
    }));
    return { input: { invoices }, expected: invoices.map(invoiceTotals) };
  },
  verify: (s, e) =>
    verifyItems(s, e, (a, b) => {
      if (!a || typeof a !== "object") return false;
      const o = a as Record<string, unknown>;
      return money(o.base, b.base) && money(o.vat, b.vat) && money(o.wht, b.wht) && money(o.net, b.net);
    }),
};

