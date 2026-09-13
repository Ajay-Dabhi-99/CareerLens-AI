-- CareerLens AI — Phase 11: version history
--
-- Phase 8 created resume_versions with four labels: original, draft,
-- ai-improved and job-tailored. None of them honestly describes "a working
-- state the user chose to keep", which is what version history is made of, so
-- this adds 'snapshot'.
--
-- The first version of this file assumed the existing constraint was called
-- resume_versions_label_check. If Postgres had named it anything else, the DROP
-- matched nothing and the ADD then collided with the constraint that was still
-- there — so the migration failed and the old rule stayed in force. The block
-- below finds the constraint by what it governs rather than by its name, so it
-- works whatever the name turned out to be, and is safe to run again.
--
-- Run this in the Supabase SQL Editor.

do $$
declare
  constraint_name text;
begin
  -- Every check constraint on resume_versions that mentions the label column.
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'resume_versions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%label%'
  loop
    execute format(
      'alter table public.resume_versions drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

alter table public.resume_versions
  add constraint resume_versions_label_check
  check (label in ('original', 'draft', 'snapshot', 'ai-improved', 'job-tailored'));

-- Version lists are read newest-first per resume.
create index if not exists resume_versions_resume_created_idx
  on public.resume_versions (resume_id, created_at desc);

notify pgrst, 'reload schema';

-- Proves it worked. Should return exactly one row listing all five labels.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.resume_versions'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%label%';
