-- D13: Reliability + Efficiency, the card's 2nd and 3rd numbers next to Lift. Both read the Full runs of
-- the user's primary build (ranked and practice: practice runs exist to measure these).
--
-- Reliability = Wilson lower bound (95%) of the pass rate, pooled over challenges run ≥ 3 times, 0–100.
--   A single lucky pass cannot score 100%; more runs tighten the bound. Expired answers count as fails.
-- Efficiency (per challenge, passes only) = median tokens, seconds and cost per pass.
--   Tokens: CLI-measured runs when there are any, else self-reported (MCP).
--   Index = community median tokens per pass (same challenge + base model, other users, ≥ 5 passes) ÷ yours;
--   > 1 means fewer tokens than typical. The user's index = geometric mean over challenges.
--   Cost = the API-equivalent cost the agent itself reported (CLI only); never estimated from tokens.

alter table public.attempts
  add column cost_usd numeric(10, 4) check (cost_usd >= 0); -- reported by the agent, accepted from the CLI only

create function public.wilson_lower(p_pass integer, p_n integer, p_z numeric default 1.96)
returns numeric
language sql immutable set search_path = '' as $$
  select case when n <= 0 then null
              else round(100 * (ph + z * z / (2 * n) - z * sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / (1 + z * z / n), 2) end
  from (select coalesce(p_n, 0)::numeric as n, p_z as z, p_pass::numeric / nullif(p_n, 0) as ph) v
$$;

create function public.primary_full_runs(p_user uuid default null)
returns table (user_id uuid, challenge_id text, base_model text, passed boolean, tokens integer, tokens_measured boolean,
               duration_ms integer, cost_usd numeric)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.challenge_id, b.base_model, a.status = 'passed',
         coalesce(a.tokens_measured, a.tokens_self_reported), a.tokens_measured is not null, a.duration_ms, a.cost_usd
  from public.attempts a
  join public.build_variants v on v.id = a.variant_id and v.kind = 'full'
  join public.builds b on b.id = v.build_id and b.is_primary
  where a.status in ('passed', 'failed', 'expired')
    and (p_user is null or a.user_id = p_user)
$$;

create function public.reliability_stats(p_user uuid default null)
returns table (user_id uuid, runs integer, passes integer, challenges integer, reliability numeric)
language sql stable security definer set search_path = '' as $$
  with per as (
    select r.user_id, r.challenge_id, count(*)::int as n, count(*) filter (where r.passed)::int as s
    from public.primary_full_runs(p_user) r
    group by r.user_id, r.challenge_id
    having count(*) >= 3
  )
  select per.user_id, sum(n)::int, sum(s)::int, count(*)::int, public.wilson_lower(sum(s)::int, sum(n)::int)
  from per group by per.user_id
$$;

create function public.efficiency_stats(p_user uuid default null)
returns table (user_id uuid, challenge_id text, passes integer, tokens numeric, tokens_measured boolean, seconds numeric,
               cost_usd numeric, community_tokens numeric, community_runs integer, efficiency numeric)
language sql stable security definer set search_path = '' as $$
  with runs as (
    select * from public.primary_full_runs() r where r.passed
  ), mine as (
    select r.user_id, r.challenge_id, r.base_model, count(*)::int as passes,
           bool_or(r.tokens_measured) as measured,
           percentile_cont(0.5) within group (order by r.tokens) filter (where r.tokens_measured) as t_cli,
           percentile_cont(0.5) within group (order by r.tokens) filter (where r.tokens is not null) as t_any,
           percentile_cont(0.5) within group (order by r.duration_ms) as ms,
           percentile_cont(0.5) within group (order by r.cost_usd) filter (where r.cost_usd is not null) as cost
    from runs r
    where p_user is null or r.user_id = p_user
    group by r.user_id, r.challenge_id, r.base_model
  ), m as (
    select mine.*, case when measured then t_cli else t_any end as tok from mine
  )
  select m.user_id, m.challenge_id, m.passes, round(m.tok::numeric), coalesce(m.measured, false),
         round((m.ms / 1000)::numeric, 1), round(m.cost::numeric, 4),
         round(c.tok::numeric), c.n,
         case when c.tok > 0 and m.tok > 0 then round((c.tok / m.tok)::numeric, 2) end
  from m
  left join lateral (
    select percentile_cont(0.5) within group (order by o.tokens) as tok, count(*)::int as n
    from runs o
    where o.challenge_id = m.challenge_id and o.base_model = m.base_model and o.user_id <> m.user_id and o.tokens is not null
    having count(*) >= 5
  ) c on true
$$;

revoke execute on function public.primary_full_runs(uuid) from public, anon, authenticated;
revoke execute on function public.reliability_stats(uuid) from public, anon, authenticated;
revoke execute on function public.efficiency_stats(uuid) from public, anon, authenticated;

-- Card: Lift + Reliability + Efficiency ----------------------------------------------------------
create or replace function public.profile_card(p_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.profiles where username = p_username),
  best as (select bp.* from public.best_passes() bp join p on p.id = bp.user_id),
  lifts as (select pl.* from p cross join lateral public.paired_lifts(p.id) pl),
  rel as (select r.* from p cross join lateral public.reliability_stats(p.id) r),
  eff as (select e.* from p cross join lateral public.efficiency_stats(p.id) e),
  cats as (select category, sum(score) as s from best group by category),
  ranked as (
    select user_id, rank() over (partition by league order by sum(score) desc) as r, league
    from public.best_passes() group by user_id, league
  )
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'build', (select jsonb_build_object('name', b.name, 'base_model', b.base_model, 'client', b.client, 'sprite_id', b.sprite_id, 'gear_count', jsonb_array_length(b.gear))
              from public.builds b where b.user_id = p.id and b.is_primary),
    'passed', (select count(*) from best),
    'total_score', (select coalesce(round(sum(score), 2), 0) from best),
    'avg_lift', (select round(sum(lift * weight) / nullif(sum(weight), 0), 2) from lifts),
    'lift_challenges', (select count(*) from lifts),
    'lift_verified', (select count(*) from lifts where verified),
    'lift_own', (select count(*) from lifts where basis = 'own'),
    'reliability', (select reliability from rel),
    'reliability_runs', (select coalesce(sum(runs), 0) from rel),
    'reliability_challenges', (select coalesce(sum(challenges), 0) from rel),
    'efficiency', (select round(exp(avg(ln(efficiency))), 2) from eff where efficiency > 0),
    'efficiency_challenges', (select count(*) from eff where efficiency > 0),
    'tokens_per_pass', (select round(avg(tokens)) from eff),
    'seconds_per_pass', (select round(avg(seconds), 1) from eff),
    'cost_per_pass', (select round(avg(cost_usd), 4) from eff),
    'tokens_verified', (select coalesce(bool_and(tokens_measured), false) from eff where tokens is not null),
    'top_category', (select category from cats order by s desc, category limit 1),
    'global_rank', (select r from ranked where user_id = p.id and league = 'global'),
    'thai_rank', (select r from ranked where user_id = p.id and league = 'thai'),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;
