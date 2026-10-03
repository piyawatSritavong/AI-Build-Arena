-- D17: anti-cheat v1.
-- 1. Anomaly flags on attempts (set at submit, see packages/mcp/src/arena.ts):
--      too_fast           a pass on difficulty ≥ 2 faster than an AI can read, solve and submit (MCP results only):
--                         kept, but not counted anywhere until reviewed
--      tokens_implausible a self-reported token count no real run can have: the count is ignored (Efficiency)
--      blank_answer       an empty answer: a blank Stock run is no baseline (stops sandbagging Stock)
-- 2. GitHub account age (profiles.github_created_at, fetched at sign-in).
-- 3. Trust score 0–1 (profiles.trust_score) = account-age factor × flag factor, refreshed after every submit/sign-in.
--      age ≥ 365 d 1.0 · ≥ 90 d 0.85 · ≥ 30 d 0.7 · < 30 d 0.4 · unknown 0.6;  flags (90 days) × max(0.2, 1 − 0.15 × n)
--    Accounts below 0.25 are left off the public leaderboard (their card still shows).
-- 4. One account = at most one vote in community numbers: its runs share a total weight of trust × source weight
--    (Stock median), or collapse to one value per account (efficiency median, league factors).

alter table public.attempts add column flags text[] not null default '{}'
  check (flags <@ array['too_fast', 'tokens_implausible', 'blank_answer']);
create index attempts_flagged_idx on public.attempts (user_id, submitted_at) where flags <> '{}';
alter table public.profiles add column github_created_at timestamptz;

create function public.refresh_trust_score(p_user uuid)
returns numeric
language sql volatile security definer set search_path = '' as $$
  update public.profiles p
  set trust_score = round(
    (case
       when p.github_created_at is null then 0.6
       when p.github_created_at < now() - interval '365 days' then 1.0
       when p.github_created_at < now() - interval '90 days' then 0.85
       when p.github_created_at < now() - interval '30 days' then 0.7
       else 0.4 end)
    * greatest(0.2, 1 - 0.15 * (
        select count(*) from public.attempts a
        where a.user_id = p.id and a.flags <> '{}' and a.submitted_at > now() - interval '90 days')), 3)
  where p.id = p_user
  returning p.trust_score
$$;
revoke execute on function public.refresh_trust_score(uuid) from public, anon, authenticated;

-- Building blocks, now flag-aware (otherwise as in D14) ----------------------------------------------
create or replace function public.best_passes(p_league public.league default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, league public.league, category text, score numeric, lift numeric)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.challenge_id, c.league, c.category, max(a.score), max(a.lift)
  from public.attempts a
  join public.challenges c on c.id = a.challenge_id
  left join public.build_variants v on v.id = a.variant_id
  where a.status = 'passed'
    and a.mode = 'ranked'
    and not ('too_fast' = any (a.flags))
    and (v.kind is null or v.kind = 'full')
    and (p_league is null or c.league = p_league)
    and (p_source is null or a.source = p_source)
  group by a.user_id, a.challenge_id, c.league, c.category
$$;

create or replace function public.community_stock_baseline(p_challenge text, p_model text, p_exclude uuid default null)
returns table (score numeric, runs integer)
language sql stable security definer set search_path = '' as $$
  with s as (
    select a.user_id, a.score, case when a.source = 'cli' then 1.0 else 0.5 end * p.trust_score as w
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'stock'
    join public.builds b on b.id = v.build_id
    join public.profiles p on p.id = a.user_id
    where a.challenge_id = p_challenge and b.base_model = p_model
      and a.status in ('passed', 'failed') and a.score is not null
      and not (a.flags && array['too_fast', 'blank_answer'])
      and a.user_id is distinct from p_exclude
  ), capped as (
    -- one account = one vote: its runs share its weight
    select score, w / count(*) over (partition by user_id) as w from s
  ), r as (
    select score, sum(w) over (order by score rows between unbounded preceding and current row) as cw,
           sum(w) over () as tw, count(*) over () as n
    from capped
  )
  select score, n::int from r where n >= 5 and tw > 0 and cw >= tw / 2 order by score limit 1
$$;

create or replace function public.lift_baseline(p_user uuid, p_build uuid, p_challenge text)
returns table (score numeric, basis text, verified boolean, runs integer)
language sql stable security definer set search_path = '' as $$
  with own as (
    select avg(a.score) as score, bool_and(a.source = 'cli') as cli, count(*)::int as n
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'stock'
    where a.user_id = p_user and v.build_id = p_build and a.challenge_id = p_challenge
      and a.status in ('passed', 'failed') and a.score is not null
      and not (a.flags && array['too_fast', 'blank_answer'])
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

create or replace function public.paired_lifts(p_user uuid default null, p_challenge text default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, full_score numeric, full_runs integer, baseline_score numeric,
               baseline_runs integer, basis text, verified boolean, lift numeric, weight numeric)
language sql stable security definer set search_path = '' as $$
  with f as (
    select a.user_id, v.build_id, a.challenge_id, avg(a.score) as score, count(*)::int as n, bool_and(a.source = 'cli') as cli
    from public.attempts a
    join public.build_variants v on v.id = a.variant_id and v.kind = 'full'
    join public.builds b on b.id = v.build_id and b.is_primary
    where a.mode = 'ranked' and a.status in ('passed', 'failed') and a.score is not null
      and not ('too_fast' = any (a.flags))
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
    and (p_source is distinct from 'cli' or lb.verified)
$$;

create or replace function public.primary_full_runs(p_user uuid default null, p_source public.result_source default null)
returns table (user_id uuid, challenge_id text, base_model text, passed boolean, tokens integer, tokens_measured boolean,
               duration_ms integer, cost_usd numeric)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.challenge_id, b.base_model, a.status = 'passed',
         case when 'tokens_implausible' = any (a.flags) then a.tokens_measured else coalesce(a.tokens_measured, a.tokens_self_reported) end,
         a.tokens_measured is not null, a.duration_ms, a.cost_usd
  from public.attempts a
  join public.build_variants v on v.id = a.variant_id and v.kind = 'full'
  join public.builds b on b.id = v.build_id and b.is_primary
  where a.status in ('passed', 'failed', 'expired')
    and not ('too_fast' = any (a.flags))
    and (p_user is null or a.user_id = p_user)
    and (p_source is null or a.source = p_source)
$$;

create or replace function public.efficiency_stats(p_user uuid default null, p_source public.result_source default null)
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
    -- one account = one value (its own median), then the median across accounts
    select percentile_cont(0.5) within group (order by o.tok) as tok, sum(o.passes)::int as n
    from m o
    where o.challenge_id = m.challenge_id and o.base_model = m.base_model and o.user_id <> m.user_id and o.tok is not null
    having sum(o.passes) >= 5
  ) c on true
  where p_user is null or m.user_id = p_user
$$;

create or replace function public.league_factors()
returns table (league public.league, factor numeric, builders integer, anchor_mean numeric, league_mean numeric)
language sql stable security definer set search_path = '' as $$
  with runs as (
    select a.user_id, c.league, c.is_anchor, a.score
    from public.attempts a
    join public.challenges c on c.id = a.challenge_id
    left join public.build_variants v on v.id = a.variant_id
    where a.mode = 'ranked' and a.status in ('passed', 'failed') and a.score is not null
      and not ('too_fast' = any (a.flags))
      and (v.kind is null or v.kind = 'full')
  ), anchor as (
    select user_id, avg(score) as s from runs where is_anchor group by user_id
  ), regional as (
    select r.user_id, r.league, avg(r.score) as s
    from runs r join public.leagues l on l.id = r.league and l.kind = 'regional'
    group by r.user_id, r.league
  ), common as (
    -- one account = one vote, weighted by trust
    select g.league, count(*)::int as n,
           sum(an.s * p.trust_score) / nullif(sum(p.trust_score), 0) as am,
           sum(g.s * p.trust_score) / nullif(sum(p.trust_score), 0) as lm
    from regional g
    join anchor an on an.user_id = g.user_id
    join public.profiles p on p.id = g.user_id
    group by g.league
  )
  select l.id,
         case when l.kind = 'global' or c.n is null or c.n < 5 or coalesce(c.lm, 0) <= 0 then 1.000
              else round(least(2, greatest(0.5, c.am / c.lm)), 3) end,
         coalesce(c.n, 0), round(c.am, 2), round(c.lm, 2)
  from public.leagues l
  left join common c on c.league = l.id
  where l.is_active
$$;

-- Leaderboard: accounts under review (trust < 0.25) are left off; otherwise as in D15 -------------------
create or replace function public.leaderboard(
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
      and p.trust_score >= 0.25 -- under review: off the public board (card still shows)
  ), agg as (
    -- Overall puts every league on the Global scale (anchor factors); inside one league nothing is scaled.
    select bp.user_id, sum(bp.score * case when p_league is null then coalesce(f.factor, 1) else 1 end) as total_score,
           count(*)::int as passed
    from public.best_passes(p_league, p_source) bp
    left join public.league_factors() f on f.league = bp.league
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

-- Card: + trust and recent flags (otherwise as in D16) -----------------------------------------------------
create or replace function public.profile_card(p_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.profiles where username = p_username),
  best as (select bp.* from public.best_passes() bp join p on p.id = bp.user_id),
  lifts as (select pl.* from p cross join lateral public.paired_lifts(p.id) pl),
  rel as (select r.* from p cross join lateral public.reliability_stats(p.id) r),
  eff as (select e.* from p cross join lateral public.efficiency_stats(p.id) e),
  rng as (select g.* from p cross join lateral public.range_stats(p.id) g),
  mem as (
    select e.exam_accuracy, e.learn_accuracy, e.learned_at, e.examined_at
    from public.memory_enrollments e
    left join public.build_variants v on v.id = e.variant_id
    where e.user_id = (select id from p) and e.status = 'examined' and coalesce(v.kind, 'full') = 'full'
    order by e.examined_at desc limit 1
  ),
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
    'total_score', (select coalesce(round(sum(b.score * coalesce(f.factor, 1)), 2), 0) from best b left join public.league_factors() f on f.league = b.league),
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
    'league_ranks', (select coalesce(jsonb_object_agg(league, r), '{}'::jsonb) from ranked where user_id = p.id),
    'anchors_passed', (select count(*) from best b join public.challenges c on c.id = b.challenge_id and c.is_anchor),
    'trust', (select trust_score from p),
    'flagged_attempts', (select count(*) from public.attempts a where a.user_id = p.id and a.flags <> '{}' and a.submitted_at > now() - interval '90 days'),
    'memory', (select round(exam_accuracy * 100, 1) from mem),
    'memory_retention', (select round(100 * exam_accuracy / nullif(learn_accuracy, 0), 1) from mem),
    'memory_days', (select round((extract(epoch from examined_at - learned_at) / 86400)::numeric, 1) from mem),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;

-- Everyone gets a real trust score now (age unknown until their next sign-in).
select public.refresh_trust_score(id) from public.profiles;
