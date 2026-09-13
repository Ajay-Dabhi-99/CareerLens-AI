/**
 * Reports which migrations have actually been applied.
 *
 * Exists because a missing table is the single most common reason the API
 * returns "not fully configured", and because the SQL editor is a manual step
 * that is easy to believe you completed. One command beats reading an error
 * and guessing which migration it means.
 *
 *   npm run db:check --workspace @career-lens-ai/api
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each table and the migration that creates it. */
const EXPECTED = [
  { table: 'anonymous_analysis_sessions', migration: '0001_phase3_uploads.sql' },
  { table: 'resume_files', migration: '0001_phase3_uploads.sql' },
  { table: 'resume_reviews', migration: '0002_phase7_ai_reviews.sql' },
  { table: 'resumes', migration: '0003_phase8_editor.sql' },
  { table: 'resume_versions', migration: '0003_phase8_editor.sql' },
  { table: 'ai_changes', migration: '0004_phase10_ai_changes.sql' },
  { table: 'job_descriptions', migration: '0006_phase12_job_descriptions.sql' },
  { table: 'job_analyses', migration: '0006_phase12_job_descriptions.sql' },
  { table: 'job_matches', migration: '0007_phase13_job_matches.sql' },
];

function readEnv() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(apiRoot, '.env'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .map((line) => {
          const at = line.indexOf('=');
          return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
  } catch {
    console.error('No apps/api/.env found. Copy .env.example and fill it in first.');
    process.exit(1);
  }
}

const env = readEnv();

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env');
  process.exit(1);
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const missing = new Set();

for (const { table, migration } of EXPECTED) {
  /*
   * A real row-returning select, deliberately. A HEAD/count probe reports a
   * table missing from PostgREST's schema cache as success, so this check
   * would cheerfully pass on a database the API cannot actually query — the
   * same class of lie this script exists to catch.
   */
  const { error } = await client.from(table).select().limit(1);

  if (error) {
    console.log(`  missing  ${table.padEnd(30)} (${migration})`);
    missing.add(migration);
  } else {
    console.log(`  ok       ${table}`);
  }
}

/**
 * Migrations that change something other than whether a table exists.
 *
 * Each probe is written so it cannot write anything: the row is aimed at a
 * resume id that does not exist, so the insert always fails. Which error comes
 * back is the answer — Postgres evaluates a CHECK constraint before the foreign
 * key, so a rejected value means the old constraint is still in place, and a
 * foreign key complaint means the value was accepted and the migration is in.
 */
const CHECKS = [
  {
    describe: "resume_versions accepts 'snapshot'",
    migration: '0005_phase11_versions.sql',
    async run() {
      const { error } = await client.from('resume_versions').insert({
        resume_id: '00000000-0000-0000-0000-000000000000',
        user_id: '00000000-0000-0000-0000-000000000000',
        label: 'snapshot',
        data: {},
      });

      // 23514 is a check-constraint violation: the label was refused.
      return error?.code !== '23514';
    },
  },
];

for (const check of CHECKS) {
  let ok = false;
  try {
    ok = await check.run();
  } catch {
    ok = false;
  }

  if (ok) {
    console.log(`  ok       ${check.describe}`);
  } else {
    console.log(`  missing  ${check.describe.padEnd(30)} (${check.migration})`);
    missing.add(check.migration);
  }
}

if (missing.size === 0) {
  console.log('\nAll migrations applied.');
  process.exit(0);
}

console.log('\nRun these in the Supabase SQL editor, in order:');
for (const migration of [...missing].sort()) {
  console.log(`  supabase/migrations/${migration}`);
}
console.log('\nOpen each file and paste its CONTENTS, not its path.');
console.log(
  '\nIf you have already run them, PostgREST may still be serving a stale\n' +
    'schema cache, which looks identical to a missing table. Force a reload:\n' +
    "\n  notify pgrst, 'reload schema';\n",
);
process.exit(1);
