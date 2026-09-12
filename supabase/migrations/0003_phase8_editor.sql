-- CareerLens AI — Phase 8: resume editor
--
-- Two tables, because the editor is the first thing that can change a user's
-- resume and the spec's safety rule ("keep the user original as the
-- source-of-truth version") has to hold from that moment on:
--
--   resumes           one per CV the user chose to work on
--   resume_versions   full ResumeData snapshots; the parse is immutable
--
-- Versioning gets its UI in Phase 11, but the shape belongs here. Saving edits
-- into a single mutable row would mean migrating live user data later.
--
-- No resume_sections table (the spec marks it optional): ResumeData is stored
-- whole as jsonb so there is one canonical shape, rather than rows that must be
-- reassembled into the domain model on every read.
--
-- Column names follow the ResumeVersion domain type in packages/types, so the
-- database, the API and the browser share one vocabulary.
--
-- Run this in the Supabase SQL Editor. The final NOTIFY refreshes PostgREST's
-- schema cache; without it the API reports the new tables as missing.

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The upload this was parsed from. Nullable: a resume outlives the file, and
  -- deleting the original upload must not delete the work built on it.
  resume_file_id uuid references public.resume_files (id) on delete set null,
  title text not null default 'My resume',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_user_id_idx on public.resumes (user_id);

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_version_id uuid references public.resume_versions (id) on delete set null,
  -- 'original' is the untouched parse and is never written again.
  -- 'draft' is what the editor autosaves into.
  -- 'ai-improved' and 'job-tailored' arrive in Phases 10 and 14.
  label text not null check (label in ('original', 'draft', 'ai-improved', 'job-tailored')),
  name text not null default '',
  -- The whole ResumeData document.
  data jsonb not null,
  -- Incremented on every save. The editor sends the revision it based its edit
  -- on and a stale write is refused, so a second tab cannot silently overwrite
  -- what the first one just saved.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_versions_resume_id_idx
  on public.resume_versions (resume_id);

-- At most one original and one draft per resume. The other labels are
-- deliberately uncapped: those accumulate as history.
create unique index if not exists resume_versions_singleton_label_idx
  on public.resume_versions (resume_id, label)
  where label in ('original', 'draft');

alter table public.resumes enable row level security;
alter table public.resume_versions enable row level security;

drop policy if exists "resumes_select_own" on public.resumes;
create policy "resumes_select_own" on public.resumes
  for select using (auth.uid() = user_id);

drop policy if exists "resumes_insert_own" on public.resumes;
create policy "resumes_insert_own" on public.resumes
  for insert with check (auth.uid() = user_id);

drop policy if exists "resumes_update_own" on public.resumes;
create policy "resumes_update_own" on public.resumes
  for update using (auth.uid() = user_id);

drop policy if exists "resumes_delete_own" on public.resumes;
create policy "resumes_delete_own" on public.resumes
  for delete using (auth.uid() = user_id);

drop policy if exists "resume_versions_select_own" on public.resume_versions;
create policy "resume_versions_select_own" on public.resume_versions
  for select using (auth.uid() = user_id);

drop policy if exists "resume_versions_insert_own" on public.resume_versions;
create policy "resume_versions_insert_own" on public.resume_versions
  for insert with check (auth.uid() = user_id);

drop policy if exists "resume_versions_update_own" on public.resume_versions;
create policy "resume_versions_update_own" on public.resume_versions
  for update using (auth.uid() = user_id);

drop policy if exists "resume_versions_delete_own" on public.resume_versions;
create policy "resume_versions_delete_own" on public.resume_versions
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
