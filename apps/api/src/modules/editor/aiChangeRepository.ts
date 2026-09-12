import type { SupabaseClient } from '@supabase/supabase-js';

export type AiChangeTarget = 'summary' | 'bullet' | 'project' | 'skills';

export interface AiChangeRecord {
  id: string;
  resumeId: string;
  userId: string;
  target: AiChangeTarget;
  beforeText: string;
  afterText: string;
  edited: boolean;
  createdAt: string;
  revertedAt: string | null;
}

interface AiChangeRow {
  id: string;
  resume_id: string;
  user_id: string;
  target: AiChangeTarget;
  before_text: string;
  after_text: string;
  edited: boolean;
  created_at: string;
  reverted_at: string | null;
}

function toRecord(row: AiChangeRow): AiChangeRecord {
  return {
    id: row.id,
    resumeId: row.resume_id,
    userId: row.user_id,
    target: row.target,
    beforeText: row.before_text,
    afterText: row.after_text,
    edited: row.edited,
    createdAt: row.created_at,
    revertedAt: row.reverted_at,
  };
}

export interface RecordChangeInput {
  resumeId: string;
  userId: string;
  target: AiChangeTarget;
  beforeText: string;
  afterText: string;
  edited: boolean;
}

export interface AiChangeRepository {
  record(input: RecordChangeInput): Promise<AiChangeRecord>;
  listForResume(resumeId: string, userId: string): Promise<AiChangeRecord[]>;
  findOwned(changeId: string, userId: string): Promise<AiChangeRecord | null>;
  markReverted(changeId: string, userId: string): Promise<AiChangeRecord | null>;
}

/**
 * The log of AI changes a user accepted.
 *
 * This is what makes "every AI change is reversible" true beyond the life of a
 * browser tab. Reverted rows are marked rather than deleted: what was tried and
 * undone is part of an honest history, and removing it would quietly rewrite
 * the record of what the AI did.
 */
export function createAiChangeRepository(client: SupabaseClient): AiChangeRepository {
  return {
    async record(input) {
      const { data, error } = await client
        .from('ai_changes')
        .insert({
          resume_id: input.resumeId,
          user_id: input.userId,
          target: input.target,
          before_text: input.beforeText,
          after_text: input.afterText,
          edited: input.edited,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Could not record the AI change: ${error?.message ?? 'no row'}`);
      }

      return toRecord(data as AiChangeRow);
    },

    async listForResume(resumeId, userId) {
      const { data, error } = await client
        .from('ai_changes')
        .select()
        .eq('resume_id', resumeId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Could not list AI changes: ${error.message}`);
      }

      return (data as AiChangeRow[]).map(toRecord);
    },

    async findOwned(changeId, userId) {
      const { data, error } = await client
        .from('ai_changes')
        .select()
        .eq('id', changeId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Could not read the AI change: ${error.message}`);
      }

      return data ? toRecord(data as AiChangeRow) : null;
    },

    async markReverted(changeId, userId) {
      // Matching on a null reverted_at makes reverting idempotent: a double
      // click cannot record the same change as undone twice.
      const { data, error } = await client
        .from('ai_changes')
        .update({ reverted_at: new Date().toISOString() })
        .eq('id', changeId)
        .eq('user_id', userId)
        .is('reverted_at', null)
        .select();

      if (error) {
        throw new Error(`Could not revert the AI change: ${error.message}`);
      }

      return data && data.length > 0 ? toRecord(data[0] as AiChangeRow) : null;
    },
  };
}
