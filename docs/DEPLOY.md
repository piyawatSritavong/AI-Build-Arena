# Deploy runbook (Vercel + Supabase)

Do this only after the local checks pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`.
A Supabase project bills compute while it exists, so create it on deploy day, not before.

## 1. Supabase (cloud)
1. Create the project: region **Southeast Asia (Singapore)**, Micro compute, strong DB password (store in a password manager).
2. Link and push the schema from the repo root:
   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```
3. Auth settings (dashboard → Authentication):
   - Site URL: `https://<domain>`. Redirect URLs: `https://<domain>/auth/callback` (+ the Vercel preview pattern if wanted).
   - Providers: **GitHub on** (production OAuth App below), **Email signups off**.
   - Do **not** run `supabase config push`: `config.toml` holds localhost URLs.
4. GitHub OAuth App (production), github.com/settings/developers: homepage `https://<domain>`, callback `https://<ref>.supabase.co/auth/v1/callback`. Paste the client id/secret into the Supabase GitHub provider.
5. Reference data (run locally with **prod** env vars in the shell, not committed):
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> pnpm --filter @arena/challenges sync
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> pnpm --filter @arena/loadout sync
   ```
6. Optional baselines (costs Anthropic API spend): same env plus `ANTHROPIC_API_KEY`, then `pnpm --filter @arena/challenges baselines -- --runs 3`.
7. Check Advisors (security + performance) in the dashboard. Expect zero errors.

## 2. Vercel
1. New project from the GitHub repo. **Root Directory: `apps/web`** (Next.js preset; pnpm workspace + Turborepo are detected from the repo root).
2. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key (mark Sensitive) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<domain>`: drives OAuth redirects and absolute OG image URLs |
   | `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | optional |
   | `GOOGLE_SITE_VERIFICATION` | optional: token from Google Search Console (HTML tag method) |
   | `BING_SITE_VERIFICATION` | optional: `msvalidate.01` token from Bing Webmaster Tools |

   Never set `ARENA_DEV_LOGIN` in any Vercel environment.
3. Domain: add `<domain>` in Vercel, then set the DNS records Vercel shows at the registrar (z.com).
4. Plan: Vercel Hobby is for non-commercial use. Move to Pro before charging money.

## 3. Smoke test (production)
- `/`, `/leaderboard`, `/trend`, `/doctor` load. `/robots.txt` points at the real domain.
- GitHub sign-in → `/me` → save build → create token → connect Claude Code → solve `sum-of-evens` → card shows on `/u/<you>`.
- Paste `https://<domain>/u/<you>` into X / Facebook sharing debugger: the OG card renders.
- `curl -I https://<domain>` shows the security headers.
- MCP without a token returns 401; more than 120 requests/min from one IP returns 429.

## 4. Search engines (SEO / GEO / AEO)
- Built in: per-page titles, descriptions and canonicals, Open Graph + X cards, `robots.txt` (AI crawlers allowed, `/api/` and `/auth/` blocked, `/api/og/` open for share images), `sitemap.xml` (static pages + ranked profile cards, refreshed hourly), `llms.txt`, web manifest, icons, and JSON-LD (Organization, WebSite, WebApplication, FAQPage, ItemList, ProfilePage).
- `NEXT_PUBLIC_SITE_URL` must be the final domain before building: canonicals, sitemap and robots use it. Redeploy after a domain change.
- Google Search Console and Bing Webmaster Tools: verify (env vars above), then submit `https://<domain>/sitemap.xml`.
- Check: Google Rich Results Test on `/` (FAQ) and a ranked `/u/<name>`; X / Facebook share debuggers on `/` and a card.

## Rollback
Vercel → Deployments → promote the previous deployment. Schema changes are forward-only: write a new migration to undo.
