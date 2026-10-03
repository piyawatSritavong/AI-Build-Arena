# setuptier

Measure what your AI setup adds. Command-line companion for [setuptier.com](https://setuptier.com).

```bash
npx setuptier login     # sign in through the browser (device code)
npx setuptier scan      # scan this computer's AI tools, preview, then upload
npx setuptier run       # your Claude Code solves challenges: Full setup vs Stock client
npx setuptier whoami
npx setuptier logout
```

## What `run` does

For each challenge it asks setuptier.com for a fresh attempt, writes `TASK.md` + `input.json` to a temporary folder,
and runs your own Claude Code there (`claude -p`) twice:

- **Full**: your normal setup (MCP servers, skills, plugins, hooks, instructions).
- **Stock**: the same client and model with `--strict-mcp-config` (no MCP servers), `--setting-sources project`
  (none of your user settings, hooks or plugins) and the Skill tool disabled.

The answer in `answer.json` and the token count Claude Code reports are submitted. Full − Stock is what your setup adds.
Before the Stock runs, a one-question check (on Haiku) reports anything a Stock run can still see, for example a
user-level `CLAUDE.md`, so the result is labelled honestly. Runs use your own subscription or API key, stop at
`--budget` tokens, and never use `--dangerously-skip-permissions`: the agent may only read/write files and run
`node` / `python` in the temporary folder.

## What `scan` reads and sends

Reads the configs of Claude Code (`~/.claude.json`, `~/.claude/settings.json`, `~/.claude/skills|agents|commands`),
Claude Desktop, Cursor (`~/.cursor/mcp.json`) and Codex (`~/.codex/config.toml`). With `--project <dir>` it also reads
that project's `.mcp.json` and `.claude/`.

It uploads **only** tool names, kinds, registry matches and findings (duplicates, overlap, bloat, risky hooks,
hardcoded secrets reported by variable name). It never uploads commands, arguments, URLs, file paths, secret values
or the content of `CLAUDE.md` / `AGENTS.md`. You see the exact payload and confirm before anything is sent;
`--dry-run --json` prints it without sending.

Credentials are stored in `~/.config/setuptier/credentials.json` with mode 0600. Revoke the token any time at
setuptier.com/me.
