-- D15: League structure (Global + Regional, Thai first) + Anchor challenges to compare across leagues.
--
-- leagues: metadata per public.league value; the code registry (LEAGUES in @arena/core) is the source of truth and
--   `pnpm --filter @arena/challenges sync` upserts it. Adding a region = enum value + registry entry + its challenges.
-- Anchors: Global challenges flagged is_anchor that every league also plays.
-- league_factors(): common-person linking. Builders who played both the anchors and a regional league give
--   factor = mean anchor score ÷ mean score in that league (ranked Full runs, passes and fails).
--   Same people, so the gap is the league's difficulty. Needs ≥ 5 such builders, else 1; clamped to 0.5–2. Global = 1.
-- Overall (no league filter) adds each league's best scores × its factor, so a hard regional league counts fairly.
--   Inside one league nothing is scaled.

create table public.leagues (
  id public.league primary key,
  kind text not null check (kind in ('global', 'regional')),
  region_code text check (region_code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 1 and 40),
  short_label text not null default '' check (char_length(short_label) <= 6),
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  description text not null check (char_length(description) <= 300),
  sort smallint not null default 0,
  is_active boolean not null default true,
  check ((kind = 'global') = (region_code is null))
);
alter table public.leagues enable row level security;
create policy "leagues readable by all" on public.leagues for select using (true);
-- writes: service role only (sync script)

insert into public.leagues (id, kind, region_code, name, short_label, locale, description, sort) values
  ('global', 'global', null, 'Global', '', 'en', 'Language-neutral logic, algorithm and data challenges.', 0),
  ('thai', 'regional', 'TH', 'Thai League', 'TH', 'th', 'Thai baht text, Buddhist-era dates, Thai ID checksums, addresses and VAT / withholding tax.', 1);

alter table public.challenges add column is_anchor boolean not null default false;
update public.challenges set is_anchor = true where id in ('bracket-balance', 'interval-merge', 'csv-revenue');

create function public.league_factors()
returns table (league public.league, factor numeric, builders integer, anchor_mean numeric, league_mean numeric)
language sql stable security definer set search_path = '' as $$
  with runs as (
    select a.user_id, c.league, c.is_anchor, a.score
    from public.attempts a
    join public.challenges c on c.id = a.challenge_id
    left join public.build_variants v on v.id = a.variant_id
    where a.mode = 'ranked' and a.status in ('passed', 'failed') and a.score is not null
      and (v.kind is null or v.kind = 'full')
  ), anchor as (
    select user_id, avg(score) as s from runs where is_anchor group by user_id
  ), regional as (
    select r.user_id, r.league, avg(r.score) as s
    from runs r join public.leagues l on l.id = r.league and l.kind = 'regional'
    group by r.user_id, r.league
  ), common as (
    select g.league, count(*)::int as n, avg(an.s) as am, avg(g.s) as lm
    from regional g join anchor an on an.user_id = g.user_id
    group by g.league
  )
  select l.id,
         case when l.kind = 'global' or c.n is null or c.n < 5 or c.lm <= 0 then 1.000
              else round(least(2, greatest(0.5, c.am / c.lm)), 3) end,
         coalesce(c.n, 0), round(c.am, 2), round(c.lm, 2)
  from public.leagues l
  left join common c on c.league = l.id
  where l.is_active
$$;
grant execute on function public.league_factors() to anon, authenticated; -- aggregates only

-- Overall leaderboard + card total use the factors (bodies otherwise as in D14) ------------------------------
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
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;
