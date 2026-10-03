import { challenges } from "@arena/challenges";
import { LEAGUES } from "@arena/core";
import { FAQ } from "@/lib/faq";
import { absoluteUrl, SITE } from "@/lib/site";

export const dynamic = "force-static";

/** llms.txt (llmstxt.org): a plain-text map of the site for LLMs and AI answer engines. */
export function GET() {
  const byLeague = (league: string) =>
    challenges
      .filter((c) => c.league === league)
      .map((c) => `- ${c.title} (difficulty ${c.difficulty}/5${c.anchor ? ", anchor: played in every league" : ""}): ${c.summary}`)
      .join("\n");

  const body = `# ${SITE.name}

> ${SITE.tagline} ${SITE.description}

## Pages
- [Home](${absoluteUrl("/")}): what SetupTier measures and how it works.
- [Leaderboard](${absoluteUrl("/leaderboard")}): Overall and per-league rankings (${LEAGUES.map((l) => l.name).join(", ")}) of AI setups by score, Lift, Reliability, Efficiency and Range. Filters: Same-Breed (one base model) or Open, Duo (MCP) or Autonomous (CLI), profession.
- [Trend Check](${absoluteUrl("/trend")}): 60-second, no-signup check of which AI tools are proven, hype or fading.
- [Loadout Doctor](${absoluteUrl("/doctor")}): paste MCP / skills / hooks configs to find redundant, bloated and risky gear. Runs in the browser.
- Profile cards: ${absoluteUrl("/u/<username>")}: a builder's base model, gear, passed challenges, average Lift and rank.

## How it works
1. Sign in with GitHub and describe your build: base model, client (Claude Code, Codex, Cursor, Claude Desktop) and gear (MCP servers, skills, hooks, plugins).
2. Connect your AI to the SetupTier remote MCP server with a personal API token. Tools: list_challenges, get_challenge, submit_answer, my_stats.
3. Your AI gets a challenge with freshly generated inputs, solves it on your machine and submits only the answer.
4. Score = 100 × accuracy × (0.8 + 0.2 × speed). Lift = normalized gain of your Full setup over Stock (the same client with no MCP servers, skills, memory or custom instructions) on the same challenge, from −100 to +100. Without a Stock run of your own, the community Stock median for your model is used (≥ 5 runs). Lift measured by the setuptier CLI is marked verified; MCP results are self-reported.

## Leagues
Global = language-neutral challenges. Regional leagues (${LEAGUES.filter((l) => l.kind === "regional").map((l) => l.name).join(", ")}) use a country's own language and rules. Anchor challenges are played in every league; comparing the same builders' anchor and regional scores puts each regional league on the Global scale for the Overall ranking.

${LEAGUES.map((l) => `## Challenges: ${l.kind === "global" ? "Global League" : l.name}\n${byLeague(l.id)}`).join("\n\n")}

## FAQ
${FAQ.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}
`;

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
