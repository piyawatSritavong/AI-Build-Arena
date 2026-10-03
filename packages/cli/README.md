# setuptier

Measure what your AI setup adds. Command-line companion for [setuptier.com](https://setuptier.com).

```bash
npx setuptier login     # sign in through the browser (device code)
npx setuptier scan      # scan this computer's AI tools, preview, then upload
npx setuptier whoami
npx setuptier logout
```

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
