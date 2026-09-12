import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resume, ResumeRecord, ResumeVersion, VersionLabel } from '@career-lens-ai/types';
import { PublicError } from '../../utils/errors.js';

interface ResumeRow {
  id: string;
  user_id: string;
  resume_file_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  resume_id: string;
  user_id: string;
  parent_version_id: string | null;
  label: VersionLabel;
  name: string;
  data: Resume;
  revision: number;
  created_at: string;
  updated_at: string;
}

function toResume(row: ResumeRow): ResumeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    resumeFileId: row.resume_file_id ?? undefined,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVersion(row: VersionRow): ResumeVersion {
  return {
    id: row.id,
    resumeId: row.resume_id,
    parentVersionId: row.parent_version_id ?? undefined,
    label: row.label,
    name: row.name,
    data: row.data,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateResumeInput {
  userId: string;
  resumeFileId?: string;
  title: string;
  /** The parse. Stored as the immutable 'original' and copied into the draft. */
  data: Resume;
}

export interface SaveDraftInput {
  resumeId: string;
  userId: string;
  data: Resume;
  /** The revision the edit was based on. A stale value is refused. */
  baseRevision: number;
}

export interface SnapshotInput {
  resumeId: string;
  userId: string;
  name: string;
  data: Resume;
  /** The version this was taken from, so the history has a shape. */
  parentVersionId?: string;
}

export interface ResumeEditorRepository {
  create(input: CreateResumeInput): Promise<{ resume: ResumeRecord; draft: ResumeVersion }>;
  listForUser(userId: string): Promise<ResumeRecord[]>;
  findOwned(resumeId: string, userId: string): Promise<ResumeRecord | null>;
  findByFile(resumeFileId: string, userId: string): Promise<ResumeRecord | null>;
  findVersions(resumeId: string, userId: string): Promise<ResumeVersion[]>;
  findVersion(versionId: string, userId: string): Promise<ResumeVersion | null>;
  /** Keeps a copy of the current draft under a name the user chose. */
  snapshot(input: SnapshotInput): Promise<ResumeVersion>;
  deleteVersion(versionId: string, userId: string): Promise<boolean>;
  saveDraft(input: SaveDraftInput): Promise<ResumeVersion>;
  delete(resumeId: string, userId: string): Promise<boolean>;
}

/**
 * Resumes and their versions.
 *
 * As elsewhere, every method filters on the caller's userId: the API holds the
 * service role key, which bypasses row-level security, so these filters are the
 * ownership boundary and the RLS policies are defence behind them.
 *
 * A query error always throws. "No row" and "the query failed" must not
 * collapse into the same answer — reporting a database fault as an absent
 * resume would tell a user their work is gone when it is sitting there safely.
 */
export function createResumeEditorRepository(client: SupabaseClient): ResumeEditorRepository {
  async function insertVersion(
    resumeId: string,
    userId: string,
    label: VersionLabel,
    name: string,
    data: Resume,
  ): Promise<ResumeVersion> {
    const { data: row, error } = await client
      .from('resume_versions')
      .insert({ resume_id: resumeId, user_id: userId, label, name, data })
      .select()
      .single();

    if (error || !row) {
      throw new Error(`Could not create the ${label} version: ${error?.message ?? 'no row'}`);
    }

    return toVersion(row as VersionRow);
  }

  return {
    async create(input) {
      const { data: resumeRow, error } = await client
        .from('resumes')
        .insert({
          user_id: input.userId,
          resume_file_id: input.resumeFileId ?? null,
          title: input.title,
        })
        .select()
        .single();

      if (error || !resumeRow) {
        throw new Error(`Could not create the resume: ${error?.message ?? 'no row'}`);
      }

      const resume = toResume(resumeRow as ResumeRow);

      /*
       * The parse is written twice on purpose: once as 'original', which is
       * never updated again, and once as the draft the editor works in. That
       * is what makes "revert to my original" possible no matter how much the
       * user has since changed.
       */
      await insertVersion(resume.id, input.userId, 'original', 'Original upload', input.data);
      const draft = await insertVersion(
        resume.id,
        input.userId,
        'draft',
        'Working draft',
        input.data,
      );

      return { resume, draft };
    },

    async listForUser(userId) {
      const { data, error } = await client
        .from('resumes')
        .select()
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Could not list resumes: ${error.message}`);
      }

      return (data as ResumeRow[]).map(toResume);
    },

    async findOwned(resumeId, userId) {
      const { data, error } = await client
        .from('resumes')
        .select()
        .eq('id', resumeId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Could not read the resume: ${error.message}`);
      }

      return data ? toResume(data as ResumeRow) : null;
    },

    /**
     * The resume already built from a given upload, if there is one.
     *
     * Opening the editor twice on the same file must reopen the same work, not
     * start a second copy: two resumes from one upload would drift apart
     * silently and the user would have no way to tell which held their edits.
     */
    async findByFile(resumeFileId, userId) {
      const { data, error } = await client
        .from('resumes')
        .select()
        .eq('resume_file_id', resumeFileId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Could not look up the resume for that file: ${error.message}`);
      }

      return data ? toResume(data as ResumeRow) : null;
    },

    async findVersions(resumeId, userId) {
      const { data, error } = await client
        .from('resume_versions')
        .select()
        .eq('resume_id', resumeId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Could not read the resume versions: ${error.message}`);
      }

      return (data as VersionRow[]).map(toVersion);
    },

    async findVersion(versionId, userId) {
      const { data, error } = await client
        .from('resume_versions')
        .select()
        .eq('id', versionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Could not read that version: ${error.message}`);
      }

      return data ? toVersion(data as VersionRow) : null;
    },

    async snapshot(input) {
      const { data, error } = await client
        .from('resume_versions')
        .insert({
          resume_id: input.resumeId,
          user_id: input.userId,
          label: 'snapshot',
          name: input.name,
          data: input.data,
          parent_version_id: input.parentVersionId ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not save that version: ${error?.message ?? 'no row'}`);
      }

      return toVersion(data as VersionRow);
    },

    async deleteVersion(versionId, userId) {
      /*
       * The label filter is the real protection, not the UI. The original is
       * the source of truth every restore depends on and the draft is what the
       * editor is writing to; deleting either would break the guarantee that
       * any change can be undone, so neither is reachable from here.
       */
      const { data, error } = await client
        .from('resume_versions')
        .delete()
        .eq('id', versionId)
        .eq('user_id', userId)
        .not('label', 'in', '("original","draft")')
        .select('id');

      if (error) {
        throw new Error(`Could not delete that version: ${error.message}`);
      }

      return (data?.length ?? 0) > 0;
    },

    async saveDraft(input) {
      /*
       * The revision guard is the whole point of the column. Matching on it in
       * the WHERE clause makes the check and the write one atomic statement —
       * reading the revision first and then updating would leave a window in
       * which another tab saves in between, which is exactly the race this
       * exists to prevent.
       */
      const { data, error } = await client
        .from('resume_versions')
        .update({
          data: input.data,
          revision: input.baseRevision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('resume_id', input.resumeId)
        .eq('user_id', input.userId)
        .eq('label', 'draft')
        .eq('revision', input.baseRevision)
        .select();

      if (error) {
        throw new Error(`Could not save the draft: ${error.message}`);
      }

      if (!data || data.length === 0) {
        // Either the draft is gone or someone else has already saved over this
        // revision. Both mean this edit must not be applied blindly.
        throw new PublicError(
          'This resume was changed somewhere else since you started editing. Reload to get the latest version before saving again.',
          409,
        );
      }

      // Touch the parent so "most recently worked on" ordering stays truthful.
      await client
        .from('resumes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', input.resumeId)
        .eq('user_id', input.userId);

      return toVersion(data[0] as VersionRow);
    },

    async delete(resumeId, userId) {
      const { data, error } = await client
        .from('resumes')
        .delete()
        .eq('id', resumeId)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        throw new Error(`Could not delete the resume: ${error.message}`);
      }

      return (data?.length ?? 0) > 0;
    },
  };
}
