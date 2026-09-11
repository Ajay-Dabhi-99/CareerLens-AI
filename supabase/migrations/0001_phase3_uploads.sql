-- CareerLens AI — Phase 3: resume uploads
--
-- Two stores, deliberately separate (master spec, Sections 9 and 16):
--   anonymous_analysis_sessions  temporary, TTL-expired, never user-owned
--   resume_files                 persistent, owned, one row per uploaded file
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

-- ---------------------------------------------------------------------------
-- Anonymous quick-analysis sessions
-- ---------------------------------------------------------------------------
create table if not exists public.anonymous_analysis_sessions (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the session token. The raw token is returned to the browser once
  -- and never stored, so a database leak alone cannot resume someone's session.
  token_hash text not null unique,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  parsed_data jsonb,
  metrics jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  imported_at timestamptz,
  imported_by uuid references auth.users (id) on delete set null
);

create index if not exists anonymous_analysis_sessions_expires_at_idx
  on public.anonymous_analysis_sessions (expires_at);

-- RLS on with no policies: unreachable via the anon or authenticated keys.
-- The API reaches it with the service role only after validating the session
-- token, which is what actually authorises access.
alter table public.anonymous_analysis_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Owned resume files
-- ---------------------------------------------------------------------------
create table if not exists public.resume_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  storage_path text not null unique,
  -- Set when this file came from an anonymous session the user imported.
  imported_from_session uuid references public.anonymous_analysis_sessions (id)
    on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists resume_files_user_id_idx on public.resume_files (user_id);

alter table public.resume_files enable row level security;

-- Ownership enforced in the database itself, not just in application code.
drop policy if exists "resume_files_select_own" on public.resume_files;
create policy "resume_files_select_own" on public.resume_files
  for select using (auth.uid() = user_id);

drop policy if exists "resume_files_insert_own" on public.resume_files;
create policy "resume_files_insert_own" on public.resume_files
  for insert with check (auth.uid() = user_id);

drop policy if exists "resume_files_delete_own" on public.resume_files;
create policy "resume_files_delete_own" on public.resume_files
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- TTL cleanup
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_anonymous_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.anonymous_analysis_sessions
  where expires_at < now()
    and imported_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
