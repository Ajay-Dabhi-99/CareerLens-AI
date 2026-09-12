import { z } from 'zod';

/**
 * The contract for a resume being edited, as opposed to a finished one.
 *
 * `resumeSchema` requires a name, an employer, a job title and non-empty
 * bullets. That is correct for a resume about to be exported and wrong for one
 * being written: a user who clears a field to retype it would fail validation
 * mid-keystroke and lose the autosave. A draft is allowed to be incomplete;
 * completeness is enforced at export (Phase 16), where it actually matters.
 *
 * What this schema does enforce is shape and size. Every field here becomes
 * stored data and later prompt content, so the limits are a real boundary and
 * not decoration.
 */

/** Generous enough for any honest resume, small enough to bound a prompt. */
const SHORT = 200;
const MEDIUM = 1_000;
const LONG = 5_000;

/**
 * Caps on repeated structures. A resume with 200 roles is not a resume, and
 * unbounded arrays are what turn a text field into a storage bill.
 */
const MAX_ENTRIES = 50;
const MAX_BULLETS = 50;
const MAX_SKILLS = 100;

const draftText = (max: number) => z.string().max(max);

/**
 * URL fields are optional-or-empty rather than optional-or-valid-URL: a
 * half-typed address must not fail the save that is happening as it is typed.
 */
const draftUrl = z.union([z.string().max(SHORT), z.literal('')]).optional();

export const draftPersonalInfoSchema = z.object({
  fullName: draftText(SHORT),
  email: draftText(SHORT).optional(),
  phone: draftText(SHORT).optional(),
  location: draftText(SHORT).optional(),
  linkedin: draftUrl,
  website: draftUrl,
  github: draftUrl,
});

export const draftBulletSchema = z.object({
  id: z.string().max(SHORT),
  text: draftText(MEDIUM),
  verified: z.boolean(),
  source: z.enum(['user', 'ai']),
});

export const draftExperienceSchema = z.object({
  id: z.string().max(SHORT),
  company: draftText(SHORT),
  title: draftText(SHORT),
  location: draftText(SHORT).optional(),
  startDate: draftText(SHORT).optional(),
  endDate: draftText(SHORT).optional(),
  current: z.boolean(),
  bullets: z.array(draftBulletSchema).max(MAX_BULLETS),
});

export const draftEducationSchema = z.object({
  id: z.string().max(SHORT),
  institution: draftText(SHORT),
  degree: draftText(SHORT).optional(),
  fieldOfStudy: draftText(SHORT).optional(),
  startDate: draftText(SHORT).optional(),
  endDate: draftText(SHORT).optional(),
  gpa: draftText(SHORT).optional(),
});

export const draftProjectSchema = z.object({
  id: z.string().max(SHORT),
  name: draftText(SHORT),
  description: draftText(MEDIUM).optional(),
  bullets: z.array(draftBulletSchema).max(MAX_BULLETS),
  technologies: z.array(draftText(SHORT)).max(MAX_SKILLS).optional(),
  link: draftUrl,
});

export const draftCertificationSchema = z.object({
  id: z.string().max(SHORT),
  name: draftText(SHORT),
  issuer: draftText(SHORT).optional(),
  issueDate: draftText(SHORT).optional(),
  expiryDate: draftText(SHORT).optional(),
});

export const draftSkillGroupSchema = z.object({
  id: z.string().max(SHORT),
  category: draftText(SHORT),
  skills: z.array(draftText(SHORT)).max(MAX_SKILLS),
});

export const draftMetadataSchema = z.object({
  sourceFileName: draftText(SHORT).optional(),
  sourceFileType: z.enum(['pdf', 'docx', 'txt']).optional(),
  parsedAt: z.string().max(SHORT).optional(),
  wordCount: z.number().optional(),
  templateId: z.string().max(SHORT).optional(),
});

export const resumeDraftSchema = z.object({
  id: z.string().max(SHORT),
  userId: z.string().max(SHORT),
  personal: draftPersonalInfoSchema,
  summary: draftText(LONG),
  skills: z.array(draftSkillGroupSchema).max(MAX_ENTRIES),
  experience: z.array(draftExperienceSchema).max(MAX_ENTRIES),
  education: z.array(draftEducationSchema).max(MAX_ENTRIES),
  projects: z.array(draftProjectSchema).max(MAX_ENTRIES),
  certifications: z.array(draftCertificationSchema).max(MAX_ENTRIES),
  metadata: draftMetadataSchema,
});

export type ResumeDraft = z.infer<typeof resumeDraftSchema>;
