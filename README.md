# AI Build Arena

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

- Claude Code: `claude mcp add --transport http arena http://localhost:3000/api/mcp --header "Authorization: Bearer <token>"`
- Claude Desktop (local): `claude_desktop_config.json` → `{"mcpServers":{"arena":{"command":"npx","args":["mcp-remote","http://localhost:3000/api/mcp","--header","Authorization: Bearer <token>"]}}}`. Custom connectors in Settings need a public HTTPS URL (after deploy).
- ChatGPT: remote MCP connectors need a public HTTPS URL and only offer OAuth / no-auth, so `?token=` is the interim fallback; real fix = MCP OAuth (scale path).

E2E (app running on :3000 + local Supabase): `pnpm build && pnpm --filter @arena/web start` then `pnpm test:e2e`.
