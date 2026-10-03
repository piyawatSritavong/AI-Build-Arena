import type { ChallengeDefinition } from "@arena/core";
import { createRng, type Rng } from "../rng";
import { shuffle, verifyRecord } from "./_util";

// Memory Fitness: can the setup remember project facts across sessions?
// Facts are invented from the seed (nothing to guess from training data). Learn day shows all 12 facts and asks 4;
// the exam, `days` later in a fresh session without the facts, asks about the other 8.

type Questions = { questions: Record<string, string> };
type LearnInput = Questions & { project: string; facts: string[] };
type Answers = Record<string, string>;

const SYL = "ka ri mo ta ve lo nu si pa de zu fi go ha ji ke lu mi no pe ro sa tu wi ya".split(" ");
const word = (rng: Rng, n = 2) => Array.from({ length: n }, () => rng.pick(SYL)).join("");
const FIRST = ["Anan", "Bea", "Chai", "Dara", "Emil", "Fah", "Goro", "Hana", "Ilse", "Joon", "Kiri", "Lumi"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const REGIONS = ["ap-southeast-7", "eu-north-3", "us-west-5", "sa-east-4", "me-central-2", "af-south-3"];

interface Fact {
  key: string;
  fact: (v: string) => string;
  question: string;
  value: (rng: Rng) => string;
}
const FACTS: Fact[] = [
  { key: "staging_port", fact: (v) => `The staging server listens on port ${v}.`, question: "Which port does the staging server listen on?", value: (r) => String(r.int(3100, 9899)) },
  { key: "deploy_day", fact: (v) => `Production deploys happen only on ${v}.`, question: "On which weekday do production deploys happen?", value: (r) => r.pick(DAYS) },
  { key: "on_call", fact: (v) => `The on-call engineer this quarter is ${v}.`, question: "Who is the on-call engineer this quarter?", value: (r) => `${r.pick(FIRST)} ${word(r, 3)}` },
  { key: "database", fact: (v) => `The main database is named ${v}.`, question: "What is the main database named?", value: (r) => `${word(r)}_${word(r)}` },
  { key: "feature_flag", fact: (v) => `The new checkout is behind the feature flag ${v}.`, question: "Which feature flag hides the new checkout?", value: (r) => `ff_${word(r, 3)}` },
  { key: "error_code", fact: (v) => `Error code ${v} means the payment provider timed out.`, question: "Which error code means the payment provider timed out?", value: (r) => `E-${r.int(1000, 9999)}` },
  { key: "release", fact: (v) => `The current release is ${v}.`, question: "What is the current release version?", value: (r) => `v${r.int(2, 9)}.${r.int(0, 19)}.${r.int(0, 29)}` },
  { key: "region", fact: (v) => `Everything runs in the ${v} region.`, question: "Which cloud region does everything run in?", value: (r) => r.pick(REGIONS) },
  { key: "channel", fact: (v) => `Incidents are reported in the chat channel #${v}.`, question: "In which chat channel are incidents reported? (without #)", value: (r) => `${word(r)}-${word(r)}` },
  { key: "bucket", fact: (v) => `Build artifacts are stored in the bucket ${v}.`, question: "Which bucket stores build artifacts?", value: (r) => `${word(r)}-artifacts-${r.int(10, 99)}` },
  { key: "reviewers", fact: (v) => `Every pull request needs ${v} approving reviews.`, question: "How many approving reviews does a pull request need? (a number)", value: (r) => String(r.int(2, 6)) },
  { key: "mascot", fact: (v) => `The team mascot is a ${v} named after the project.`, question: "What animal is the team mascot?", value: (r) => r.pick(["capybara", "axolotl", "pangolin", "okapi", "quokka", "tapir"]) },
];

function build(seed: string) {
  const rng = createRng(seed);
  const project = `Project ${word(rng).replace(/^./, (c) => c.toUpperCase())}`;
  const values = FACTS.map((f) => f.value(rng));
  const order = shuffle(rng, FACTS.map((_, i) => i));
  const ask = (idx: number[]) => ({
    questions: Object.fromEntries(idx.map((i, n) => [`q${n + 1}`, `${project}: ${FACTS[i]!.question}`])),
    expected: Object.fromEntries(idx.map((i, n) => [`q${n + 1}`, values[i]!])),
  });
  return { project, facts: shuffle(rng, FACTS.map((f, i) => f.fact(values[i]!))).map((f) => `${project}: ${f}`), quiz: ask(order.slice(0, 4)), exam: ask(order.slice(4)) };
}

const norm = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, " ") : null);
const verify = (submitted: unknown, expected: Answers) => {
  const r = verifyRecord(submitted, expected, (a, b) => norm(a) === norm(b));
  return { ...r, correct: r.accuracy >= 0.75 }; // memory is graded: 6 of 8 recalled is a pass
};
const FORMAT = 'Answer format: a JSON object mapping each question id to a short string, e.g. `{"q1": "8421", "q2": "Tuesday"}`. Matching ignores case and spacing.';

export const memoryFitness: ChallengeDefinition<Questions | LearnInput, Answers> = {
  id: "memory-fitness",
  version: 1,
  league: "global",
  category: "memory",
  title: "Memory Fitness",
  summary: "Learn 12 project facts today, recall them in a new session 3 days later.",
  difficulty: 3,
  timeLimitSeconds: 900,
  prompt: [
    "**Memory exam.** A few days ago you were given facts about the project named in the questions and asked to remember them.",
    "They are **not** available here: answer from whatever memory your setup keeps (memory files, a memory server, notes outside this folder).",
    "If you do not remember a fact, give your best guess or an empty string.",
    "",
    FORMAT,
  ].join("\n"),
  generate(seed) {
    const { exam } = build(seed);
    return { input: { questions: exam.questions }, expected: exam.expected };
  },
  verify,
  memory: {
    days: 3,
    examWindowDays: 7,
    learnPrompt: [
      "**Memory Fitness, learn day.** `input.facts` lists facts about a project. In **3 days**, in a brand-new session, you will be asked about them **without** this data.",
      "1. Save the facts wherever your setup keeps long-term memory (memory files, a memory server, your notes). This folder will be deleted.",
      "2. Answer the quiz in `input.questions` now.",
      "",
      FORMAT,
    ].join("\n"),
    learn(seed) {
      const { project, facts, quiz } = build(seed);
      return { input: { project, facts, questions: quiz.questions }, expected: quiz.expected };
    },
  },
};
