import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { api } from "./api";
import type { Variant } from "./agent";
import { baseUrl, configDir, type Credentials } from "./config";

// Memory Fitness through the CLI. Each variant gets a fixed workspace folder so memory the client keys by project
// (e.g. Claude Code's per-project memory) carries over from the learn day to the exam. Its files are deleted after
// every run: only memory kept outside the folder can answer the exam.

export const MEMORY_CHALLENGE = "memory-fitness";

export interface MemoryRound {
  variant: Variant;
  status: "learning" | "waiting" | "examined" | "expired";
  learn_accuracy: number | null;
  exam_accuracy: number | null;
  exam_due_at: string | null;
  exam_closes_at: string | null;
}

export async function memoryWorkspace(variant: Variant) {
  const dir = join(configDir(), "memory", variant);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Delete everything inside the folder but keep the folder (its path is the "project"). */
export async function emptyDir(dir: string) {
  for (const name of await readdir(dir).catch(() => [] as string[])) await rm(join(dir, name), { recursive: true, force: true });
}

export async function memoryRounds(creds: Credentials): Promise<MemoryRound[]> {
  return (await api<{ rounds: MemoryRound[] }>(baseUrl(creds), "/api/cli/memory", { token: creds.token })).rounds;
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(Number(n) * 100)}%`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const isDue = (r: MemoryRound, now = new Date()) => r.status === "waiting" && !!r.exam_due_at && new Date(r.exam_due_at) <= now;

export function describeRounds(rounds: MemoryRound[], now = new Date()) {
  if (!rounds.length) return "Memory Fitness: no rounds yet. `setuptier memory start` gives your AI facts to remember; the exam is 3 days later.";
  return [
    "Memory Fitness:",
    ...rounds.map((r) => {
      const state =
        r.status === "waiting"
          ? isDue(r, now)
            ? `exam OPEN until ${when(r.exam_closes_at)} → setuptier memory exam`
            : `waiting, exam opens ${when(r.exam_due_at)}`
          : r.status === "examined"
            ? `done: learn-day quiz ${pct(r.learn_accuracy)}, recalled ${pct(r.exam_accuracy)}`
            : r.status === "learning"
              ? "learn day not finished → setuptier memory start"
              : "expired → setuptier memory start";
      return `  ${r.variant.padEnd(5)} ${state}`;
    }),
  ].join("\n");
}

/** One line when an exam is open, for other commands. Never fails the command it decorates. */
export async function memoryReminder(creds: Credentials): Promise<string | null> {
  try {
    const due = (await Promise.race([memoryRounds(creds), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 3000))])).filter((r) => isDue(r));
    if (!due.length) return null;
    return `⏰ Memory exam is open (${due.map((r) => r.variant).join(" + ")}) until ${when(due[0]!.exam_closes_at)}: run \`setuptier memory exam\`.`;
  } catch {
    return null;
  }
}
