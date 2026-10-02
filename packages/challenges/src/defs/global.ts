import type { ChallengeDefinition, Json } from "@arena/core";
import { createRng } from "../rng";
import { money, same, shuffle, verifyExact, verifyItems, verifyRecord } from "./_util";

type Def<I extends Json, A extends Json> = ChallengeDefinition<I, A>;

export const intervalMerge: Def<{ intervals: [number, number][] }, [number, number][]> = {
  id: "interval-merge",
  version: 1,
  league: "global",
  category: "algorithm",
  title: "Interval Merge",
  summary: "Merge overlapping or touching integer intervals.",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "`input.intervals` is a list of closed integer intervals `[start, end]` (unsorted).",
    "Merge intervals that overlap **or touch** (`[1,3]` + `[3,5]` → `[1,5]`; `[1,3]` + `[4,5]` stay separate).",
    "",
    "Answer format: JSON array of `[start, end]` pairs sorted by start, e.g. `[[1,5],[8,9]]`.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const intervals = Array.from({ length: 150 }, (): [number, number] => {
      const s = rng.int(0, 10_000);
      return [s, s + rng.int(0, 120)];
    });
    const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: [number, number][] = [];
    for (const [s, e] of sorted) {
      const last = merged.at(-1);
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    return { input: { intervals }, expected: merged };
  },
  verify(submitted, expected) {
    if (!Array.isArray(submitted)) return { correct: false, accuracy: 0 };
    const want = new Set(expected.map((x) => JSON.stringify(x)));
    const hits = submitted.filter((x) => want.has(JSON.stringify(x))).length;
    const correct = same(submitted, expected);
    return { correct, accuracy: correct ? 1 : hits / Math.max(expected.length, submitted.length) };
  },
};

const WORDS = "agent build cache claude codex context data deploy eval gear graph hook index lift loop memory model prompt query rank repo score seed skill stack task test token tool trace vector".split(" ");

export const wordFrequency: Def<{ text: string }, [string, number][]> = {
  id: "word-frequency",
  version: 1,
  league: "global",
  category: "data",
  title: "Word Frequency",
  summary: "Top 10 words by frequency with deterministic tie-breaking.",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "Count words in `input.text`. A word is a maximal run of letters `a-z` after lowercasing (punctuation and digits separate words).",
    "Return the 10 most frequent words, sorted by count descending, ties broken alphabetically ascending.",
    "",
    'Answer format: JSON array of `[word, count]`, e.g. `[["model", 61], ["agent", 58], ...]`.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const weights = WORDS.map(() => rng.int(1, 6));
    const pool = WORDS.flatMap((w, i) => Array<string>(weights[i]!).fill(w));
    const tokens = Array.from({ length: 1500 }, () => {
      const w = rng.pick(pool);
      const cased = rng.next() < 0.15 ? w.toUpperCase() : rng.next() < 0.2 ? w[0]!.toUpperCase() + w.slice(1) : w;
      return cased + rng.pick(["", "", "", "", ",", ".", "!", "?", ";", " 42"]);
    });
    const counts = new Map<string, number>();
    for (const w of tokens.join(" ").toLowerCase().match(/[a-z]+/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
    const expected = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10);
    return { input: { text: tokens.join(" ") }, expected };
  },
  verify: (s, e) => verifyItems(s, e),
};

export const gridShortestPath: Def<{ grid: string[] }, number> = {
  id: "grid-shortest-path",
  version: 1,
  league: "global",
  category: "algorithm",
  title: "Grid Shortest Path",
  summary: "Fewest moves from S to E in a walled grid.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "`input.grid` is a list of equal-length rows: `.` open, `#` wall, `S` start, `E` end.",
    "Moves are up/down/left/right, one cell per move, never through walls or outside the grid.",
    "",
    "Answer format: a JSON number — the minimum number of moves from S to E, or `-1` if unreachable.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const n = 40;
    const cells: string[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => (rng.next() < 0.3 ? "#" : ".")));
    const [sr, sc, er, ec] = [rng.int(0, 9), rng.int(0, n - 1), rng.int(n - 10, n - 1), rng.int(0, n - 1)];
    cells[sr]![sc] = "S";
    cells[er]![ec] = "E";
    const dist = new Map<number, number>([[sr * n + sc, 0]]);
    const queue = [sr * n + sc];
    let expected = -1;
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      const [r, c] = [Math.floor(cur / n), cur % n];
      if (r === er && c === ec) {
        expected = dist.get(cur)!;
        break;
      }
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const [nr, nc] = [r + dr, c + dc];
        const key = nr * n + nc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n || cells[nr]![nc] === "#" || dist.has(key)) continue;
        dist.set(key, dist.get(cur)! + 1);
        queue.push(key);
      }
    }
    return { input: { grid: cells.map((row) => row.join("")) }, expected };
  },
  verify: (s, e) => verifyExact(typeof s === "string" ? Number(s) : s, e),
};

const REGIONS = ["north", "south", "east", "west", "central"];
const PRODUCTS = ["widget", "gadget", "gizmo", "doohickey", "sprocket"];

export const csvRevenue: Def<{ csv: string }, Record<string, number>> = {
  id: "csv-revenue",
  version: 1,
  league: "global",
  category: "data",
  title: "CSV Revenue",
  summary: "Aggregate paid revenue per region from a CSV export.",
  difficulty: 2,
  timeLimitSeconds: 600,
  prompt: [
    "`input.csv` has header `order_id,region,product,qty,unit_price,status`.",
    "Revenue of a row = `qty × unit_price`. Count only rows with `status` = `paid` (case-insensitive, surrounding spaces ignored).",
    "Sum revenue per region (region names are case-insensitive; report them lowercase).",
    "",
    'Answer format: JSON object `{ "<region>": <revenue rounded to 2 decimals> }` for every region that has at least one paid row.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const totals: Record<string, number> = {}; // satang
    const rows = Array.from({ length: 300 }, (_, i) => {
      const region = rng.pick(REGIONS);
      const qty = rng.int(1, 20);
      const price = rng.int(99, 99_999); // satang
      const status = rng.pick(["paid", "paid", "paid", "Paid ", "refunded", "pending"]);
      if (status.trim().toLowerCase() === "paid") totals[region] = (totals[region] ?? 0) + qty * price;
      const shownRegion = rng.next() < 0.1 ? region.toUpperCase() : region;
      return [`ord-${1000 + i}`, shownRegion, rng.pick(PRODUCTS), qty, (price / 100).toFixed(2), status].join(",");
    });
    const expected = Object.fromEntries(Object.entries(totals).map(([r, s]) => [r, s / 100]));
    return { input: { csv: ["order_id,region,product,qty,unit_price,status", ...rows].join("\n") }, expected };
  },
  verify: (s, e) => verifyRecord(s, e, money),
};

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };

function balanced(s: string) {
  const stack: string[] = [];
  for (const ch of s) {
    if (PAIRS[ch]) stack.push(PAIRS[ch]!);
    else if (stack.pop() !== ch) return false;
  }
  return stack.length === 0;
}

export const bracketBalance: Def<{ strings: string[] }, boolean[]> = {
  id: "bracket-balance",
  version: 1,
  league: "global",
  category: "logic",
  title: "Bracket Balance",
  summary: "Decide which bracket strings are balanced.",
  difficulty: 1,
  timeLimitSeconds: 300,
  prompt: [
    "Each string in `input.strings` uses only `()[]{}<>`. A string is balanced if every opener is closed by the matching closer in the correct nesting order.",
    "",
    "Answer format: JSON array of booleans in the same order, e.g. `[true, false, ...]`.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const make = (len: number) => {
      let out = "";
      const stack: string[] = [];
      while (out.length + stack.length < len) {
        if (stack.length && rng.next() < 0.45) out += stack.pop();
        else {
          const o = rng.pick(Object.keys(PAIRS));
          out += o;
          stack.push(PAIRS[o]!);
        }
      }
      return out + stack.reverse().join("");
    };
    const strings = Array.from({ length: 30 }, () => {
      const s = make(rng.int(10, 60));
      if (rng.next() < 0.5) return s;
      const i = rng.int(0, s.length - 1); // mutate one char (may or may not stay balanced)
      return s.slice(0, i) + rng.pick("()[]{}<>".split("")) + s.slice(i + 1);
    });
    return { input: { strings }, expected: strings.map(balanced) };
  },
  verify: (s, e) => verifyItems(s, e),
};

const USERS = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"];

export const logSessions: Def<{ lines: string[] }, Record<string, number>> = {
  id: "log-sessions",
  version: 1,
  league: "global",
  category: "data",
  title: "Log Sessions",
  summary: "Count user sessions from unordered access logs.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "`input.lines` are access-log lines (NOT sorted) like `2026-03-01T08:15:02Z user=alice action=click`.",
    "For each user, order their events by time. A new session starts at the user's first event and whenever the gap since their previous event is **more than 30 minutes** (exactly 30:00 continues the session).",
    "",
    'Answer format: JSON object `{ "<user>": <session count> }` for every user that appears.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const base = Date.UTC(2026, 2, 1, 6);
    const events: [string, number][] = [];
    for (const user of USERS.slice(0, rng.int(5, 8))) {
      let t = base + rng.int(0, 3600) * 1000;
      for (let i = rng.int(20, 60); i > 0; i--) {
        events.push([user, t]);
        const gap = rng.next() < 0.15 ? rng.int(1700, 7200) : rng.next() < 0.05 ? 1800 : rng.int(5, 900);
        t += gap * 1000;
      }
    }
    const expected: Record<string, number> = {};
    const last: Record<string, number> = {};
    for (const [u, t] of [...events].sort((a, b) => a[1] - b[1])) {
      if (last[u] === undefined || t - last[u]! > 30 * 60 * 1000) expected[u] = (expected[u] ?? 0) + 1;
      last[u] = t;
    }
    const lines = shuffle(rng, events).map(([u, t]) => `${new Date(t).toISOString().replace(".000", "")} user=${u} action=${rng.pick(["view", "click", "search", "save"])}`);
    return { input: { lines }, expected };
  },
  verify: (s, e) => verifyRecord(s, e),
};

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function toRoman(n: number) {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) [out, n] = [out + s, n - v];
  return out;
}

export const romanNumerals: Def<{ numbers: number[] }, string[]> = {
  id: "roman-numerals",
  version: 1,
  league: "global",
  category: "logic",
  title: "Roman Numerals",
  summary: "Convert integers 1–3999 to standard Roman numerals.",
  difficulty: 1,
  timeLimitSeconds: 300,
  prompt: [
    "Convert each integer in `input.numbers` (1–3999) to an uppercase Roman numeral using standard subtractive notation (4 = IV, 9 = IX, 40 = XL, 90 = XC, 400 = CD, 900 = CM).",
    "",
    'Answer format: JSON array of strings in the same order, e.g. `["XIV", "MCMXC"]`.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const numbers = Array.from({ length: 25 }, () => rng.int(1, 3999));
    return { input: { numbers }, expected: numbers.map(toRoman) };
  },
  verify: (s, e) => verifyItems(s, e, (a, b) => typeof a === "string" && a.trim() === b),
};

const TASK_WORDS = "api auth cache cdn ci db docs etl infra lint load logs mail mcp metrics migrate oauth queue search seed sso tests ui web".split(" ");

export const topoOrder: Def<{ deps: Record<string, string[]> }, string[]> = {
  id: "topo-order",
  version: 1,
  league: "global",
  category: "algorithm",
  title: "Task Order",
  summary: "Lexicographically smallest valid order for dependent tasks.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "`input.deps` maps each task to the tasks that must finish before it starts. Every task appears as a key.",
    "Return an order that runs every task exactly once and respects all dependencies. Among all valid orders, return the **lexicographically smallest** sequence (at each step pick the alphabetically smallest ready task).",
    "",
    'Answer format: JSON array of task names, e.g. `["api", "db", ...]`.',
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const tasks = shuffle(rng, TASK_WORDS).slice(0, 20).map((w, i) => `${w}-${i + 1}`);
    const order = shuffle(rng, tasks);
    const deps: Record<string, string[]> = Object.fromEntries(tasks.map((t) => [t, []]));
    order.forEach((t, i) => {
      for (let j = 0; j < i; j++) if (rng.next() < 0.12) deps[t]!.push(order[j]!);
    });
    const remaining = new Map(tasks.map((t) => [t, new Set(deps[t])]));
    const expected: string[] = [];
    while (remaining.size) {
      const next = [...remaining].filter(([, d]) => d.size === 0).map(([t]) => t).sort()[0]!;
      expected.push(next);
      remaining.delete(next);
      for (const d of remaining.values()) d.delete(next);
    }
    return { input: { deps }, expected };
  },
  verify(submitted, expected) {
    if (same(submitted, expected)) return { correct: true, accuracy: 1 };
    return { correct: false, accuracy: 0, feedback: "Not the lexicographically smallest valid order." };
  },
};

export const knapsack: Def<{ capacity: number; items: { weight: number; value: number }[] }, number> = {
  id: "knapsack",
  version: 1,
  league: "global",
  category: "algorithm",
  title: "Knapsack",
  summary: "Maximum value of a 0/1 knapsack.",
  difficulty: 4,
  timeLimitSeconds: 900,
  prompt: [
    "Choose a subset of `input.items` (each used at most once) whose total `weight` ≤ `input.capacity`, maximising total `value`.",
    "",
    "Answer format: a JSON number — the maximum total value.",
  ].join("\n"),
  generate(seed) {
    const rng = createRng(seed);
    const items = Array.from({ length: 40 }, () => ({ weight: rng.int(1, 60), value: rng.int(1, 100) }));
    const capacity = Math.floor(items.reduce((a, i) => a + i.weight, 0) / 3);
    const best = new Array<number>(capacity + 1).fill(0);
    for (const { weight, value } of items) for (let c = capacity; c >= weight; c--) best[c] = Math.max(best[c]!, best[c - weight]! + value);
    return { input: { capacity, items }, expected: best[capacity]! };
  },
  verify: (s, e) => verifyExact(typeof s === "string" ? Number(s) : s, e),
};

