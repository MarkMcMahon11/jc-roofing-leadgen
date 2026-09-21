-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One small table holds the app's data (settings, leads, messages, funnel counts) as JSON documents.
create table if not exists public.kv (
  key        text primary key,
  value      jsonb       not null,
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

-- Lock the table down: no public access at all. Only the app's server (using the secret key) can read or write it.
alter table public.kv enable row level security;
revoke all on public.kv from anon, authenticated;
