export type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications';

export interface DetectedSections {
  /** Lines above the first recognised heading — typically name and contact details. */
  header: string[];
  sections: Partial<Record<SectionKey, string[]>>;
  /** Headings we found, in document order. Useful for structure scoring in Phase 5. */
  order: SectionKey[];
}

const SECTION_PATTERNS: Array<{ key: SectionKey; patterns: RegExp[] }> = [
  {
    key: 'summary',
    patterns: [
      /^(professional\s+|career\s+|personal\s+)?summary$/i,
      /^profile$/i,
      /^objective$/i,
      /^about(\s+me)?$/i,
      /^overview$/i,
    ],
  },
  {
    key: 'experience',
    patterns: [
      /^(work\s+|professional\s+|employment\s+|relevant\s+)?experience$/i,
      /^employment(\s+history)?$/i,
      /^work\s+history$/i,
      /^career\s+history$/i,
    ],
  },
  {
    key: 'education',
    patterns: [/^education(\s+(and|&)\s+training)?$/i, /^academic\s+background$/i, /^qualifications$/i],
  },
  {
    key: 'skills',
    patterns: [
      /^(technical\s+|core\s+|key\s+)?skills$/i,
      /^technologies$/i,
      /^tech\s+stack$/i,
      /^competencies$/i,
      /^skills\s+(and|&)\s+\w+$/i,
    ],
  },
  {
    key: 'projects',
    patterns: [/^(personal\s+|selected\s+|side\s+|key\s+)?projects$/i, /^portfolio$/i],
  },
  {
    key: 'certifications',
    patterns: [
      /^certifications?$/i,
      /^licen[sc]es?(\s+(and|&)\s+certifications?)?$/i,
      /^courses?(\s+(and|&)\s+certifications?)?$/i,
    ],
  },
];

/** Headings are short and stand alone; body text that merely starts with a keyword is not one. */
const MAX_HEADING_LENGTH = 60;

export function matchSectionHeading(line: string): SectionKey | null {
  const cleaned = line
    .replace(/[:•\-–—_]+$/g, '')
    .replace(/^[:•\-–—_\s]+/g, '')
    .trim();

  if (cleaned.length === 0 || cleaned.length > MAX_HEADING_LENGTH) return null;

  for (const { key, patterns } of SECTION_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(cleaned))) {
      return key;
    }
  }

  return null;
}

/**
 * Splits normalized resume text into a header block plus recognised sections.
 *
 * Deliberately conservative: anything under an unrecognised heading stays with the
 * section currently open rather than being dropped, so no content is lost just
 * because a heading was worded unusually.
 */
export function detectSections(text: string): DetectedSections {
  const lines = text.split('\n');

  const header: string[] = [];
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const order: SectionKey[] = [];

  let current: SectionKey | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.length > 0 ? matchSectionHeading(trimmed) : null;

    if (heading) {
      current = heading;
      if (!sections[heading]) {
        sections[heading] = [];
        order.push(heading);
      }
      continue;
    }

    if (trimmed.length === 0) {
      // Preserve blank lines inside sections: they separate entries.
      if (current && sections[current]!.length > 0) sections[current]!.push('');
      continue;
    }

    if (current) {
      sections[current]!.push(trimmed);
    } else {
      header.push(trimmed);
    }
  }

  for (const key of Object.keys(sections) as SectionKey[]) {
    while (sections[key]!.length > 0 && sections[key]!.at(-1) === '') {
      sections[key]!.pop();
    }
  }

  return { header, sections, order };
}
