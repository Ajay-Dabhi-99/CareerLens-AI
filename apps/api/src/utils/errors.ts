/**
 * Error whose message is safe to show a client.
 * Anything else is treated as internal and replaced with a generic message.
 */
export class PublicError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PublicError';
  }
}

/** Thrown when the database has not been migrated — a deployment problem, not a user error. */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

const MISSING_TABLE_PATTERN = /could not find the table '([^']+)'|relation "([^"]+)" does not exist/i;

/**
 * Which migration creates which table, so the hint names the file to run rather
 * than always pointing at the first one.
 */
const TABLE_MIGRATIONS: Record<string, string> = {
  anonymous_analysis_sessions: '0001_phase3_uploads.sql',
  resume_files: '0001_phase3_uploads.sql',
  resume_reviews: '0002_phase7_ai_reviews.sql',
  resumes: '0003_phase8_editor.sql',
  resume_versions: '0003_phase8_editor.sql',
  ai_changes: '0004_phase10_ai_changes.sql',
  job_descriptions: '0006_phase12_job_descriptions.sql',
  job_analyses: '0006_phase12_job_descriptions.sql',
  job_matches: '0007_phase13_job_matches.sql',
};

function migrationFor(table: string): string {
  // Supabase reports the table as "public.resume_files"; the map is keyed bare.
  const bare = table.replace(/^public\./, '');
  return TABLE_MIGRATIONS[bare] ?? '0001_phase3_uploads.sql';
}

/**
 * Supabase reports an un-migrated schema as an ordinary query error. Surfacing that
 * verbatim both leaks internals and hides what actually needs doing, so it is
 * translated into a setup error with a concrete next step.
 */
export function asSetupErrorIfMissingTable(message: string): SetupError | null {
  const match = MISSING_TABLE_PATTERN.exec(message);
  if (!match) return null;

  const table = match[1] ?? match[2] ?? 'a required table';
  return new SetupError(
    `Database table ${table} is missing.`,
    `Run supabase/migrations/${migrationFor(table)} in the Supabase SQL editor.`,
  );
}
