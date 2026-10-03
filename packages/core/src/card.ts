import type { League } from "./index";
// Hobby Pixel: "form is yours, aura is earned". Sprites are presets (12x12, '.' = transparent).

export interface Sprite {
  id: string;
  name: string;
  palette: Record<string, string>;
  rows: string[];
}

const K = "#1f2937"; // shared outline/eye colour
export const SPRITES: Sprite[] = [
  { id: "starter-1", name: "Slime", palette: { G: "#4ade80", D: "#16a34a", K, H: "#166534" }, rows: [
    "............", "............", "....GGGG....", "...GGGGGG...", "..GGGGGGGG..", "..GGKGGKGG..",
    ".GGGKGGKGGG.", ".GGGGGGGGGG.", ".GGGGHHGGGG.", "GGGGGGGGGGGG", "GGGGGGGGGGGG", ".DDDDDDDDDD." ] },
  { id: "robot", name: "Robot", palette: { R: "#ef4444", K, S: "#94a3b8", L: "#e2e8f0", C: "#22d3ee" }, rows: [
    ".....RR.....", ".....KK.....", "..SSSSSSSS..", "..SLLLLLLS..", "..SLCLLCLS..", "..SLLLLLLS..",
    "..SLKKKKLS..", "..SSSSSSSS..", "...SSSSSS...", ".SSSSSSSSSS.", ".SS.SSSS.SS.", "....S..S...." ] },
  { id: "ghost", name: "Ghost", palette: { W: "#f8fafc", K, P: "#f9a8d4" }, rows: [
    "....WWWW....", "..WWWWWWWW..", ".WWWWWWWWWW.", ".WWKKWWKKWW.", ".WWKKWWKKWW.", ".WWWWWWWWWW.",
    ".WWWWPPWWWW.", ".WWWWWWWWWW.", ".WWWWWWWWWW.", ".WWWWWWWWWW.", ".WW.WWW.WWW.", ".W...W...WW." ] },
  { id: "cat", name: "Cat", palette: { O: "#fb923c", G: "#84cc16", K, P: "#f472b6", T: "#ea580c" }, rows: [
    ".O........O.", ".OO......OO.", ".OOOOOOOOOO.", ".OOOOOOOOOO.", ".OGKOOOOGKO.", ".OOOOOOOOOO.",
    ".OOOOPPOOOO.", "..OOOOOOOO..", "..OOOOOOOO..", ".OOOOOOOOOO.", ".OOOOOOOOOOT", ".OO.OOOO.OOT" ] },
  { id: "mushroom", name: "Mushroom", palette: { R: "#dc2626", W: "#fef2f2", C: "#fde68a", K }, rows: [
    "....RRRR....", "..RRWWRRRR..", ".RRRWWRRWWR.", "RRRRRRRRWWRR", "RWWRRRRRRRRR", "RWWRRRWWRRRR",
    ".RRRRRWWRRR.", "...CCCCCC...", "...CKCCKC...", "...CCCCCC...", "...CCCCCC...", "....CCCC...." ] },
  { id: "cactus", name: "Cactus", palette: { G: "#22c55e", T: "#c2410c", B: "#7c2d12" }, rows: [
    ".....GG.....", "....GGGG....", "....GGGG.G..", ".G..GGGG.GG.", ".GG.GGGG.GG.", ".GG.GGGGGGG.",
    ".GGGGGGG....", "....GGGG....", "..TTTTTTTT..", "..TBBBBBBT..", "...TTTTTT...", "...TTTTTT..." ] },
  { id: "rocket", name: "Rocket", palette: { R: "#ef4444", W: "#f1f5f9", B: "#38bdf8", O: "#f97316", Y: "#facc15" }, rows: [
    ".....RR.....", "....RWWR....", "....WWWW....", "....WBBW....", "....WBBW....", "....WWWW....",
    "...RWWWWR...", "..RRWWWWRR..", "..R.WWWW.R..", "....OYYO....", ".....OO.....", ".....Y......" ] },
  { id: "coffee", name: "Coffee", palette: { S: "#cbd5e1", W: "#fafaf9", B: "#78350f", P: "#a8a29e" }, rows: [
    "...S..S.....", "....S..S....", "...S..S.....", "............", ".WWWWWWWW...", ".WBBBBBBWWW.",
    ".WBBBBBBW.W.", ".WWWWWWWW.W.", ".WWWWWWWWWW.", ".WWWWWWWW...", "..WWWWWW....", "PPPPPPPPPP.." ] },
  { id: "guitar", name: "Guitar", palette: { K, N: "#92400e", O: "#f59e0b" }, rows: [
    "..........KK", ".........KK.", "........NN..", ".......NN...", "......NN....", "..OOONN.....",
    ".OOOOOO.....", "OOOKKOOO....", "OOOKKOO.....", "OOOOOOOO....", ".OOOOOO.....", "..OOOO......" ] },
  { id: "dragon", name: "Dragon", palette: { H: "#fde68a", V: "#8b5cf6", Y: "#facc15", K, W: "#f8fafc", L: "#c4b5fd", F: "#f97316" }, rows: [
    "..H......H..", "..VV....VV..", "..VVVVVVVV..", ".VVYKVVYKVV.", ".VVVVVVVVVV.", ".VVVWVVWVVV.",
    "..VVVVVVVV.F", ".LLVVVVVVLLF", "LLLVVVVVVLLL", "L..VVVVVV..L", "...VV..VV...", "...VV..VV..." ] },
  { id: "knight", name: "Knight", palette: { R: "#dc2626", S: "#cbd5e1", K }, rows: [
    "....RRRR....", "...RR.......", "..SSSSSSSS..", ".SSSSSSSSSS.", ".SSSSSSSSSS.", ".SKKKKKKKKS.",
    ".SSSSSSSSSS.", ".SKSKSKSKSS.", ".SSSSSSSSSS.", ".SSSSSSSSSS.", "..SSSSSSSS..", "...SSSSSS..." ] },
  { id: "onigiri", name: "Onigiri", palette: { W: "#f8fafc", K, P: "#fda4af", N: "#14532d" }, rows: [
    ".....WW.....", "....WWWW....", "...WWWWWW...", "..WWWWWWWW..", "..WKWWWWKW..", ".WWWWWWWWWW.",
    ".WWWWPPWWWW.", "WWWNNNNNNWWW", "WWWNNNNNNWWW", "WWWNNNNNNWWW", "WWWNNNNNNWWW", ".WWNNNNNNWW." ] },
];

export const getSprite = (id: string | null | undefined) => SPRITES.find((s) => s.id === id) ?? SPRITES[0]!;

/** Pixel-perfect SVG string (works in the browser and in next/og via a data URI). */
export function spriteSvg(sprite: Sprite, px = 10): string {
  const rects = sprite.rows.flatMap((row, y) =>
    [...row].flatMap((ch, x) => (ch === "." ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${sprite.palette[ch]}"/>`])),
  );
  const size = 12 * px;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}
export const spriteDataUri = (sprite: Sprite, px = 10) => `data:image/svg+xml;base64,${btoa(spriteSvg(sprite, px))}`;

/** Aura colour = top category; stage = growth. */
export const AURA: Record<string, { label: string; color: string }> = {
  logic: { label: "Logic", color: "#38bdf8" },
  algorithm: { label: "Algorithm", color: "#a78bfa" },
  data: { label: "Data", color: "#34d399" },
  memory: { label: "Memory", color: "#f472b6" },
  thai: { label: "Thai League", color: "#fbbf24" },
  none: { label: "Unawakened", color: "#94a3b8" },
};
export function auraFor(topCategory: string | null | undefined) {
  if (!topCategory) return AURA.none!;
  return topCategory.startsWith("thai") ? AURA.thai! : (AURA[topCategory] ?? AURA.none!);
}

export type AuraStage = 0 | 1 | 2 | 3;
export const STAGE_NAMES = ["Egg", "Rookie", "Adept", "Ascended"] as const;
/** 0 none passed · 1 first pass · 2 five distinct passes · 3 ten passes with positive average Lift. */
export function auraStage(passed: number, avgLift: number | null | undefined): AuraStage {
  if (passed >= 10 && (avgLift ?? 0) > 0) return 3;
  if (passed >= 5) return 2;
  return passed >= 1 ? 1 : 0;
}

/** Shape returned by the profile_card() SQL function. */
export interface ProfileCard {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  build: { name: string; base_model: string; client: string | null; sprite_id: string; gear_count: number } | null;
  passed: number;
  total_score: number;
  avg_lift: number | null; // Paired Lift: weighted mean normalized gain of Full over Stock, −100…+100
  lift_challenges: number; // challenges with a Lift
  lift_verified: number; // … where Full and Stock both came from the CLI
  lift_own: number; // … measured against the user's own Stock runs (the rest use the community median)
  reliability: number | null; // Wilson lower bound of the pass rate on challenges run ≥ 3 times, 0–100
  reliability_runs: number;
  reliability_challenges: number;
  efficiency: number | null; // community median tokens per pass ÷ yours (geometric mean); > 1 = leaner than typical
  efficiency_challenges: number;
  tokens_per_pass: number | null;
  seconds_per_pass: number | null;
  cost_per_pass: number | null; // API-equivalent USD reported by the agent (CLI runs only)
  tokens_verified: boolean; // token counts measured by the CLI
  range: number | null; // 0–100: categories passed, weighted by the hardest difficulty passed in each
  range_categories: number | null; // categories with a pass
  range_total: number; // active categories
  professions: string[];
  top_category: string | null;
  global_rank: number | null;
  thai_rank: number | null;
  leagues: Partial<Record<League, number>>; // passes per league
  league_ranks: Partial<Record<League, number>>;
  anchors_passed: number;
  memory: number | null; // Memory Fitness: % of facts recalled at the exam (latest Full round)
  memory_retention: number | null; // exam ÷ learn-day quiz, %
  memory_days: number | null; // days between learn day and exam
}

export type LiftTrust = "verified" | "self-reported" | "community";
/**
 * Where a Lift number comes from, for its label: every pair CLI-verified, otherwise self-reported (MCP) pairs,
 * or only the community Stock median when the user has no Stock run of their own.
 */
export function liftTrust(l: { lift_challenges: number; lift_verified: number; lift_own: number }): LiftTrust | null {
  if (!l.lift_challenges) return null;
  if (l.lift_verified === l.lift_challenges) return "verified";
  return l.lift_own ? "self-reported" : "community";
}
export const LIFT_TRUST_LABEL: Record<LiftTrust, string> = {
  verified: "CLI-verified",
  "self-reported": "self-reported",
  community: "vs community median",
};
