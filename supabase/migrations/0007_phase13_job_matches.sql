-- CareerLens AI — Phase 13: job match
--
-- One row per (resume version, job analysis) pair: the match score and the
-- verdict on every requirement, with the line of the resume that supports it.
--
-- Stored because producing it costs an AI call for the requirements a keyword
-- lookup could not settle, and because a match is about a specific version of a
-- resume — re-running it later against an edited draft would answer a different
-- question.
--
-- Run this in the Supabase SQL Editor.

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The exact version matched. Keeping this rather than the resume id is the
  -- difference between "this resume matched 72%" and "this draft, as it stood
  -- on Tuesday, matched 72%".
  resume_version_id uuid not null
    references public.resume_versions (id) on delete cascade,
  job_analysis_id uuid not null references public.job_analyses (id) on delete cascade,
  match_score integer not null check (match_score between 0 and 100),
  -- SkillMatch[]: requirement id, state, evidence and confidence.
  matches jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

-- One current match per pair; re-running replaces it.
create unique index if not exists job_matches_pair_idx
  on public.job_matches (resume_version_id, job_analysis_id);

create index if not exists job_matches_user_id_idx
  on public.job_matches (user_id, created_at desc);

alter table public.job_matches enable row level security;

drop policy if exists "job_matches_select_own" on public.job_matches;
create policy "job_matches_select_own" on public.job_matches
  for select using (auth.uid() = user_id);

drop policy if exists "job_matches_insert_own" on public.job_matches;
create policy "job_matches_insert_own" on public.job_matches
  for insert with check (auth.uid() = user_id);

drop policy if exists "job_matches_update_own" on public.job_matches;
create policy "job_matches_update_own" on public.job_matches
  for update using (auth.uid() = user_id);

drop policy if exists "job_matches_delete_own" on public.job_matches;
create policy "job_matches_delete_own" on public.job_matches
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
