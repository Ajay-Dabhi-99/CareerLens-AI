import { authedFetch } from '@/lib/api';
import type { FullScore } from '@/features/resume/api/resumeApi';

export interface PersonalInfo {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  github?: string;
}

export interface ResumeBullet {
  id: string;
  text: string;
  verified: boolean;
  source: 'user' | 'ai';
}

export interface Experience {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current: boolean;
  bullets: ResumeBullet[];
}

export interface Education {
  id: string;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  bullets: ResumeBullet[];
  technologies?: string[];
  link?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface SkillGroup {
  id: string;
  category: string;
  skills: string[];
}

export interface ResumeData {
  id: string;
  userId: string;
  personal: PersonalInfo;
  summary: string;
  skills: SkillGroup[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  metadata: Record<string, unknown>;
}

export interface ResumeRecord {
  id: string;
  userId: string;
  resumeFileId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  label: 'original' | 'draft' | 'ai-improved' | 'job-tailored';
  name: string;
  data: ResumeData;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface EditorSnapshot {
  resume: ResumeRecord;
  draft: ResumeVersion;
  original: ResumeVersion | null;
  score: FullScore;
}

export async function listEditorResumes(): Promise<ResumeRecord[]> {
  const response = await authedFetch('/api/editor/resumes');
  const body = (await response.json()) as { resumes: ResumeRecord[] };
  return body.resumes;
}

export async function createEditorResume(
  resumeFileId: string,
  title?: string,
): Promise<{ resume: ResumeRecord; draft: ResumeVersion; reopened: boolean }> {
  const response = await authedFetch('/api/editor/resumes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeFileId, title }),
  });
  return (await response.json()) as {
    resume: ResumeRecord;
    draft: ResumeVersion;
    reopened: boolean;
  };
}

export async function getEditorResume(id: string): Promise<EditorSnapshot> {
  const response = await authedFetch(`/api/editor/resumes/${id}`);
  return (await response.json()) as EditorSnapshot;
}

/** Thrown when the draft moved on underneath this edit; the caller must reload. */
export class StaleDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleDraftError';
  }
}

export async function saveDraft(
  resumeId: string,
  data: ResumeData,
  baseRevision: number,
): Promise<{ draft: ResumeVersion; score: FullScore }> {
  try {
    const response = await authedFetch(`/api/editor/resumes/${resumeId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseRevision }),
    });
    return (await response.json()) as { draft: ResumeVersion; score: FullScore };
  } catch (error) {
    // A conflict is not a generic failure: it means someone else's work is at
    // risk, and the UI has to say so rather than retrying over the top of it.
    if (error instanceof Error && /changed somewhere else/i.test(error.message)) {
      throw new StaleDraftError(error.message);
    }
    throw error;
  }
}

export type RewriteTarget = 'summary' | 'bullet' | 'project' | 'skills';

export interface RewriteOption {
  text: string;
  explanation: string;
  requiresVerification: boolean;
}

/**
 * Asks for rewrite options. Returns suggestions only — this endpoint has no
 * ability to change the resume, so applying one is always a separate save the
 * user triggers.
 */
export async function requestRewrite(
  resumeId: string,
  target: RewriteTarget,
  currentText: string,
): Promise<{ options: RewriteOption[]; cached: boolean }> {
  const response = await authedFetch(`/api/editor/resumes/${resumeId}/rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, currentText }),
  });
  return (await response.json()) as { options: RewriteOption[]; cached: boolean };
}

export async function deleteEditorResume(id: string): Promise<void> {
  await authedFetch(`/api/editor/resumes/${id}`, { method: 'DELETE' });
}

export interface AiChange {
  id: string;
  resumeId: string;
  target: RewriteTarget;
  beforeText: string;
  afterText: string;
  edited: boolean;
  createdAt: string;
  revertedAt: string | null;
}

/**
 * Records an accepted suggestion so it can be put back later.
 *
 * Separate from the draft save on purpose: the text reaches the resume through
 * the ordinary autosave, so a failure here costs the ability to revert that one
 * change from history and never the edit itself.
 */
export async function recordAiChange(
  resumeId: string,
  change: { target: RewriteTarget; beforeText: string; afterText: string; edited: boolean },
): Promise<AiChange> {
  const response = await authedFetch(`/api/editor/resumes/${resumeId}/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  });
  const body = (await response.json()) as { change: AiChange };
  return body.change;
}

export async function listAiChanges(resumeId: string): Promise<AiChange[]> {
  const response = await authedFetch(`/api/editor/resumes/${resumeId}/changes`);
  const body = (await response.json()) as { changes: AiChange[] };
  return body.changes;
}

export async function revertAiChange(
  resumeId: string,
  changeId: string,
): Promise<{ change: AiChange; draft: ResumeVersion; score: FullScore }> {
  const response = await authedFetch(
    `/api/editor/resumes/${resumeId}/changes/${changeId}/revert`,
    { method: 'POST' },
  );
  return (await response.json()) as { change: AiChange; draft: ResumeVersion; score: FullScore };
}
