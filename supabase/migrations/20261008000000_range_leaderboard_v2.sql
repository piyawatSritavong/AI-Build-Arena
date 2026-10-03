-- D14: Range + Leaderboard v2.
--
-- Range = how wide a setup's skills reach, 0–100: for every challenge category in scope,
--   credit = hardest difficulty passed ÷ hardest difficulty available (0 if none passed); Range = mean credit × 100.
--   Passing one easy challenge everywhere < passing the hardest one in each category.
-- Divisions (filters, combinable):
--   Same-Breed = one base model (p_model) · Open = every model (no p_model)
--   Duo = MCP results only (human + AI, self-reported) · Autonomous = CLI results only (the AI alone, measured)
--     In Autonomous, Lift counts only verified pairs (Full and Stock both from the CLI).
--   Profession tag (profiles.professions) · League (global / thai)
-- Sort: score (default) · lift · reliability · efficiency · range. Rows without the sorted number come last, unranked.

-- Source filter on the shared building blocks (signatures change, so drop and recreate) --------------
drop function public.best_passes(public.league);
create function public.best_passes(p_league public.league default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, league public.league, category text, score numeric, lift numeric)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.challenge_id, c.league, c.category, max(a.score), max(a.lift)
  from public.attempts a
  join public.challenges c on c.id = a.challenge_id
  left join public.build_variants v on v.id = a.variant_id
  where a.status = 'passed'
    and a.mode = 'ranked'
    and (v.kind is null or v.kind = 'full')
    and (p_league is null or c.league = p_league)
    and (p_source is null or a.source = p_source)
  group by a.user_id, a.challenge_id, c.league, c.category
$$;

drop function public.paired_lifts(uuid, text);
create function public.paired_lifts(p_user uuid default null, p_challenge text default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, full_score numeric, full_runs integer, baseline_score numeric,
               baseline_runs integer, basis text, verified boolean, lift numeric, weight numeric)
language sql stable security definer set search_path = '' as $$
  with f as (
    select a.user_id, v.build_id, a.challenge_id, avg(a.score) as score, count(*)::int as n, bool_and(a.source = 'cli') as cli
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'full'
    join public.builds b on b.id = v.build_id and b.is_primary
    where a.mode = 'ranked' and a.status in ('passed', 'failed') and a.score is not null
      and (p_user is null or a.user_id = p_user)
      and (p_challenge is null or a.challenge_id = p_challenge)
      and (p_source is null or a.source = p_source)
    group by a.user_id, v.build_id, a.challenge_id
  )
  select f.user_id, f.challenge_id, round(f.score, 2), f.n, round(lb.score, 2), lb.runs, lb.basis,
         f.cli and lb.verified,
         public.normalized_gain(f.score, lb.score),
         case when f.cli and lb.verified then 1.0 else 0.5 end
  from f
  cross join lateral public.lift_baseline(f.user_id, f.build_id, f.challenge_id) lb
  where lb.score is not null
    and (p_source is distinct from 'cli' or lb.verified) -- Autonomous: verified pairs only
$$;

drop function public.reliability_stats(uuid);
drop function public.efficiency_stats(uuid);
drop function public.primary_full_runs(uuid);
create function public.primary_full_runs(p_user uuid default null, p_source public.result_source default null)
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
    and (p_source is null or a.source = p_source)
$$;

create function public.reliability_stats(p_user uuid default null, p_source public.result_source default null, p_league public.league default null)
returns table (user_id uuid, runs integer, passes integer, challenges integer, reliability numeric)
language sql stable security definer set search_path = '' as $$
  with per as (
    select r.user_id, r.challenge_id, count(*)::int as n, count(*) filter (where r.passed)::int as s
    from public.primary_full_runs(p_user, p_source) r
    join public.challenges c on c.id = r.challenge_id
    where p_league is null or c.league = p_league
    group by r.user_id, r.challenge_id
    having count(*) >= 3
  )
  select per.user_id, sum(n)::int, sum(s)::int, count(*)::int, public.wilson_lower(sum(s)::int, sum(n)::int)
  from per group by per.user_id
$$;

create function public.efficiency_stats(p_user uuid default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, passes integer, tokens numeric, tokens_measured boolean, seconds numeric,
               cost_usd numeric, community_tokens numeric, community_runs integer, efficiency numeric)
language sql stable security definer set search_path = '' as $$
  with runs as (
    select * from public.primary_full_runs(null, p_source) r where r.passed
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

-- Range ----------------------------------------------------------------------------------------
create function public.range_stats(p_user uuid default null, p_league public.league default null, p_source public.result_source default null)
returns table (user_id uuid, range numeric, categories integer, categories_passed integer)
language sql stable security definer set search_path = '' as $$
  with cats as (
    select category, max(difficulty)::numeric as top
    from public.challenges
    where is_active and (p_league is null or league = p_league)
    group by category
  ), passed as (
    select bp.user_id, c.category, max(c.difficulty)::numeric as hardest
    from public.best_passes(p_league, p_source) bp
    join public.challenges c on c.id = bp.challenge_id
    where p_user is null or bp.user_id = p_user
    group by bp.user_id, c.category
  )
  select u.user_id,
         round(100 * sum(coalesce(p.hardest / k.top, 0)) / count(*), 1),
         count(*)::int,
         count(p.category)::int
  from (select distinct passed.user_id from passed) u
  cross join cats k
  left join passed p on p.user_id = u.user_id and p.category = k.category
  group by u.user_id
$$;

revoke execute on function public.best_passes(public.league, public.result_source) from public, anon, authenticated;
revoke execute on function public.paired_lifts(uuid, text, public.result_source) from public, anon, authenticated;
revoke execute on function public.primary_full_runs(uuid, public.result_source) from public, anon, authenticated;
revoke execute on function public.reliability_stats(uuid, public.result_source, public.league) from public, anon, authenticated;
revoke execute on function public.efficiency_stats(uuid, public.result_source) from public, anon, authenticated;
revoke execute on function public.range_stats(uuid, public.league, public.result_source) from public, anon, authenticated;

-- Leaderboard v2 ---------------------------------------------------------------------------------
drop function public.leaderboard(public.league, integer);
create function public.leaderboard(
  p_league public.league default null,
  p_limit integer default 50,
  p_sort text default 'score',
  p_model text default null,
  p_source public.result_source default null,
  p_profession text default null
)
returns table (rank bigint, username text, display_name text, avatar_url text, sprite_id text, base_model text,
               total_score numeric, passed integer, avg_lift numeric, lift_challenges integer, lift_verified integer,
               lift_own integer, reliability numeric, reliability_runs integer, efficiency numeric, tokens_per_pass numeric,
               range numeric, professions text[])
language sql stable security definer set search_path = '' as $$
  with who as (
    select p.id, p.username, p.display_name, p.avatar_url, p.professions, b.sprite_id, b.base_model
    from public.profiles p
    left join public.builds b on b.user_id = p.id and b.is_primary
    where (p_model is null or b.base_model = p_model)
      and (p_profession is null or p_profession = any (p.professions))
  ), agg as (
    select bp.user_id, sum(bp.score) as total_score, count(*)::int as passed
    from public.best_passes(p_league, p_source) bp
    where bp.user_id in (select id from who)
    group by bp.user_id
  ), lifts as (
    select pl.user_id, sum(pl.lift * pl.weight) / sum(pl.weight) as avg_lift, count(*)::int as n,
           count(*) filter (where pl.verified)::int as verified, count(*) filter (where pl.basis = 'own')::int as own
    from public.paired_lifts(null, null, p_source) pl
    join public.challenges c on c.id = pl.challenge_id
    where p_league is null or c.league = p_league
    group by pl.user_id
  ), eff as (
    select e.user_id, exp(avg(ln(e.efficiency)) filter (where e.efficiency > 0)) as efficiency, avg(e.tokens) as tokens
    from public.efficiency_stats(null, p_source) e
    join public.challenges c on c.id = e.challenge_id
    where p_league is null or c.league = p_league
    group by e.user_id
  ), rows as (
    select w.*, a.total_score, a.passed, l.avg_lift, l.n as lift_n, l.verified as lift_verified, l.own as lift_own,
           r.reliability, r.runs as reliability_runs, e.efficiency, e.tokens, g.range,
           case p_sort
             when 'lift' then l.avg_lift
             when 'reliability' then r.reliability
             when 'efficiency' then e.efficiency
             when 'range' then g.range
             else a.total_score
           end as metric
    from agg a
    join who w on w.id = a.user_id
    left join lifts l on l.user_id = a.user_id
    left join public.reliability_stats(null, p_source, p_league) r on r.user_id = a.user_id
    left join eff e on e.user_id = a.user_id
    left join public.range_stats(null, p_league, p_source) g on g.user_id = a.user_id
  )
  select case when metric is null then null else rank() over (order by metric desc nulls last) end,
         username, display_name, avatar_url, sprite_id, base_model,
         round(total_score, 2), passed, round(avg_lift, 2), coalesce(lift_n, 0), coalesce(lift_verified, 0), coalesce(lift_own, 0),
         reliability, coalesce(reliability_runs, 0), round(efficiency, 2), round(tokens), range, professions
  from rows
  order by metric desc nulls last, total_score desc, username
  limit least(greatest(p_limit, 1), 200)
$$;
grant execute on function public.leaderboard(public.league, integer, text, text, public.result_source, text) to anon, authenticated;

-- Base models people actually use, for the Same-Breed picker (names only, counts of builders with a pass).
create function public.leaderboard_models()
returns table (base_model text, builders integer)
language sql stable security definer set search_path = '' as $$
  select b.base_model, count(distinct b.user_id)::int
  from public.builds b
  join public.best_passes() bp on bp.user_id = b.user_id
  where b.is_primary
  group by b.base_model
  order by 2 desc, 1
$$;
grant execute on function public.leaderboard_models() to anon, authenticated;

-- Card: + Range (same as D13 otherwise; recreated so every call resolves to the new signatures) --------
create or replace function public.profile_card(p_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.profiles where username = p_username),
  best as (select bp.* from public.best_passes() bp join p on p.id = bp.user_id),
  lifts as (select pl.* from p cross join lateral public.paired_lifts(p.id) pl),
  rel as (select r.* from p cross join lateral public.reliability_stats(p.id) r),
  eff as (select e.* from p cross join lateral public.efficiency_stats(p.id) e),
  rng as (select g.* from p cross join lateral public.range_stats(p.id) g),
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
    'range', (select range from rng),
    'range_categories', (select categories_passed from rng),
    'range_total', (select count(distinct category) from public.challenges where is_active),
    'professions', to_jsonb(p.professions),
    'top_category', (select category from cats order by s desc, category limit 1),
    'global_rank', (select r from ranked where user_id = p.id and league = 'global'),
    'thai_rank', (select r from ranked where user_id = p.id and league = 'thai'),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;
