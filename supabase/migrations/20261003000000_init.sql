-- AI Build Arena — initial schema (MVP D1)
-- Plan "users" table = public.profiles (1:1 with auth.users).
-- Writes to attempts/events/api_tokens/baselines happen server-side (service role) only.

create type public.league as enum ('global', 'thai');
create type public.attempt_status as enum ('issued', 'passed', 'failed', 'expired');
create type public.gear_kind as enum ('mcp', 'skill', 'plugin', 'hook', 'cli', 'extension', 'memory', 'other');

-- profiles ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9-]{1,39}$'),
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- builds (MVP: 1 primary build per user; Pro: many) -----------------------
create table public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  base_model text not null,                 -- self-declared, e.g. claude-opus-5-5
  client text,                              -- claude-code | codex | cursor | chatgpt | other
  gear jsonb not null default '[]'::jsonb,  -- self-declared gear ids/names
  sprite_id text not null default 'starter-1',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index builds_one_primary on public.builds (user_id) where is_primary;
create index builds_user_idx on public.builds (user_id);

-- challenges (output-verified; generator/verifier live in packages/challenges)
create table public.challenges (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  league public.league not null,
  category text not null,
  title text not null,
  summary text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  time_limit_seconds integer not null default 900 check (time_limit_seconds > 0),
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- attempts ---------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  build_id uuid references public.builds (id) on delete set null,
  challenge_id text not null references public.challenges (id),
  challenge_version integer not null,
  seed text not null,                       -- hidden from clients (column grants below)
  status public.attempt_status not null default 'issued',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  duration_ms integer,
  correct boolean,
  score numeric(7, 2),
  lift numeric(7, 2),
  tokens_self_reported integer,
  model_self_reported text
);
create index attempts_user_idx on public.attempts (user_id, issued_at desc);
create index attempts_challenge_score_idx on public.attempts (challenge_id, score desc) where status = 'passed';

-- baselines (vanilla base model per challenge, for Lift) -------------------
create table public.baselines (
  challenge_id text not null references public.challenges (id) on delete cascade,
  model text not null,
  runs integer not null check (runs > 0),
  pass_rate numeric(5, 4) not null check (pass_rate between 0 and 1),
  avg_score numeric(7, 2) not null,
  avg_duration_ms integer,
  measured_at timestamptz not null default now(),
  primary key (challenge_id, model)
);

-- gear registry (~50 tools for Loadout Doctor) ----------------------------
create table public.gear_registry (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  kind public.gear_kind not null,
  category text not null,
  capabilities text[] not null default '{}',
  match_patterns text[] not null default '{}', -- how parsers recognise it in configs
  homepage text,
  risk_notes text,
  created_at timestamptz not null default now()
);

-- loadout scans (only parsed results; raw config never leaves the browser) --
create table public.loadout_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  build_id uuid references public.builds (id) on delete set null,
  summary jsonb not null,
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index loadout_scans_user_idx on public.loadout_scans (user_id, created_at desc);

-- events (product analytics mirror / waitlist clicks) ----------------------
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_idx on public.events (name, created_at desc);

-- per-user API tokens for Remote MCP (only sha256 hash stored) -------------
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'default',
  token_prefix text not null,               -- first chars, for display
  token_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_tokens_user_idx on public.api_tokens (user_id);

-- updated_at trigger -------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger builds_touch before update on public.builds
  for each row execute function public.touch_updated_at();

-- create profile on GitHub sign-up -----------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username', split_part(new.email, '@', 1), 'user'),
    '[^a-zA-Z0-9-]', '', 'g');
  uname text;
begin
  if base = '' then base := 'user'; end if;
  uname := left(base, 39);
  if exists (select 1 from public.profiles where username = uname) then
    uname := left(base, 32) || '-' || substr(new.id::text, 1, 6);
  end if;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, uname,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS ------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.builds enable row level security;
alter table public.challenges enable row level security;
alter table public.attempts enable row level security;
alter table public.baselines enable row level security;
alter table public.gear_registry enable row level security;
alter table public.loadout_scans enable row level security;
alter table public.events enable row level security;
alter table public.api_tokens enable row level security;

-- public profiles/builds (leaderboard + share cards)
create policy "profiles readable by all" on public.profiles for select using (true);
create policy "own profile update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "builds readable by all" on public.builds for select using (true);
create policy "own builds insert" on public.builds for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own builds update" on public.builds for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own builds delete" on public.builds for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "active challenges readable" on public.challenges for select using (is_active);
create policy "baselines readable" on public.baselines for select using (true);
create policy "gear readable" on public.gear_registry for select using (true);

create policy "own attempts read" on public.attempts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "own scans read" on public.loadout_scans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own scans insert" on public.loadout_scans for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own scans delete" on public.loadout_scans for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "own tokens read" on public.api_tokens for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own tokens revoke" on public.api_tokens for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- events: no client policies (service role only)

-- column-level hiding: clients never see attempt seeds or token hashes
revoke select on public.attempts from anon, authenticated;
grant select (id, user_id, build_id, challenge_id, challenge_version, status, issued_at, expires_at,
              submitted_at, duration_ms, correct, score, lift, tokens_self_reported, model_self_reported)
  on public.attempts to authenticated;
revoke select, update on public.api_tokens from anon, authenticated;
grant select (id, user_id, name, token_prefix, last_used_at, revoked_at, created_at) on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;
