-- D12: Paired Lift. Lift = what the user's setup adds on top of the same client with nothing added.
--
-- Per challenge, on the user's primary build:
--   Full     = mean score of the build's ranked Full runs (passed and failed)
--   baseline = 1. own:       mean score of the same build's Stock runs (any mode)
--              2. community: weighted median of other users' Stock runs on the same base model (≥ 5 runs;
--                            CLI runs weigh 1, MCP runs 0.5)
--              A self-reported (MCP) own Stock cannot sit below the community median (no sandbagging Stock).
--   Lift     = normalized gain on the 0–100 score, −100 … +100:
--              Full ≥ base: (Full − base) ÷ (100 − base) × 100     Full < base: (Full − base) ÷ base × 100
--   verified = Full and Stock both came from the CLI.
-- A user's Lift = weighted mean over challenges (verified pair 1, self-reported or community 0.5).
-- The legacy API-run baselines table is no longer read.

create function public.normalized_gain(p_full numeric, p_base numeric)
returns numeric
language sql immutable set search_path = '' as $$
  select round(case
    when p_full is null or p_base is null then null
    when p_full >= p_base then case when p_base >= 100 then 0 else (p_full - p_base) / (100 - p_base) * 100 end
    else (p_full - p_base) / p_base * 100
  end, 2)
$$;

create function public.community_stock_baseline(p_challenge text, p_model text, p_exclude uuid default null)
returns table (score numeric, runs integer)
language sql stable security definer set search_path = '' as $$
  with s as (
    select a.score, case when a.source = 'cli' then 1.0 else 0.5 end as w
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'stock'
    join public.builds b on b.id = v.build_id
    where a.challenge_id = p_challenge and b.base_model = p_model
      and a.status in ('passed', 'failed') and a.score is not null
      and a.user_id is distinct from p_exclude
  ), r as (
    select score, sum(w) over (order by score rows between unbounded preceding and current row) as cw,
           sum(w) over () as tw, count(*) over () as n
    from s
  )
  select score, n::int from r where n >= 5 and cw >= tw / 2 order by score limit 1
$$;

create function public.lift_baseline(p_user uuid, p_build uuid, p_challenge text)
returns table (score numeric, basis text, verified boolean, runs integer)
language sql stable security definer set search_path = '' as $$
  with own as (
    select avg(a.score) as score, bool_and(a.source = 'cli') as cli, count(*)::int as n
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'stock'
    where a.user_id = p_user and v.build_id = p_build and a.challenge_id = p_challenge
      and a.status in ('passed', 'failed') and a.score is not null
  ), com as (
    select c.score, c.runs
    from public.builds b
    cross join lateral public.community_stock_baseline(p_challenge, b.base_model, p_user) c
    where b.id = p_build
  )
  select case when own.n = 0 then com.score
              when own.cli then own.score
              else greatest(own.score, coalesce(com.score, own.score)) end,
         case when own.n > 0 then 'own' when com.score is not null then 'community' end,
         own.n > 0 and coalesce(own.cli, false),
         case when own.n > 0 then own.n else com.runs end
  from own left join com on true
$$;

create function public.paired_lifts(p_user uuid default null, p_challenge text default null)
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
    group by a.user_id, v.build_id, a.challenge_id
  )
  select f.user_id, f.challenge_id, round(f.score, 2), f.n, round(lb.score, 2), lb.runs, lb.basis,
         f.cli and lb.verified,
         public.normalized_gain(f.score, lb.score),
         case when f.cli and lb.verified then 1.0 else 0.5 end
  from f
  cross join lateral public.lift_baseline(f.user_id, f.build_id, f.challenge_id) lb
  where lb.score is not null
$$;

revoke execute on function public.community_stock_baseline(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.lift_baseline(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.paired_lifts(uuid, text) from public, anon, authenticated;

-- Leaderboard + card read Lift from the pairs ------------------------------------------------
drop function public.leaderboard(public.league, integer);
create function public.leaderboard(p_league public.league default null, p_limit integer default 50)
returns table (rank bigint, username text, display_name text, avatar_url text, sprite_id text, base_model text,
               total_score numeric, passed integer, avg_lift numeric, lift_challenges integer, lift_verified integer,
               lift_own integer)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select user_id, sum(score) as total_score, count(*)::int as passed
    from public.best_passes(p_league) group by user_id
  ), lifts as (
    select pl.user_id, sum(pl.lift * pl.weight) / sum(pl.weight) as avg_lift, count(*)::int as n,
           count(*) filter (where pl.verified)::int as verified, count(*) filter (where pl.basis = 'own')::int as own
    from public.paired_lifts() pl
    join public.challenges c on c.id = pl.challenge_id
    where p_league is null or c.league = p_league
    group by pl.user_id
  )
  select rank() over (order by agg.total_score desc), p.username, p.display_name, p.avatar_url,
         b.sprite_id, b.base_model, round(agg.total_score, 2), agg.passed,
         round(l.avg_lift, 2), coalesce(l.n, 0), coalesce(l.verified, 0), coalesce(l.own, 0)
  from agg
  join public.profiles p on p.id = agg.user_id
  left join public.builds b on b.user_id = agg.user_id and b.is_primary
  left join lifts l on l.user_id = agg.user_id
  order by 1, p.username
  limit least(greatest(p_limit, 1), 200)
$$;

create or replace function public.profile_card(p_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.profiles where username = p_username),
  best as (select bp.* from public.best_passes() bp join p on p.id = bp.user_id),
  lifts as (select pl.* from p cross join lateral public.paired_lifts(p.id) pl),
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
    'top_category', (select category from cats order by s desc, category limit 1),
    'global_rank', (select r from ranked where user_id = p.id and league = 'global'),
    'thai_rank', (select r from ranked where user_id = p.id and league = 'thai'),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;

grant execute on function public.leaderboard(public.league, integer) to anon, authenticated;
grant execute on function public.profile_card(text) to anon, authenticated;
