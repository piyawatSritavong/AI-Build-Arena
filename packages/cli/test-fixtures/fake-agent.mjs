#!/usr/bin/env node
// Stand-in for `claude -p --output-format json` in tests. Full solves sum-of-evens; Stock answers wrong.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("9.9.9 (Fake Agent)");
  process.exit(0);
}
if (process.env.FAKE_AGENT_LOG) appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify(args) + "\n");
const prompt = readFileSync(0, "utf8");
const out = (result) =>
  console.log(JSON.stringify({ type: "result", is_error: false, result, num_turns: 3, total_cost_usd: 0.01, usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500 }, modelUsage: { "claude-fake-1": { outputTokens: 200 } } }));

if (prompt.includes("SETUPTIER PING")) {
  if (process.env.FAKE_AGENT_AUTH_EXPIRED) {
    console.log(JSON.stringify({ type: "result", is_error: true, api_error_status: 401, result: "Failed to authenticate. API Error: 401 OAuth access token has expired.", usage: {} }));
    process.exit(1);
  }
  out("OK");
  process.exit(0);
}
if (prompt.includes("SETUPTIER PROBE")) {
  out('{"instructions": false, "mcp_servers": [], "skills": []}');
  process.exit(0);
}
// Plan usage runs out mid-suite: Claude Code reports it as an error result and exits 1, writing no answer.
if (process.env.FAKE_AGENT_SESSION_LIMIT) {
  console.log(JSON.stringify({ type: "result", is_error: true, result: "You've hit your session limit · resets 1:50am", num_turns: 1, usage: { input_tokens: 300, output_tokens: 0 } }));
  process.exit(1);
}
const stock = args.includes("--strict-mcp-config");
const input = JSON.parse(readFileSync("input.json", "utf8"));

// Memory Fitness: Full keeps the facts in a "memory" outside the workspace (FAKE_MEMORY_DIR); Stock has no memory.
if (input.questions) {
  const RULES = [
    [/\bport\b/, /port (\d+)/], [/weekday/, /only on (\w+)/], [/on-call/, /quarter is ([^.]+)\./], [/database/, /named (\S+)\./],
    [/feature flag/, /flag (ff_\w+)/], [/error code/, /(E-\d+)/], [/release/, /(v\d+\.\d+\.\d+)/], [/region/, /the (\S+) region/],
    [/channel/, /#([\w-]+)/], [/bucket/, /bucket (\S+)\./], [/reviews/, /needs (\d+) approving/], [/mascot/, /mascot is a (\w+)/],
  ];
  const memFile = `${process.env.FAKE_MEMORY_DIR}/memory.json`;
  let facts = input.facts;
  if (facts && !stock) writeFileSync(memFile, JSON.stringify(facts));
  if (!facts && !stock) facts = existsSync(memFile) ? JSON.parse(readFileSync(memFile, "utf8")) : [];
  const recall = (q) => {
    const rule = RULES.find(([k]) => k.test(q));
    for (const f of facts ?? []) {
      const m = rule && f.match(rule[1]);
      if (m) return m[1];
    }
    return "";
  };
  writeFileSync("answer.json", JSON.stringify(Object.fromEntries(Object.entries(input.questions).map(([id, q]) => [id, recall(q)]))));
  out("done");
  process.exit(0);
}
const answer = stock ? 0 : input.numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0);
writeFileSync("answer.json", JSON.stringify(answer));
out("done");
