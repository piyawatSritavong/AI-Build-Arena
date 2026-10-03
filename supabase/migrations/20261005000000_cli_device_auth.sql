-- D10: browser sign-in for the SetupTier CLI (OAuth-style device authorization).
-- The CLI asks for a code, the signed-in user approves it on setuptier.com/cli,
-- and the CLI then receives a normal API token (api_tokens) exactly once.
-- Service role only: RLS on, no client policies.

create table public.cli_device_codes (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,   -- sha256 of the secret the CLI polls with
  user_code text not null unique check (user_code ~ '^[A-Z]{4}-[A-Z]{4}$'),
  client_name text not null check (char_length(client_name) between 1 and 60),
  user_id uuid references public.profiles (id) on delete cascade,
  approved_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index cli_device_codes_expires_idx on public.cli_device_codes (expires_at);
alter table public.cli_device_codes enable row level security;
