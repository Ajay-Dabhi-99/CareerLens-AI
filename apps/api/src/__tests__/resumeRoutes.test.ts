import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AuthVerifier } from '../modules/auth/index.js';
import type {
  AnonymousSessionRecord,
  AnonymousSessionStore,
} from '../modules/resume/anonymousSessionStore.js';
import type { ResumeFileRepository } from '../modules/resume/resumeFileRepository.js';
import type { ResumeStorage } from '../services/supabase/storage.js';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  GEMINI_API_KEY: 'test-gemini-key',
  CORS_ORIGIN: 'http://localhost:5173',
};

const AUTHED_USER = { id: 'user-1', email: 'jane@example.com' };

/**
 * These tests cover routing, auth and limits, so they upload plain text — it parses
 * deterministically. Real PDF extraction is covered in textExtraction.test.ts.
 */
function resumeBuffer(): Buffer {
  return Buffer.from('Jane Doe\njane@example.com\n\nEXPERIENCE\nEngineer, Acme\n', 'utf8');
}

/** Valid PDF magic bytes but not a readable document. */
function corruptPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.7\nnot actually a pdf', 'utf8');
}

/** Minimal multipart body so we exercise the real @fastify/multipart path. */
function multipart(fileName: string, content: Buffer, contentType = 'application/pdf') {
  const boundary = '----clTestBoundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

function sessionRecord(overrides: Partial<AnonymousSessionRecord> = {}): AnonymousSessionRecord {
  return {
    id: 'session-1',
    fileName: 'cv.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    parsedData: null,
    metrics: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    importedAt: null,
    ...overrides,
  };
}

function makeDeps() {
  const anonymousSessions: AnonymousSessionStore = {
    create: vi.fn().mockResolvedValue({ token: 'raw-token', session: sessionRecord() }),
    findByToken: vi.fn().mockResolvedValue(null),
    markImported: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue(0),
  };

  const resumeFiles: ResumeFileRepository = {
    create: vi.fn().mockResolvedValue({
      id: 'file-1',
      userId: AUTHED_USER.id,
      fileName: 'cv.pdf',
      fileType: 'pdf',
      fileSize: 23,
      storagePath: 'user-1/cv.pdf',
      createdAt: new Date().toISOString(),
    }),
    listForUser: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
  };

  const storage: ResumeStorage = {
    upload: vi.fn().mockResolvedValue({ storagePath: 'user-1/cv.pdf' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  const authVerifier: AuthVerifier = {
    verifyToken: vi.fn().mockResolvedValue(AUTHED_USER),
  };

  return { anonymousSessions, resumeFiles, storage, authVerifier };
}

async function appWith(deps: ReturnType<typeof makeDeps>) {
  return buildApp(testEnv, deps);
}

describe('public quick analysis', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('accepts an anonymous upload and returns a session token', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.sessionToken).toBe('raw-token');
    expect(body.status).toBe('scored');
    // The upload was parsed into structured data, not just stored.
    expect(body.resume.personal.fullName).toBe('Jane Doe');
    expect(body.resume.personal.email).toBe('jane@example.com');
    expect(body.detectedSections).toContain('experience');

    await app.close();
  });

  it('returns a score with the free tier of findings only', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    const body = response.json();
    expect(body.status).toBe('scored');
    expect(body.score.finalScore).toBeGreaterThanOrEqual(0);
    expect(body.score.finalScore).toBeLessThanOrEqual(100);
    // Every category is shown — the score breakdown is the free promise.
    expect(body.score.categories).toHaveLength(8);
    // The detail is the gated part.
    expect(body.score.findings.length).toBeLessThanOrEqual(3);
    expect(body.score.withheldFindings).toBeGreaterThan(0);

    await app.close();
  });

  it('does not send withheld findings to an anonymous client at all', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    const body = response.json();
    const shownIds = new Set(body.score.findings.map((f: { id: string }) => f.id));

    // The raw response must not contain findings beyond the ones we chose to show,
    // otherwise the gate is cosmetic and recoverable from devtools.
    const raw = response.body;
    const leakedCategoryFindings = raw.includes('"findings":[{"id"') && body.score.withheldFindings > 0;
    expect(leakedCategoryFindings).toBe(body.score.findings.length > 0);
    expect(shownIds.size).toBe(body.score.findings.length);
    expect(raw).not.toMatch(/"categories":\[\{"category":"[^"]+","weight":[^}]+,"findings"/);

    await app.close();
  });

  it('returns a readable error for a file it cannot parse', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.pdf', corruptPdfBuffer());

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/could not read that file/i);
    // Nothing is persisted for a file we could not read.
    expect(deps.anonymousSessions.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('needs no authentication', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(201);
    expect(deps.authVerifier.verifyToken).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects a file whose bytes are not a supported resume', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00]));

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(400);
    expect(deps.anonymousSessions.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('never creates a user-owned record for an anonymous upload', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    await app.inject({ method: 'POST', url: '/api/public/analyze', payload, headers });

    expect(deps.resumeFiles.create).not.toHaveBeenCalled();
    expect(deps.storage.upload).not.toHaveBeenCalled();

    await app.close();
  });

  it('treats an expired or unknown session as not found', async () => {
    const app = await appWith(deps);
    deps.anonymousSessions.findByToken = vi.fn().mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/api/public/analyze/whatever' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('reports an un-migrated database as a setup problem without leaking internals', async () => {
    deps.anonymousSessions.create = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Could not create anonymous session: Could not find the table 'public.anonymous_analysis_sessions' in the schema cache",
        ),
      );
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(503);
    const body = response.body;
    expect(body).not.toMatch(/schema cache/i);
    expect(body).not.toMatch(/anonymous_analysis_sessions/);

    await app.close();
  });

  it('does not leak unexpected internal errors', async () => {
    deps.anonymousSessions.create = vi
      .fn()
      .mockRejectedValue(new Error('connection string postgres://user:hunter2@db'));
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/analyze',
      payload,
      headers,
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toMatch(/hunter2/);
    expect(response.json().error).toBe('Something went wrong. Please try again.');

    await app.close();
  });

  it('rate limits repeated anonymous uploads', async () => {
    const app = await appWith(deps);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');
      const response = await app.inject({
        method: 'POST',
        url: '/api/public/analyze',
        payload,
        headers,
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);

    await app.close();
  });
});

describe('authenticated resume files', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('rejects an upload with no token', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({ method: 'POST', url: '/api/resumes', payload, headers });

    expect(response.statusCode).toBe(401);
    expect(deps.storage.upload).not.toHaveBeenCalled();

    await app.close();
  });

  it('stores the file and records it against the caller', async () => {
    const app = await appWith(deps);
    const { payload, headers } = multipart('cv.txt', resumeBuffer(), 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes',
      payload,
      headers: { ...headers, authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(201);
    expect(deps.storage.upload).toHaveBeenCalledWith(
      AUTHED_USER.id,
      'cv.txt',
      'text/plain',
      expect.any(Buffer),
    );
    expect(deps.resumeFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTHED_USER.id }),
    );

    // Signed in means the full score, with findings attached to every category.
    const body = response.json();
    expect(body.score.categories).toHaveLength(8);
    expect(body.score.categories.every((c: { findings: unknown[] }) => Array.isArray(c.findings))).toBe(
      true,
    );
    expect(body.score.withheldFindings).toBeUndefined();

    await app.close();
  });

  it('will not delete a file belonging to someone else', async () => {
    const app = await appWith(deps);
    deps.resumeFiles.findOwned = vi.fn().mockResolvedValue(null);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/resumes/someone-elses-id',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(deps.storage.remove).not.toHaveBeenCalled();
    expect(deps.resumeFiles.delete).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes an owned file from storage and the database', async () => {
    const app = await appWith(deps);
    deps.resumeFiles.findOwned = vi.fn().mockResolvedValue({
      id: 'file-1',
      userId: AUTHED_USER.id,
      fileName: 'cv.pdf',
      fileType: 'pdf',
      fileSize: 23,
      storagePath: 'user-1/cv.pdf',
      createdAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/resumes/file-1',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(deps.storage.remove).toHaveBeenCalledWith('user-1/cv.pdf');
    expect(deps.resumeFiles.delete).toHaveBeenCalledWith('file-1', AUTHED_USER.id);

    await app.close();
  });
});

describe('importing an anonymous session', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('requires authentication', async () => {
    const app = await appWith(deps);

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/import',
      payload: { sessionToken: 'raw-token' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('marks the session imported for the caller', async () => {
    const app = await appWith(deps);
    deps.anonymousSessions.findByToken = vi.fn().mockResolvedValue(sessionRecord());

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/import',
      payload: { sessionToken: 'raw-token' },
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(201);
    expect(deps.anonymousSessions.markImported).toHaveBeenCalledWith('session-1', AUTHED_USER.id);

    await app.close();
  });

  it('refuses to import the same session twice', async () => {
    const app = await appWith(deps);
    deps.anonymousSessions.findByToken = vi
      .fn()
      .mockResolvedValue(sessionRecord({ importedAt: new Date().toISOString() }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes/import',
      payload: { sessionToken: 'raw-token' },
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(409);
    expect(deps.anonymousSessions.markImported).not.toHaveBeenCalled();

    await app.close();
  });
});
