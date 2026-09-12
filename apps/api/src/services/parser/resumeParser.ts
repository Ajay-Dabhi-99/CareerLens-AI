import { randomUUID } from 'node:crypto';
import type {
  Certification,
  Education,
  Experience,
  PersonalInfo,
  Project,
  Resume,
  ResumeBullet,
  SkillGroup,
} from '@career-lens-ai/types';
import type { ResumeFileType } from '../upload/fileValidation.js';
import { detectSections, type DetectedSections } from './sectionDetection.js';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_PATTERN = /((?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,]+)/i;
const GITHUB_PATTERN = /((?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|,]+)/i;
const GENERIC_URL_PATTERN = /((?:https?:\/\/)[^\s|,]+|(?:www\.)[^\s|,]+)/i;

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DATE_RANGE_PATTERN = new RegExp(
  `((?:${MONTH}\\s+)?\\d{4}|\\d{1,2}\\/\\d{4})\\s*(?:-|to|–)\\s*((?:${MONTH}\\s+)?\\d{4}|\\d{1,2}\\/\\d{4}|present|current|now)`,
  'i',
);

const BULLET_PREFIX = /^[-*‣>]\s*/;

/**
 * Degree abbreviations, anchored to word boundaries.
 *
 * Loose substrings are unsafe here: an unanchored `ba` matches inside
 * "Ahmedabad", which previously made a city look like a qualification.
 */
const DEGREE_PATTERN =
  /\b(b\.?sc|b\.?a|b\.?s|b\.?des|b\.?tech|b\.?eng?|b\.?com|bba|llb|m\.?sc|m\.?a|m\.?s|m\.?des|m\.?tech|m\.?eng?|m\.?com|mba|ph\.?d|dphil|diploma|bachelors?|masters?|doctorate|degree|associate)\b/i;

const INSTITUTION_PATTERN = /\b(universit|college|school|institute|academy|polytechnic|iit|nit|nid|iim)\b/i;

/** Indentation deeper than this marks a continuation rather than a new entry. */
const BULLET_INDENT_SPACES = 2;

function indentOf(line: string): number {
  return (/^ */.exec(line)?.[0] ?? '').length;
}

/**
 * A line is a bullet if it carries a bullet glyph, or if it is indented
 * relative to the entry it belongs to.
 *
 * Many resumes draw bullet glyphs as vector shapes, so no character survives
 * extraction. Without the indentation check every such line reads as the start
 * of a new role, which collapses an entire work history into a single entry
 * with nothing described under it.
 */
function isBullet(line: string, baseIndent = 0): boolean {
  if (BULLET_PREFIX.test(line.trim())) return true;
  return indentOf(line) >= baseIndent + BULLET_INDENT_SPACES;
}

function stripBullet(line: string): string {
  return line.trim().replace(BULLET_PREFIX, '').trim();
}

function toBullet(text: string): ResumeBullet {
  return { id: randomUUID(), text, verified: true, source: 'user' };
}

function withUrlProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Splits an entry header like "Staff Engineer, Monzo - London" or "Monzo | Staff Engineer". */
function splitHeaderParts(line: string): string[] {
  return line
    .split(/\s*[|,]\s*| - | – /)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function extractPersonalInfo(headerLines: string[]): PersonalInfo {
  const joined = headerLines.join(' | ');

  const email = EMAIL_PATTERN.exec(joined)?.[0];
  const linkedin = LINKEDIN_PATTERN.exec(joined)?.[1];
  const github = GITHUB_PATTERN.exec(joined)?.[1];

  // Run the phone pattern on text with emails and URLs removed, so their digits
  // cannot be mistaken for a phone number.
  const phoneSearchSpace = joined
    .replace(new RegExp(EMAIL_PATTERN.source, 'g'), ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\w+\.(com|io|dev|net|org)\S*/gi, ' ');
  const phone = PHONE_PATTERN.exec(phoneSearchSpace)?.[1]?.trim();

  let website: string | undefined;
  const genericUrl = GENERIC_URL_PATTERN.exec(joined)?.[1];
  if (genericUrl && !/linkedin\.com|github\.com/i.test(genericUrl)) {
    website = withUrlProtocol(genericUrl);
  }

  // The name is the first line that is not contact details.
  const fullName =
    headerLines.find(
      (line) =>
        line.length > 1 &&
        line.length <= 60 &&
        !EMAIL_PATTERN.test(line) &&
        !PHONE_PATTERN.test(line) &&
        !/https?:\/\/|linkedin\.com|github\.com|@/i.test(line),
    ) ?? '';

  // Contact details are often packed onto one line ("email | phone | London, UK"),
  // so search the delimited fields rather than whole lines.
  const fields = headerLines.flatMap((line) =>
    line
      .split('|')
      .map((field) => field.trim())
      .filter(Boolean),
  );

  const location = fields.find(
    (field) =>
      field !== fullName &&
      field.length <= 60 &&
      /,/.test(field) &&
      !EMAIL_PATTERN.test(field) &&
      !PHONE_PATTERN.test(field) &&
      !/https?:\/\/|linkedin|github|@/i.test(field),
  );

  return {
    fullName: fullName.trim(),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(location ? { location: location.trim() } : {}),
    ...(linkedin ? { linkedin: withUrlProtocol(linkedin) } : {}),
    ...(github ? { github: withUrlProtocol(github) } : {}),
    ...(website ? { website } : {}),
  };
}

/** Groups lines into entries: a non-bullet line starts one, following lines attach to it. */
function groupEntries(lines: string[]): Array<{ headerLines: string[]; bullets: string[] }> {
  const entries: Array<{ headerLines: string[]; bullets: string[] }> = [];
  let currentEntry: { headerLines: string[]; bullets: string[] } | null = null;

  // Entry headers sit at the section's shallowest indentation; anything deeper
  // continues the entry above it.
  const contentLines = lines.filter((line) => line.trim() !== '');
  const baseIndent =
    contentLines.length > 0 ? Math.min(...contentLines.map((line) => indentOf(line))) : 0;

  for (const line of lines) {
    if (line.trim() === '') {
      currentEntry = null;
      continue;
    }

    if (isBullet(line, baseIndent)) {
      // A bullet with no preceding header still belongs somewhere.
      currentEntry ??= (() => {
        const created = { headerLines: [], bullets: [] };
        entries.push(created);
        return created;
      })();
      currentEntry.bullets.push(stripBullet(line));
      continue;
    }

    // A new non-bullet line after bullets means a new entry has started.
    if (!currentEntry || currentEntry.bullets.length > 0) {
      currentEntry = { headerLines: [line.trim()], bullets: [] };
      entries.push(currentEntry);
    } else {
      currentEntry.headerLines.push(line.trim());
    }
  }

  return entries.filter((entry) => entry.headerLines.length > 0 || entry.bullets.length > 0);
}

function extractDates(lines: string[]): { startDate?: string; endDate?: string; current: boolean } {
  for (const line of lines) {
    const match = DATE_RANGE_PATTERN.exec(line);
    if (match) {
      const end = match[2];
      const isCurrent = /present|current|now/i.test(end ?? '');
      return {
        startDate: match[1],
        ...(isCurrent ? {} : { endDate: end }),
        current: isCurrent,
      };
    }
  }
  return { current: false };
}

export function parseExperience(lines: string[]): Experience[] {
  return groupEntries(lines).map((entry) => {
    const dates = extractDates(entry.headerLines);
    const nonDateLines = entry.headerLines.filter((line) => !DATE_RANGE_PATTERN.test(line));
    const parts = splitHeaderParts(nonDateLines[0] ?? '');

    return {
      id: randomUUID(),
      title: parts[0] ?? '',
      company: parts[1] ?? nonDateLines[1] ?? '',
      ...(parts[2] ? { location: parts[2] } : {}),
      ...dates,
      bullets: entry.bullets.map(toBullet),
    };
  });
}

export function parseEducation(lines: string[]): Education[] {
  return groupEntries(lines).map((entry) => {
    const dates = extractDates(entry.headerLines);
    const nonDateLines = entry.headerLines.filter((line) => !DATE_RANGE_PATTERN.test(line));
    const parts = splitHeaderParts(nonDateLines[0] ?? '');

    // "BSc Computer Science, University of Manchester"
    const degreeLike = parts.find((part) => DEGREE_PATTERN.test(part));
    const institution =
      parts.find((part) => part !== degreeLike && INSTITUTION_PATTERN.test(part)) ??
      parts.find((part) => part !== degreeLike) ??
      nonDateLines[1] ??
      '';

    return {
      id: randomUUID(),
      institution: institution.trim(),
      ...(degreeLike ? { degree: degreeLike.trim() } : {}),
      ...(dates.startDate ? { startDate: dates.startDate } : {}),
      ...(dates.endDate ? { endDate: dates.endDate } : {}),
    };
  });
}

export function parseSkills(lines: string[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  const ungrouped: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    const cleaned = stripBullet(line);

    // "Languages: TypeScript, Go, Python"
    const labelled = /^([A-Za-z][A-Za-z /&+-]{1,40}):\s*(.+)$/.exec(cleaned);
    if (labelled) {
      groups.push({
        id: randomUUID(),
        category: labelled[1]!.trim(),
        skills: labelled[2]!
          .split(/[,;|]/)
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      continue;
    }

    ungrouped.push(
      ...cleaned
        .split(/[,;|]/)
        .map((skill) => skill.trim())
        .filter(Boolean),
    );
  }

  if (ungrouped.length > 0) {
    groups.push({ id: randomUUID(), category: 'Skills', skills: ungrouped });
  }

  return groups;
}

export function parseProjects(lines: string[]): Project[] {
  return groupEntries(lines).map((entry) => {
    const headline = entry.headerLines[0] ?? '';
    const [namePart, ...descriptionParts] = headline.split(/\s+-\s+|\s+–\s+|:\s+/);
    const description = descriptionParts.join(' - ').trim();

    return {
      id: randomUUID(),
      name: (namePart ?? '').trim(),
      ...(description ? { description } : {}),
      bullets: entry.bullets.map(toBullet),
    };
  });
}

export function parseCertifications(lines: string[]): Certification[] {
  return lines
    .filter((line) => line !== '')
    .map((line) => {
      const cleaned = stripBullet(line);
      const year = /\b(19|20)\d{2}\b/.exec(cleaned)?.[0];
      const name = cleaned.replace(/[,\s-]*\b(19|20)\d{2}\b\s*$/, '').trim();

      return {
        id: randomUUID(),
        name: name || cleaned,
        ...(year ? { issueDate: year } : {}),
      };
    });
}

export interface ParseResumeOptions {
  userId?: string;
  fileName?: string;
  fileType?: ResumeFileType;
}

export interface ParsedResume {
  resume: Resume;
  sections: DetectedSections;
}

/**
 * Best-effort deterministic parse. Ambiguous layouts may leave fields blank —
 * that is intentional. Nothing here guesses at content the document does not
 * contain; filling gaps is the AI's job later, behind explicit verification.
 */
export function parseResumeText(text: string, options: ParseResumeOptions = {}): ParsedResume {
  const sections = detectSections(text);
  const { sections: found } = sections;

  const summary = (found.summary ?? [])
    .filter((line) => line !== '')
    .map(stripBullet)
    .join(' ')
    .trim();

  const resume: Resume = {
    id: randomUUID(),
    userId: options.userId ?? '',
    personal: extractPersonalInfo(sections.header),
    summary,
    skills: parseSkills(found.skills ?? []),
    experience: parseExperience(found.experience ?? []),
    education: parseEducation(found.education ?? []),
    projects: parseProjects(found.projects ?? []),
    certifications: parseCertifications(found.certifications ?? []),
    metadata: {
      ...(options.fileName ? { sourceFileName: options.fileName } : {}),
      ...(options.fileType ? { sourceFileType: options.fileType } : {}),
      parsedAt: new Date().toISOString(),
      wordCount: text.split(/\s+/).filter(Boolean).length,
    },
  };

  return { resume, sections };
}
