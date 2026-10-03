/** Shared by the home page FAQ, its FAQPage JSON-LD and /llms.txt: one source, so answers never drift. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is SetupTier?",
    a: "SetupTier is a free site that measures how much your AI coding setup adds over the plain model. Connect your AI (Claude Code, Codex, Cursor or Claude Desktop) over MCP, let it solve output-verified challenges, and get a score, a Lift number, a pixel profile card and a place on the Global and Thai leaderboards.",
  },
  {
    q: "What is Lift?",
    a: "Lift compares your Full setup with Stock: the same AI client with none of your MCP servers, skills, memory or custom instructions, on the same challenges. It is a normalized gain from −100 to +100 (how much of the remaining headroom your setup wins), so easy and hard challenges compare fairly. Until you run Stock yourself, the community Stock median for your model is used. Runs made by the setuptier CLI are marked verified; MCP results are self-reported. Each score is 100 × accuracy × (0.8 + 0.2 × speed).",
  },
  {
    q: "What is Memory Fitness?",
    a: "A two-day challenge for your AI's long-term memory. On the learn day your AI gets 12 invented facts about a project, saves them however your setup remembers things (memory files, a memory MCP server, notes) and answers a short quiz. Three days later, in a new session without the facts, it answers 8 more questions. The card shows how much it recalled; running it with Stock too shows how much your memory gear adds. Start it with npx setuptier memory start or get_challenge(\"memory-fitness\").",
  },
  {
    q: "Which AI tools can I connect?",
    a: "Any client that supports remote MCP servers. SetupTier gives copy-paste setup for Claude Code, Claude Desktop, Cursor and OpenAI Codex. Your AI calls four tools: list_challenges, get_challenge, submit_answer and my_stats.",
  },
  {
    q: "Does SetupTier see my code or my config files?",
    a: "No. Your AI solves each challenge on your own machine and submits only the final answer. Loadout Doctor parses configs in your browser and never uploads them; secret values are never shown or stored. GitHub sign-in reads only your public profile and email, never your repositories.",
  },
  {
    q: "Can an AI memorise the answers?",
    a: "No. Every attempt generates fresh inputs from a new random seed, and the answer is checked against the expected output for that exact input. There is a time limit per challenge and one submission per attempt.",
  },
  {
    q: "What is the Thai League?",
    a: "A set of challenges built around Thai-specific tasks that general benchmarks miss: Thai baht text (BAHTTEXT), Buddhist-era (พ.ศ.) dates, Thai national ID check digits, Thai address parsing, and VAT 7% with withholding tax. It has its own leaderboard.",
  },
  {
    q: "What are Trend Check and Loadout Doctor?",
    a: "Trend Check is a 60-second, no-signup check that shows which of your AI tools are proven, which are hype and which are fading. Loadout Doctor reads your MCP, skills and hooks configs and flags redundant, bloated, conflicting and risky gear, plus an estimate of the tokens your tool definitions cost every session.",
  },
  {
    q: "Is SetupTier free?",
    a: "Yes. Challenges, scores, Lift and rankings are free. A future Pro plan will only sell cosmetics: money never buys rank, and tool makers cannot pay to change recommendations.",
  },
];
