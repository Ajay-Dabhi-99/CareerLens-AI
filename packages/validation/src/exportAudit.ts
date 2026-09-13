import type { Resume } from '@career-lens-ai/types';

/**
 * The last check before a resume leaves the product.
 *
 * Drafts are allowed to be incomplete — that was a deliberate choice in the
 * editor, so clearing a field to retype it never fails an autosave — and the
 * price of that choice is paid here. Export is where completeness is enforced.
 *
 * Deterministic and free, like the score. A model is not needed to notice a
 * missing email address, and an audit that could disagree with itself between
 * two clicks would be worse than none.
 *
 * Two severities, and the line between them is deliberate:
 *
 * - blocking: the document would embarrass the candidate or cannot be acted on
 *   by a reader. Export is refused until it is fixed.
 * - warning:  worth a second look, but the user may have a reason. Export goes
 *   ahead once they have seen it.
 */

export interface ExportIssue {
  id: string;
  message: string;
  /** Where to look, in words a person uses: "Experience · Staff Engineer at Monzo". */
  where?: string;
}

export interface ExportAudit {
  blocking: ExportIssue[];
  warnings: ExportIssue[];
  /** True when nothing blocks export. */
  ready: boolean;
}

/**
 * Text in square brackets is almost always a template leftover or an AI
 * placeholder — "[X]%", "[Google Cloud service name]". The rewrite feature
 * itself leaves these on purpose when a stronger line needs a number the resume
 * does not contain, which makes this check the backstop for our own safety
 * mechanism: a placeholder must never reach an employer.
 */
const PLACEHOLDER = /\[[^\]\n]{1,60}\]/;
const FILLER = /\b(lorem ipsum|todo|tbd|xxx+)\b/i;

/**
 * Keeps a location readable. A label is there to point at a place, and a
 * mis-parsed entry whose name is a whole sentence would otherwise bury the
 * message it is attached to.
 */
function shorten(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function roleLabel(title: string, company: string): string {
  return shorten([title, company].filter((part) => part.trim()).join(' at ') || 'an untitled role');
}

function projectLabel(name: string): string {
  return shorten(name.trim() || 'an untitled project');
}

/** Every piece of free text, with a human description of where it sits. */
function textLocations(resume: Resume): Array<{ text: string; where: string }> {
  const out: Array<{ text: string; where: string }> = [];

  out.push({ text: resume.personal.fullName, where: 'Your details' });
  out.push({ text: resume.summary, where: 'Summary' });

  for (const role of resume.experience) {
    const where = `Experience · ${roleLabel(role.title, role.company)}`;
    out.push({ text: `${role.title} ${role.company}`, where });
    for (const bullet of role.bullets) out.push({ text: bullet.text, where });
  }

  for (const project of resume.projects) {
    const where = `Projects · ${projectLabel(project.name)}`;
    out.push({ text: `${project.name} ${project.description ?? ''}`, where });
    for (const bullet of project.bullets) out.push({ text: bullet.text, where });
  }

  for (const group of resume.skills) {
    out.push({ text: `${group.category} ${group.skills.join(' ')}`, where: 'Skills' });
  }

  for (const entry of resume.education) {
    out.push({
      text: `${entry.degree ?? ''} ${entry.fieldOfStudy ?? ''} ${entry.institution}`,
      where: 'Education',
    });
  }

  return out.filter((item) => item.text.trim().length > 0);
}

export function auditForExport(resume: Resume): ExportAudit {
  const blocking: ExportIssue[] = [];
  const warnings: ExportIssue[] = [];

  if (!resume.personal.fullName.trim()) {
    blocking.push({
      id: 'export.no-name',
      message: 'Add your name. A resume without one cannot be attributed to anyone.',
      where: 'Your details',
    });
  }

  if (!resume.personal.email?.trim() && !resume.personal.phone?.trim()) {
    blocking.push({
      id: 'export.no-contact',
      message: 'Add an email address or a phone number, or nobody can reply to it.',
      where: 'Your details',
    });
  }

  const hasBody =
    resume.experience.some((role) => role.title.trim() || role.company.trim()) ||
    resume.projects.some((project) => project.name.trim()) ||
    resume.education.some((entry) => entry.institution.trim());

  if (!hasBody) {
    blocking.push({
      id: 'export.empty',
      message: 'Add at least one role, project or qualification — there is nothing to export yet.',
    });
  }

  // Placeholders and filler: one issue per location, quoting what was found.
  const seen = new Set<string>();
  for (const { text, where } of textLocations(resume)) {
    const match = PLACEHOLDER.exec(text) ?? FILLER.exec(text);
    if (!match) continue;

    const key = `${where}|${match[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    blocking.push({
      id: 'export.placeholder',
      message: `"${match[0]}" looks like a placeholder. Replace it with the real detail, or remove it.`,
      where,
    });
  }

  // Unchecked AI wording: a warning, because the user may well stand behind it,
  // but it is surfaced by location so they check each line rather than the lot.
  for (const role of resume.experience) {
    const unchecked = role.bullets.filter((b) => b.source === 'ai' && !b.verified && b.text.trim());
    if (unchecked.length > 0) {
      warnings.push({
        id: 'export.unverified-ai',
        message: `${unchecked.length} AI-written line${unchecked.length === 1 ? ' has' : 's have'} not been checked. Make sure ${unchecked.length === 1 ? 'it is' : 'they are'} true of you.`,
        where: `Experience · ${roleLabel(role.title, role.company)}`,
      });
    }
  }

  for (const project of resume.projects) {
    const unchecked = project.bullets.filter((b) => b.source === 'ai' && !b.verified && b.text.trim());
    if (unchecked.length > 0) {
      warnings.push({
        id: 'export.unverified-ai',
        message: `${unchecked.length} AI-written line${unchecked.length === 1 ? ' has' : 's have'} not been checked.`,
        where: `Projects · ${projectLabel(project.name)}`,
      });
    }
  }

  for (const role of resume.experience) {
    if (!role.title.trim() && !role.company.trim()) continue;

    if (!role.startDate?.trim()) {
      warnings.push({
        id: 'export.missing-dates',
        message: 'This role has no start date. Readers and filters both look for one.',
        where: `Experience · ${roleLabel(role.title, role.company)}`,
      });
    }

    if (!role.title.trim() || !role.company.trim()) {
      warnings.push({
        id: 'export.incomplete-role',
        message: 'This role is missing its job title or employer.',
        where: `Experience · ${roleLabel(role.title, role.company)}`,
      });
    }
  }

  if (!resume.summary.trim()) {
    warnings.push({
      id: 'export.no-summary',
      message: 'There is no summary. Optional, but it is the first thing most readers see.',
      where: 'Summary',
    });
  }

  return { blocking, warnings, ready: blocking.length === 0 };
}
