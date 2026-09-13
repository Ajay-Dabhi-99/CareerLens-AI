import type { ResumeData } from '@/features/editor/api/editorApi';

/**
 * Formatting shared by every template.
 *
 * Five templates rendering one ResumeData is five chances to disagree about
 * how a date range reads or whether an empty section gets a heading. Those
 * decisions live here once, so the templates differ in how they look and never
 * in what they say.
 */

/** "Jan 2021 – Present", "2018 – 2022", "Jan 2021", or nothing. */
export function dateRange(start?: string, end?: string, current = false): string {
  const from = start?.trim();
  const to = current ? 'Present' : end?.trim();

  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

/** Email, phone, location and links on one line, skipping whatever is absent. */
export function contactItems(resume: ResumeData): string[] {
  const { email, phone, location, linkedin, github, website } = resume.personal;

  return [email, phone, location, linkedin, github, website]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
}

export type SectionKey = 'summary' | 'experience' | 'projects' | 'skills' | 'education' | 'certifications';

/**
 * Whether a section has anything to print.
 *
 * A heading over nothing is the most common template bug there is, and on a
 * resume it reads as a gap the candidate forgot to fill. A section is only
 * present when it has real content, not merely a row with empty fields.
 */
export function hasContent(resume: ResumeData, section: SectionKey): boolean {
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

/** The sections a template should render, in its preferred order, minus empty ones. */
export function visibleSections(resume: ResumeData, order: SectionKey[]): SectionKey[] {
  return order.filter((section) => hasContent(resume, section));
}

/** Bullets with text, so a trailing empty bullet from the editor never prints. */
export function printableBullets<T extends { text: string }>(bullets: T[]): T[] {
  return bullets.filter((bullet) => bullet.text.trim().length > 0);
}
