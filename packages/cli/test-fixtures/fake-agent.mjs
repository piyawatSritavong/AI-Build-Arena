#!/usr/bin/env node
// Stand-in for `claude -p --output-format json` in tests. Full solves sum-of-evens; Stock answers wrong.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("9.9.9 (Fake Agent)");
  process.exit(0);
}
if (process.env.FAKE_AGENT_LOG) appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify(args) + "\n");
const prompt = readFileSync(0, "utf8");
const out = (result) =>
  console.log(JSON.stringify({ type: "result", is_error: false, result, num_turns: 3, total_cost_usd: 0.01, usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500 }, modelUsage: { "claude-fake-1": { outputTokens: 200 } } }));

if (prompt.includes("SETUPTIER PROBE")) {
  out('{"instructions": false, "mcp_servers": [], "skills": []}');
  process.exit(0);
}
const stock = args.includes("--strict-mcp-config");
const input = JSON.parse(readFileSync("input.json", "utf8"));
const answer = stock ? 0 : input.numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0);
writeFileSync("answer.json", JSON.stringify(answer));
out("done");
