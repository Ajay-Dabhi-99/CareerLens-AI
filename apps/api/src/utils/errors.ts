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
    'Run supabase/migrations/0001_phase3_uploads.sql in the Supabase SQL editor.',
  );
}
