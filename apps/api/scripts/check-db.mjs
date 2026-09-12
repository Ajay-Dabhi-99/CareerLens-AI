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
