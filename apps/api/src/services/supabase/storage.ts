import type { SupabaseClient } from '@supabase/supabase-js';

export const RESUME_BUCKET = 'resume-files';

export interface StoredFile {
  storagePath: string;
}

export interface ResumeStorage {
  upload(userId: string, fileName: string, contentType: string, body: Buffer): Promise<StoredFile>;
  download(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}

/** Private bucket — files are only reachable through signed URLs we issue. */
async function ensureBucket(client: SupabaseClient): Promise<void> {
  const { data } = await client.storage.getBucket(RESUME_BUCKET);
  if (data) return;

  const { error } = await client.storage.createBucket(RESUME_BUCKET, { public: false });
  // A concurrent boot may have created it first; that is not a failure.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}

export function createResumeStorage(client: SupabaseClient): ResumeStorage {
  let bucketReady: Promise<void> | null = null;

  function ready(): Promise<void> {
    bucketReady ??= ensureBucket(client);
    return bucketReady;
  }

  return {
    async upload(userId, fileName, contentType, body) {
      await ready();

      // Namespacing by user id keeps one user's objects out of another's prefix.
      const storagePath = `${userId}/${Date.now()}-${sanitizeFileName(fileName)}`;

      const { error } = await client.storage
        .from(RESUME_BUCKET)
        .upload(storagePath, body, { contentType, upsert: false });

      if (error) {
        throw new Error(`Could not store the file: ${error.message}`);
      }

      return { storagePath };
    },

    /**
     * Reads a stored original back.
     *
     * The AI review re-parses the file we hold rather than accepting resume
     * JSON from the browser: the review has to describe the document the user
     * actually uploaded, and a client-supplied body would let anyone spend an
     * AI call on arbitrary text.
     */
    async download(storagePath) {
      await ready();

      const { data, error } = await client.storage.from(RESUME_BUCKET).download(storagePath);
      if (error || !data) {
        throw new Error(`Could not read the stored file: ${error?.message ?? 'no data'}`);
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async remove(storagePath) {
      await ready();
      const { error } = await client.storage.from(RESUME_BUCKET).remove([storagePath]);
      if (error) {
        throw new Error(`Could not delete the file: ${error.message}`);
      }
    },
  };
}
