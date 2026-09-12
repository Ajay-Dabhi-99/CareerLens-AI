-- CareerLens AI — Phase 7: AI resume review
--
-- One stored review per uploaded file. The table exists as much for cost
-- control as for history: a review costs a Gemini call, and the free tier
-- allows only a handful per minute, so a review is generated once and read
-- back thereafter rather than regenerated on every page view.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  resume_file_id uuid not null references public.resume_files (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The validated ResumeAnalysis: pros, cons, sectionReviews, priorityActions.
  -- Stored whole so the review a user saw is reproducible even after the
  -- prompt or model changes underneath it.
  analysis jsonb not null,
  -- Which model produced it, so a later quality regression can be traced to a
  -- model change rather than guessed at.
  model text not null,
  created_at timestamptz not null default now()
);

-- One current review per file. A refresh replaces the row rather than
-- accumulating history; versioned reviews arrive with versioning in Phase 11.
create unique index if not exists resume_reviews_file_idx
  on public.resume_reviews (resume_file_id);

create index if not exists resume_reviews_user_id_idx on public.resume_reviews (user_id);

alter table public.resume_reviews enable row level security;

-- Ownership enforced in the database itself, not just in application code.
drop policy if exists "resume_reviews_select_own" on public.resume_reviews;
create policy "resume_reviews_select_own" on public.resume_reviews
  for select using (auth.uid() = user_id);

drop policy if exists "resume_reviews_insert_own" on public.resume_reviews;
create policy "resume_reviews_insert_own" on public.resume_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "resume_reviews_delete_own" on public.resume_reviews;
create policy "resume_reviews_delete_own" on public.resume_reviews
  for delete using (auth.uid() = user_id);
