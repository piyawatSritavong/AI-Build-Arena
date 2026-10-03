-- D9: schema v2 for the 5 core modules.
-- * build variants: Full / Stock / Ablation (minus gear) / Custom, so every attempt knows what was measured (Paired Lift)
-- * attempts: ranked vs practice, source (MCP self-reported vs CLI verified), measured tokens, client
-- * profiles: professions (tags), trust score (anti-cheat weight, server-set)
-- * builds: loadout visibility; gear is no longer world-readable (owner reads it via own_primary_build())
-- * loadout_scans: where the scan came from + detected gear
-- * achievements, gear_stats (Meta aggregates)

create type public.variant_kind as enum ('full', 'stock', 'ablation', 'custom');
create type public.attempt_mode as enum ('ranked', 'practice');
create type public.result_source as enum ('mcp', 'cli');
create type public.loadout_visibility as enum ('hidden', 'categories', 'names', 'install');
create type public.scan_source as enum ('paste', 'cli');

-- build variants ---------------------------------------------------------------
create table public.build_variants (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.variant_kind not null,
  label text not null check (char_length(label) between 1 and 60),
  removed_gear text[] not null default '{}', -- ablation: gear taken out of the full build
  added_gear text[] not null default '{}',   -- custom / fork: gear added on top
  created_at timestamptz not null default now(),
  check (cardinality(removed_gear) <= 50 and cardinality(added_gear) <= 50)
);
create unique index build_variants_one_full on public.build_variants (build_id) where kind = 'full';
create unique index build_variants_one_stock on public.build_variants (build_id) where kind = 'stock';
create index build_variants_user_idx on public.build_variants (user_id);

-- Every build always has a Full and a Stock variant.
create function public.create_default_variants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.build_variants (build_id, user_id, kind, label)
  values (new.id, new.user_id, 'full', 'Full setup'), (new.id, new.user_id, 'stock', 'Stock client');
  return new;
end $$;
revoke execute on function public.create_default_variants() from public, anon, authenticated;
create trigger builds_default_variants after insert on public.builds
  for each row execute function public.create_default_variants();

insert into public.build_variants (build_id, user_id, kind, label)
select b.id, b.user_id, v.kind, v.label
from public.builds b
cross join (values ('full'::public.variant_kind, 'Full setup'), ('stock'::public.variant_kind, 'Stock client')) as v (kind, label);

-- attempts -------------------------------------------------------------------------
alter table public.attempts
  add column variant_id uuid references public.build_variants (id) on delete set null,
  add column mode public.attempt_mode not null default 'ranked',
  add column source public.result_source not null default 'mcp',
  add column tokens_measured integer check (tokens_measured >= 0), -- counted by the CLI (verified)
  add column client text check (char_length(client) <= 40);
create index attempts_variant_idx on public.attempts (variant_id, challenge_id) where status in ('passed', 'failed');

update public.attempts a
set variant_id = v.id
from public.build_variants v
where v.build_id = a.build_id and v.kind = 'full' and a.variant_id is null;

grant select (variant_id, mode, source, tokens_measured, client) on public.attempts to authenticated;

-- profiles -------------------------------------------------------------------------
alter table public.profiles
  add column professions text[] not null default '{}'
    check (cardinality(professions) <= 5 and professions <@ array[
      'programmer', 'data-analyst', 'graphic-designer', 'uiux-designer', 'video-editor',
      'writer', 'marketer', 'researcher', 'student', 'ops'
    ]::text[]),
  add column trust_score numeric(4, 3) not null default 0.5 check (trust_score between 0 and 1);
grant update (professions) on public.profiles to authenticated; -- trust_score stays server-only

-- builds: visibility + private gear -----------------------------------------------------
alter table public.builds
  add column loadout_visibility public.loadout_visibility not null default 'hidden';

-- gear is private by default; the public sees only what loadout_visibility allows (report RPC, later)
revoke select on public.builds from anon, authenticated;
grant select (id, user_id, name, base_model, client, sprite_id, is_primary, loadout_visibility, created_at, updated_at)
  on public.builds to anon, authenticated;

create function public.own_primary_build()
returns table (id uuid, name text, base_model text, client text, gear jsonb, sprite_id text, loadout_visibility public.loadout_visibility)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.base_model, b.client, b.gear, b.sprite_id, b.loadout_visibility
  from public.builds b
  where b.user_id = (select auth.uid()) and b.is_primary
$$;
revoke execute on function public.own_primary_build() from public, anon;
grant execute on function public.own_primary_build() to authenticated;

-- build variants: owner reads; writes are server-side (trigger / service role)
alter table public.build_variants enable row level security;
create policy "own variants read" on public.build_variants for select to authenticated
  using ((select auth.uid()) = user_id);

-- loadout scans ----------------------------------------------------------------------
alter table public.loadout_scans
  add column source public.scan_source not null default 'paste',
  add column gear jsonb not null default '[]'::jsonb; -- detected gear: names / registry ids / categories only

-- achievements -------------------------------------------------------------------------
create table public.achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]+$'),
  awarded_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, code)
);
alter table public.achievements enable row level security;
create policy "achievements readable by all" on public.achievements for select using (true);
-- writes: service role only

-- gear stats (Meta aggregates; filled by the daily job) --------------------------------
create table public.gear_stats (
  gear_id text not null references public.gear_registry (id) on delete cascade,
  segment text not null check (segment in ('all', 'model', 'profession')),
  segment_value text not null default '',
  adopters integer not null default 0 check (adopters >= 0),
  adoption_rate numeric(5, 4) check (adoption_rate between 0 and 1),
  ablation_runs integer not null default 0 check (ablation_runs >= 0),
  lift_delta numeric(7, 2),
  lift_delta_ci_low numeric(7, 2),
  lift_delta_ci_high numeric(7, 2),
  computed_at timestamptz not null default now(),
  primary key (gear_id, segment, segment_value)
);
alter table public.gear_stats enable row level security;
create policy "gear stats readable by all" on public.gear_stats for select using (true);
-- writes: service role only

-- leaderboard counts only ranked runs of the Full setup -----------------------------------
create or replace function public.best_passes(p_league public.league default null)
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
  group by a.user_id, a.challenge_id, c.league, c.category
$$;
revoke execute on function public.best_passes(public.league) from public, anon, authenticated;
