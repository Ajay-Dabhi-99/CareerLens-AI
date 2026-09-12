-- CareerLens AI — Phase 11: version history
--
-- Phase 8 created resume_versions with four labels: original, draft,
-- ai-improved and job-tailored. None of them honestly describes "a working
-- state the user chose to keep", which is what version history is made of, so
-- this adds 'snapshot'.
--
-- The singleton index from 0003 still applies only to original and draft, so
-- snapshots accumulate as intended without any change to it.
--
-- Run this in the Supabase SQL Editor. The final NOTIFY refreshes PostgREST's
-- schema cache; without it the API reports the constraint as unchanged.

alter table public.resume_versions
  drop constraint if exists resume_versions_label_check;

alter table public.resume_versions
  add constraint resume_versions_label_check
  check (label in ('original', 'draft', 'snapshot', 'ai-improved', 'job-tailored'));

-- Version lists are read newest-first per resume.
create index if not exists resume_versions_resume_created_idx
  on public.resume_versions (resume_id, created_at desc);

notify pgrst, 'reload schema';
