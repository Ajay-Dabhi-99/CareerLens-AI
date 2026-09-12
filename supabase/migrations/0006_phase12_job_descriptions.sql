-- CareerLens AI — Phase 12: optional job description
--
-- A job description is always optional (master spec, Section 16): skipping it
-- must never block analysis, editing or export. Nothing else in the schema
-- references these tables, which is what keeps that promise structural rather
-- than a rule someone has to remember.
--
-- Requires an account, because the analysis and the tailored versions built on
-- it in Phase 14 are persistent user data.
--
-- Run this in the Supabase SQL Editor. The final NOTIFY refreshes PostgREST's
-- schema cache; without it the API reports the new tables as missing.

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The posting as given to us. Kept verbatim: the analysis is derived and can
  -- be regenerated, the source text cannot.
  raw_text text not null,
  title text,
  company text,
  -- How it arrived, so the UI can show it the way the user gave it.
  source text not null default 'paste' check (source in ('paste', 'upload')),
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists job_descriptions_user_id_idx
  on public.job_descriptions (user_id, created_at desc);

create table if not exists public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  job_description_id uuid not null
    references public.job_descriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The validated JobAnalysis: requirements and keywords.
  requirements jsonb not null,
  keywords jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

-- One analysis per posting. Extraction costs an AI call and the source text
-- never changes, so a second one would spend quota to learn the same thing.
create unique index if not exists job_analyses_job_idx
  on public.job_analyses (job_description_id);

create index if not exists job_analyses_user_id_idx on public.job_analyses (user_id);

alter table public.job_descriptions enable row level security;
alter table public.job_analyses enable row level security;

drop policy if exists "job_descriptions_select_own" on public.job_descriptions;
create policy "job_descriptions_select_own" on public.job_descriptions
  for select using (auth.uid() = user_id);

drop policy if exists "job_descriptions_insert_own" on public.job_descriptions;
create policy "job_descriptions_insert_own" on public.job_descriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "job_descriptions_delete_own" on public.job_descriptions;
create policy "job_descriptions_delete_own" on public.job_descriptions
  for delete using (auth.uid() = user_id);

drop policy if exists "job_analyses_select_own" on public.job_analyses;
create policy "job_analyses_select_own" on public.job_analyses
  for select using (auth.uid() = user_id);

drop policy if exists "job_analyses_insert_own" on public.job_analyses;
create policy "job_analyses_insert_own" on public.job_analyses
  for insert with check (auth.uid() = user_id);

drop policy if exists "job_analyses_delete_own" on public.job_analyses;
create policy "job_analyses_delete_own" on public.job_analyses
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
