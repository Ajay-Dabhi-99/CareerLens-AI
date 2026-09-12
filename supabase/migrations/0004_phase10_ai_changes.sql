-- CareerLens AI — Phase 10: diff and approval
--
-- The spec's Definition of Done for this phase is "every AI change is
-- reversible". Undo in the editor lives in browser memory, so reloading the
-- page made an accepted rewrite permanent. This table is what makes the
-- guarantee survive a reload, a new device and a week away.
--
-- One row per accepted suggestion, holding the text as it was and as it became.
-- That is enough to show the user what the AI actually changed on their resume,
-- and to put any single change back without disturbing the others.
--
-- Run this in the Supabase SQL Editor. The final NOTIFY refreshes PostgREST's
-- schema cache; without it the API reports the new table as missing.

create table if not exists public.ai_changes (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Which kind of content was rewritten: summary, bullet, project or skills.
  target text not null check (target in ('summary', 'bullet', 'project', 'skills')),
  -- The text as the user had it, and as they accepted it. Kept in full rather
  -- than as a diff: a diff is derived, and the original is the thing we must
  -- never lose.
  before_text text not null,
  after_text text not null,
  -- True when the user edited the suggestion before accepting it, so the record
  -- distinguishes "took the AI's words" from "used them as a starting point".
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  -- Set when the change is put back. The row is kept rather than deleted so the
  -- history of what was tried stays honest.
  reverted_at timestamptz
);

create index if not exists ai_changes_resume_id_idx
  on public.ai_changes (resume_id, created_at desc);

alter table public.ai_changes enable row level security;

drop policy if exists "ai_changes_select_own" on public.ai_changes;
create policy "ai_changes_select_own" on public.ai_changes
  for select using (auth.uid() = user_id);

drop policy if exists "ai_changes_insert_own" on public.ai_changes;
create policy "ai_changes_insert_own" on public.ai_changes
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_changes_update_own" on public.ai_changes;
create policy "ai_changes_update_own" on public.ai_changes
  for update using (auth.uid() = user_id);

drop policy if exists "ai_changes_delete_own" on public.ai_changes;
create policy "ai_changes_delete_own" on public.ai_changes
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
