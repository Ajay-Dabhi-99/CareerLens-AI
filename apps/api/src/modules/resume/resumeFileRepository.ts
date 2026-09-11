import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResumeFileType } from '../../services/upload/fileValidation.js';

export interface ResumeFileRecord {
  id: string;
  userId: string;
  fileName: string;
  fileType: ResumeFileType;
  fileSize: number;
  storagePath: string;
  createdAt: string;
}

interface ResumeFileRow {
  id: string;
  user_id: string;
  file_name: string;
  file_type: ResumeFileType;
  file_size: number;
  storage_path: string;
  created_at: string;
}

function toRecord(row: ResumeFileRow): ResumeFileRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

export interface CreateResumeFileInput {
  userId: string;
  fileName: string;
  fileType: ResumeFileType;
  fileSize: number;
  storagePath: string;
  importedFromSession?: string;
}

export interface ResumeFileRepository {
  create(input: CreateResumeFileInput): Promise<ResumeFileRecord>;
  listForUser(userId: string): Promise<ResumeFileRecord[]>;
  findOwned(id: string, userId: string): Promise<ResumeFileRecord | null>;
  delete(id: string, userId: string): Promise<boolean>;
}

/**
 * Every method takes the caller's userId and filters on it.
 *
 * The API uses the service role client, which bypasses row-level security, so
 * these filters are the real ownership boundary — RLS is defence in depth behind
 * them, not a substitute.
 */
export function createResumeFileRepository(client: SupabaseClient): ResumeFileRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('resume_files')
        .insert({
          user_id: input.userId,
          file_name: input.fileName,
          file_type: input.fileType,
          file_size: input.fileSize,
          storage_path: input.storagePath,
          imported_from_session: input.importedFromSession ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save the resume file: ${error?.message ?? 'no row'}`);
      }

      return toRecord(data as ResumeFileRow);
    },

    async listForUser(userId) {
      const { data, error } = await client
        .from('resume_files')
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Could not list resume files: ${error.message}`);
      }

      return (data as ResumeFileRow[]).map(toRecord);
    },

    async findOwned(id, userId) {
      const { data, error } = await client
        .from('resume_files')
        .select()
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return null;
      return toRecord(data as ResumeFileRow);
    },

    async delete(id, userId) {
      const { data, error } = await client
        .from('resume_files')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        throw new Error(`Could not delete the resume file: ${error.message}`);
      }

      return (data?.length ?? 0) > 0;
    },
  };
}
