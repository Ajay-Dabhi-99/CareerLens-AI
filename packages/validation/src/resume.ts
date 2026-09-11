import { z } from 'zod';

export const personalInfoSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().url().optional(),
  website: z.string().url().optional(),
  github: z.string().url().optional(),
});

export const resumeBulletSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  verified: z.boolean(),
  source: z.enum(['user', 'ai']),
});

export const experienceSchema = z.object({
  id: z.string(),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean(),
  bullets: z.array(resumeBulletSchema),
});

export const educationSchema = z.object({
  id: z.string(),
  institution: z.string().min(1),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  bullets: z.array(resumeBulletSchema),
  technologies: z.array(z.string()).optional(),
  link: z.string().url().optional(),
});

export const certificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  issuer: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
});

export const skillGroupSchema = z.object({
  id: z.string(),
  category: z.string().min(1),
  skills: z.array(z.string()),
});

export const resumeMetadataSchema = z.object({
  sourceFileName: z.string().optional(),
  sourceFileType: z.enum(['pdf', 'docx', 'txt']).optional(),
  parsedAt: z.string().optional(),
  wordCount: z.number().optional(),
  templateId: z.string().optional(),
});

export const resumeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  personal: personalInfoSchema,
  summary: z.string(),
  skills: z.array(skillGroupSchema),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  projects: z.array(projectSchema),
  certifications: z.array(certificationSchema),
  metadata: resumeMetadataSchema,
});

export const resumeSuggestionSchema = z.object({
  id: z.string(),
  section: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  issue: z.string(),
  whyItMatters: z.string(),
  originalText: z.string().optional(),
  suggestedText: z.string().optional(),
  requiresVerification: z.boolean(),
  confidence: z.number().min(0).max(1),
});
