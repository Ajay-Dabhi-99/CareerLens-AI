import {
  formatDateRange,
  sectionHasContent,
  type TemplateSection,
} from '@career-lens-ai/types';
import type { ResumeData } from '@/features/editor/api/editorApi';

/**
 * Formatting shared by every template.
 *
 * Five templates rendering one ResumeData is five chances to disagree about
 * how a date range reads or whether an empty section gets a heading. Those
 * decisions live here once, so the templates differ in how they look and never
 * in what they say.
 */

/** "Jan 2021 – Present", "2018 – 2022", "Jan 2021", or nothing. Shared with the exporters. */
export const dateRange = formatDateRange;

/** Email, phone, location and links on one line, skipping whatever is absent. */
export function contactItems(resume: ResumeData): string[] {
  const { email, phone, location, linkedin, github, website } = resume.personal;

  return [email, phone, location, linkedin, github, website]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
}

export type SectionKey = TemplateSection;

/**
 * Whether a section has anything to print. The rule is shared with the DOCX
 * exporter, so the preview and the downloaded file agree on what appears.
 */
export function hasContent(resume: ResumeData, section: SectionKey): boolean {
  return sectionHasContent(resume, section);
}

/** The sections a template should render, in its preferred order, minus empty ones. */
export function visibleSections(resume: ResumeData, order: SectionKey[]): SectionKey[] {
  return order.filter((section) => hasContent(resume, section));
}

/** Bullets with text, so a trailing empty bullet from the editor never prints. */
export function printableBullets<T extends { text: string }>(bullets: T[]): T[] {
  return bullets.filter((bullet) => bullet.text.trim().length > 0);
}
