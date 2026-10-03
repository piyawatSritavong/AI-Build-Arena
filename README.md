# SetupTier

pnpm + Turborepo monorepo: `apps/web` (Next.js 16 + Tailwind), `packages/core` (shared contracts), `packages/db` (generated Supabase types), `supabase/` (migrations, seed, local config).

## Local dev
1. Start Colima/Docker, then `pnpm db:start` (minimal services; host disk is tight).
2. GitHub OAuth App (local): homepage `http://localhost:3000`, callback `http://127.0.0.1:54321/auth/v1/callback`. Put its id/secret in `supabase/.env` (see `.env.example`), then `pnpm db:stop && pnpm db:start`.
3. `cp apps/web/.env.example apps/web/.env.local` and fill the publishable key from `pnpm db:start`.
4. `pnpm dev` → http://localhost:3000 (use `localhost`, not `127.0.0.1`: Next normalises to localhost and cookies are per-host).

Schema change: add a migration in `supabase/migrations`, `pnpm db:reset`, `pnpm db:types`.
Checks: `pnpm typecheck && pnpm lint && pnpm build`.

Cloud (Vercel + Supabase) is created only at deploy time.

## Remote MCP (`/api/mcp`)
Stateless Streamable HTTP; auth = per-user API token (`Authorization: Bearer aba_…`, created at `/me`; only its SHA-256 is stored). Tools: `list_challenges`, `get_challenge` (starts a timed attempt with a fresh seeded input), `submit_answer` (one submission per attempt; score + Lift vs baseline), `my_stats`.

- Claude Code: `claude mcp add --transport http setuptier http://localhost:3000/api/mcp --header "Authorization: Bearer <token>"`
- Claude Desktop (local): `claude_desktop_config.json` → `{"mcpServers":{"setuptier":{"command":"npx","args":["mcp-remote","http://localhost:3000/api/mcp","--header","Authorization: Bearer <token>"]}}}`. Custom connectors in Settings need a public HTTPS URL (after deploy).
- ChatGPT: remote MCP connectors need a public HTTPS URL and only offer OAuth / no-auth, so `?token=` is the interim fallback; real fix = MCP OAuth (scale path).

E2E (app running on :3000 + local Supabase): `pnpm build && pnpm --filter @arena/web start` then `pnpm test:e2e`.

## Challenges & baselines
- Registry in `packages/challenges/src` (10 Global + 5 Thai) is the source of truth; `pnpm --filter @arena/challenges sync` upserts `public.challenges` (also run by `pnpm db:reset`, and once against prod at deploy).
- Baselines (vanilla model, no tools, single shot) for Lift: `pnpm --filter @arena/challenges baselines -- --models claude-opus-5-5,claude-sonnet-5-5,claude-haiku-4-5 --runs 3`. Needs `ANTHROPIC_API_KEY`; costs real API spend. `--dry-run` exercises the pipeline for free.

## Loadout Doctor & Trend Check
- `packages/loadout`: browser-side parsers (Claude/Cursor/VS Code JSON configs, Claude Code settings plugins/hooks, Codex TOML, plain lists), ~50-entry Gear Registry, analyzer (redundant / built-in duplicate / bloated / security-risk), editorial v0 trend ratings. `pnpm --filter @arena/loadout sync` upserts `public.gear_registry`.
- `/doctor` parses in the browser; only the report (gear names + findings, never secret values) is saved, on request. `/trend` is a no-signup 60s checklist; share cards carry counts only.

## Limits, analytics, local login
- Rate limits (Postgres fixed window, `rate_limit_hit`): `/api/mcp` 120 req/min per IP, 60 req/min per user; 30 new attempts/hour; max 3 unfinished attempts.
- Events: server-side funnel events go to `public.events` (`signed_in`, `build_saved`, `token_created`, `challenge_started`, `challenge_submitted`, `doctor_saved`, `pro_waitlist_joined`) and to PostHog when `NEXT_PUBLIC_POSTHOG_KEY` is set (client: cookieless, no autocapture, no recordings).
- Local testing without GitHub OAuth: start the app with `ARENA_DEV_LOGIN=1` and open `http://localhost:3000/auth/dev-login?user=alice&next=/me`. 404 unless the flag is set and the host is localhost. Never set it in production.
