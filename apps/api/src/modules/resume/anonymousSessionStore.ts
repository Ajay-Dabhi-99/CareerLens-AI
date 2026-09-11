import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResumeFileType } from '../../services/upload/fileValidation.js';

export const ANONYMOUS_SESSION_TTL_MINUTES = 60;

export interface AnonymousSessionRecord {
  id: string;
  fileName: string;
  fileType: ResumeFileType;
  fileSize: number;
  parsedData: unknown | null;
  metrics: unknown | null;
  createdAt: string;
  expiresAt: string;
  importedAt: string | null;
}

export interface CreatedAnonymousSession {
  /** Returned to the browser once. Only its hash is persisted. */
  token: string;
  session: AnonymousSessionRecord;
}

export interface CreateAnonymousSessionInput {
  fileName: string;
  fileType: ResumeFileType;
  fileSize: number;
  parsedData?: unknown;
  metrics?: unknown;
}

/** The raw token never touches the database, so a dump alone cannot resume a session. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface SessionRow {
  id: string;
  file_name: string;
  file_type: ResumeFileType;
  file_size: number;
  parsed_data: unknown | null;
  metrics: unknown | null;
  created_at: string;
  expires_at: string;
  imported_at: string | null;
}

function toRecord(row: SessionRow): AnonymousSessionRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    parsedData: row.parsed_data,
    metrics: row.metrics,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    importedAt: row.imported_at,
  };
}

export interface AnonymousSessionStore {
  create(input: CreateAnonymousSessionInput): Promise<CreatedAnonymousSession>;
  findByToken(token: string): Promise<AnonymousSessionRecord | null>;
  markImported(sessionId: string, userId: string): Promise<void>;
  purgeExpired(): Promise<number>;
}

export function createAnonymousSessionStore(client: SupabaseClient): AnonymousSessionStore {
  return {
    async create(input) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + ANONYMOUS_SESSION_TTL_MINUTES * 60_000);

      const { data, error } = await client
        .from('anonymous_analysis_sessions')
        .insert({
          token_hash: hashToken(token),
          file_name: input.fileName,
          file_type: input.fileType,
          file_size: input.fileSize,
          parsed_data: input.parsedData ?? null,
          metrics: input.metrics ?? null,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not create anonymous session: ${error?.message ?? 'no row'}`);
      }

      return { token, session: toRecord(data as SessionRow) };
    },

    async findByToken(token) {
      const { data, error } = await client
        .from('anonymous_analysis_sessions')
        .select()
        .eq('token_hash', hashToken(token))
        .maybeSingle();

      if (error || !data) return null;

      const record = toRecord(data as SessionRow);

      // Expired sessions are treated as absent even if cleanup has not run yet.
      if (new Date(record.expiresAt).getTime() <= Date.now()) return null;

      return record;
    },

    async markImported(sessionId, userId) {
      const { error } = await client
        .from('anonymous_analysis_sessions')
        .update({ imported_at: new Date().toISOString(), imported_by: userId })
        .eq('id', sessionId);

      if (error) {
        throw new Error(`Could not mark session imported: ${error.message}`);
      }
    },

    async purgeExpired() {
      const { data, error } = await client.rpc('purge_expired_anonymous_sessions');
      if (error) {
        throw new Error(`Could not purge expired sessions: ${error.message}`);
      }
      return typeof data === 'number' ? data : 0;
    },
  };
}

export { hashToken };
