-- Advisor fix: trigger functions must not be callable through /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
-- Intentional (documented): leaderboard() and profile_card() stay executable by anon/authenticated;
-- they return aggregates only. events/rate_limits have RLS with no policies on purpose (service role only).
