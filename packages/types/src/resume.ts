/**
 * Canonical resume domain model.
 * Source of truth: docs/CareerLens_AI_Master_Spec.docx, Section 8.
 */

export interface PersonalInfo {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  github?: string;
}

export type BulletSource = 'user' | 'ai';

export interface ResumeBullet {
  id: string;
  text: string;
  verified: boolean;
  source: BulletSource;
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

export interface ResumeMetadata {
  sourceFileName?: string;
  sourceFileType?: 'pdf' | 'docx' | 'txt';
  parsedAt?: string;
  wordCount?: number;
  templateId?: string;
}

export interface Resume {
  id: string;
  userId: string;
  personal: PersonalInfo;
  summary: string;
  skills: SkillGroup[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  metadata: ResumeMetadata;
}

export type SuggestionPriority = 'high' | 'medium' | 'low';

export interface ResumeSuggestion {
  id: string;
  section: string;
  priority: SuggestionPriority;
  issue: string;
  whyItMatters: string;
  originalText?: string;
  suggestedText?: string;
  requiresVerification: boolean;
  confidence: number;
}

export type VersionLabel = 'original' | 'ai-improved' | 'job-tailored';

export interface ResumeVersion {
  id: string;
  resumeId: string;
  parentVersionId?: string;
  label: VersionLabel;
  name: string;
  data: Resume;
  atsScoreId?: string;
  jobDescriptionId?: string;
  createdAt: string;
}
