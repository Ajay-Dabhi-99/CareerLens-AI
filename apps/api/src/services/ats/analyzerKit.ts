import type { AtsFinding, AtsFindingSeverity } from '@career-lens-ai/types';
import type { Resume, ResumeBullet } from '@career-lens-ai/types';

export function finding(
  id: string,
  severity: AtsFindingSeverity,
  message: string,
): AtsFinding {
  return { id, severity, message };
}

/** Keeps every analyzer on the same 0-100 scale. */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function allBullets(resume: Resume): ResumeBullet[] {
  return [
    ...resume.experience.flatMap((role) => role.bullets),
    ...resume.projects.flatMap((project) => project.bullets),
  ];
}

export function allSkills(resume: Resume): string[] {
  return resume.skills.flatMap((group) => group.skills);
}

/**
 * Everything the candidate wrote, as one lowercase string. Used for
 * evidence checks such as "is this skill mentioned anywhere else?".
 */
export function resumeCorpus(resume: Resume): string {
  return [
    resume.summary,
    ...resume.experience.flatMap((role) => [role.title, role.company, ...role.bullets.map((b) => b.text)]),
    ...resume.projects.flatMap((project) => [
      project.name,
      project.description ?? '',
      ...project.bullets.map((b) => b.text),
    ]),
    ...resume.certifications.map((certification) => certification.name),
  ]
    .join(' ')
    .toLowerCase();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

/**
 * Rough span of a career, in years, taken from the role dates that parsed.
 *
 * Used to calibrate expectations rather than to credit seniority: more is
 * expected of a longer history, so the same bare bullets cost more. Returns 0
 * when nothing datable was found, which keeps an unparsed resume from being
 * held to a senior standard by accident.
 */
export function estimateYearsOfExperience(resume: Resume): number {
  const years: number[] = [];
  let hasCurrentRole = false;

  for (const role of resume.experience) {
    for (const value of [role.startDate, role.endDate]) {
      const match = value ? YEAR_PATTERN.exec(value) : null;
      if (match) years.push(Number(match[0]));
    }
    if (role.current) hasCurrentRole = true;
  }

  if (years.length === 0) return 0;

  const earliest = Math.min(...years);
  const latest = hasCurrentRole ? new Date().getFullYear() : Math.max(...years);

  return Math.max(0, latest - earliest);
}

/** True when a resume has no meaningful content at all. */
export function isEmptyResume(resume: Resume): boolean {
  return (
    resume.summary.trim() === '' &&
    resume.experience.length === 0 &&
    resume.education.length === 0 &&
    resume.skills.length === 0 &&
    resume.projects.length === 0 &&
    resume.certifications.length === 0
  );
}
