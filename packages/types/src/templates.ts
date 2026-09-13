/**
 * Template identity and section order, shared by the web preview and the
 * server-side exporters.
 *
 * The order lives here rather than in either app because it is the one thing a
 * template decides that changes what a reader sees first. If the preview and
 * the DOCX kept their own copies, the file a user downloads could list sections
 * in a different order from the page they approved — the exact mismatch export
 * is meant to rule out.
 */

export type TemplateId = 'modern' | 'minimal' | 'professional' | 'technical' | 'executive';

export type TemplateSection =
  | 'summary'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'education'
  | 'certifications';

export const TEMPLATE_IDS: TemplateId[] = [
  'modern',
  'minimal',
  'professional',
  'technical',
  'executive',
];

export const TEMPLATE_SECTION_ORDER: Record<TemplateId, TemplateSection[]> = {
  modern: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'],
  minimal: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'],
  professional: ['summary', 'experience', 'education', 'certifications', 'skills', 'projects'],
  technical: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
  executive: ['summary', 'experience', 'education', 'certifications', 'skills', 'projects'],
};

export const DEFAULT_TEMPLATE_ID: TemplateId = 'modern';

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as string[]).includes(value);
}

/** How a template lays out skills: grouped by category, or one inline run. */
export const TEMPLATE_SKILLS_LAYOUT: Record<TemplateId, 'grouped' | 'inline'> = {
  modern: 'grouped',
  minimal: 'inline',
  professional: 'grouped',
  technical: 'grouped',
  executive: 'inline',
};

/**
 * The minimum a renderer reads to decide whether a section exists. Structural
 * rather than the full Resume, so the web's local copy of the shape satisfies it
 * as well as the domain type.
 */
export interface SectionContentSource {
  summary: string;
  experience: Array<{ title: string; company: string; bullets: Array<{ text: string }> }>;
  projects: Array<{ name: string; description?: string; bullets: Array<{ text: string }> }>;
  skills: Array<{ skills: string[] }>;
  education: Array<{ institution: string; degree?: string }>;
  certifications: Array<{ name: string }>;
}

/**
 * Whether a section has anything to print.
 *
 * Shared so the preview and every exporter agree. If the preview hid an empty
 * Projects heading and the DOCX printed it, the downloaded file would not be
 * the document the user approved.
 */
export function sectionHasContent(resume: SectionContentSource, section: TemplateSection): boolean {
  switch (section) {
    case 'summary':
      return resume.summary.trim().length > 0;
    case 'experience':
      return resume.experience.some(
        (role) => role.title.trim() || role.company.trim() || role.bullets.some((b) => b.text.trim()),
      );
    case 'projects':
      return resume.projects.some(
        (project) =>
          project.name.trim() || project.description?.trim() || project.bullets.some((b) => b.text.trim()),
      );
    case 'skills':
      return resume.skills.some((group) => group.skills.some((skill) => skill.trim()));
    case 'education':
      return resume.education.some((entry) => entry.institution.trim() || entry.degree?.trim());
    case 'certifications':
      return resume.certifications.some((certification) => certification.name.trim());
  }
}

/** "Jan 2021 – Present", "2018 – 2022", a lone date, or nothing. Shared for the same reason. */
export function formatDateRange(start?: string, end?: string, current = false): string {
  const from = start?.trim();
  const to = current ? 'Present' : end?.trim();

  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}
