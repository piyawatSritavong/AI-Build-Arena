-- D16: Memory Fitness. A two-phase challenge: learn day (facts + a short quiz = the day-1 baseline), then an exam
-- N days later in a new session without the facts. The exam is an ordinary attempt (same seed as the enrollment), so
-- Lift (Full vs Stock), Reliability, Range and the leaderboard pick it up with no special cases.
-- memory_enrollments holds the learn day and links the exam attempt. Service role only (seeds are secret).
-- Memory = exam recall % of the latest examined Full enrollment; retention = exam ÷ learn-day accuracy.

insert into public.challenges (id, league, category, title, summary, difficulty, time_limit_seconds, version, is_active, is_anchor)
values ('memory-fitness', 'global', 'memory', 'Memory Fitness', 'Learn 12 project facts today, recall them in a new session 3 days later.', 3, 900, 1, true, false)
on conflict (id) do update set league = excluded.league, category = excluded.category, title = excluded.title, summary = excluded.summary,
  difficulty = excluded.difficulty, time_limit_seconds = excluded.time_limit_seconds, version = excluded.version, is_active = true;

create type public.memory_status as enum ('learning', 'waiting', 'examined', 'expired');

create table public.memory_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  build_id uuid references public.builds (id) on delete set null,
  variant_id uuid references public.build_variants (id) on delete set null,
  source public.result_source not null,
  challenge_id text not null references public.challenges (id),
  challenge_version integer not null,
  seed text not null,
  status public.memory_status not null default 'learning',
  issued_at timestamptz not null default now(),
  learn_expires_at timestamptz not null,
  learned_at timestamptz,
  learn_accuracy numeric(5, 4) check (learn_accuracy between 0 and 1),
  exam_due_at timestamptz,
  exam_closes_at timestamptz,
  exam_attempt_id uuid references public.attempts (id) on delete set null,
  exam_accuracy numeric(5, 4) check (exam_accuracy between 0 and 1),
  examined_at timestamptz,
  check (exam_closes_at is null or exam_closes_at > exam_due_at)
);
-- One active round per user and variant (Full and Stock run side by side).
create unique index memory_enrollments_one_active on public.memory_enrollments
  (user_id, challenge_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('learning', 'waiting');
create index memory_enrollments_user_idx on public.memory_enrollments (user_id, issued_at desc);
alter table public.memory_enrollments enable row level security; -- no policies: service role only

-- Latest round per variant (status, due dates, accuracies) for my_stats, the CLI reminder and the card.
create function public.memory_stats(p_user uuid)
returns table (variant text, status public.memory_status, source public.result_source, learn_accuracy numeric, exam_accuracy numeric,
               retention numeric, days numeric, learned_at timestamptz, exam_due_at timestamptz, exam_closes_at timestamptz,
               examined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (coalesce(v.kind::text, 'full'))
         coalesce(v.kind::text, 'full'),
         case when e.status = 'learning' and e.learn_expires_at < now() then 'expired'::public.memory_status
              when e.status = 'waiting' and e.exam_closes_at < now() then 'expired'::public.memory_status
              else e.status end,
         e.source, e.learn_accuracy, e.exam_accuracy,
         round(e.exam_accuracy / nullif(e.learn_accuracy, 0), 4),
         round((extract(epoch from e.examined_at - e.learned_at) / 86400)::numeric, 1),
         e.learned_at, e.exam_due_at, e.exam_closes_at, e.examined_at
  from public.memory_enrollments e
  left join public.build_variants v on v.id = e.variant_id
  where e.user_id = p_user
  order by coalesce(v.kind::text, 'full'), e.issued_at desc
$$;
revoke execute on function public.memory_stats(uuid) from public, anon, authenticated;

-- Card: + Memory (latest examined Full round) -------------------------------------------------------------
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
    'memory', (select round(exam_accuracy * 100, 1) from mem),
    'memory_retention', (select round(100 * exam_accuracy / nullif(learn_accuracy, 0), 1) from mem),
    'memory_days', (select round((extract(epoch from examined_at - learned_at) / 86400)::numeric, 1) from mem),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;
