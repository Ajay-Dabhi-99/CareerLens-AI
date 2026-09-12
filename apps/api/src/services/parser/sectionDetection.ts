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

/**
 * Headings are classified by the keywords they contain, not by exact match.
 *
 * Real resumes vary far more than a fixed list allows: "Technical Skills & Tools",
 * "Core Competencies", "Areas of Expertise" and "IT Skills" are all the skills
 * section, and an exact-match list misses every one of them.
 *
 * Order is by specificity. "Skills Summary" contains both "skills" and "summary",
 * and it is a skills list, so skills is tested first.
 */
const SECTION_KEYWORDS: Array<{ key: SectionKey; pattern: RegExp }> = [
  {
    key: 'certifications',
    pattern: /\b(certificat\w*|licen[sc]\w*|accreditation\w*|credential\w*|courses?)\b/i,
  },
  { key: 'projects', pattern: /\b(projects?|portfolio)\b/i },
  { key: 'education', pattern: /\b(education\w*|academic\w*|qualification\w*|schooling)\b/i },
  {
    key: 'experience',
    pattern:
      /\b(experience|employment|work\s+history|career\s+history|professional\s+background|positions?\s+held)\b/i,
  },
  {
    key: 'skills',
    pattern:
      /\b(skills?|competenc\w*|technolog\w*|tech\s+stack|proficienc\w*|expertise|toolkit|tools)\b/i,
  },
  { key: 'summary', pattern: /\b(summary|profile|objective|about\s+me|about|overview)\b/i },
];

/** Headings are short and stand alone; body text that merely mentions a keyword is not one. */
const MAX_HEADING_LENGTH = 60;
const MAX_HEADING_WORDS = 6;

function classify(text: string): SectionKey | null {
  for (const { key, pattern } of SECTION_KEYWORDS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

/**
 * Returns the section a line introduces, or null if it is ordinary content.
 *
 * A heading must be short and few enough words that it cannot be a sentence —
 * "Experience building distributed systems across three teams" mentions a
 * keyword but is body text.
 */
export function matchSectionHeading(line: string): SectionKey | null {
  // A colon with content after it is not a bare heading: it is either a heading
  // sharing its line with content ("SKILLS: Java, Python") or a labelled group
  // inside a section ("Tools: Docker"). Both are handled elsewhere, and matching
  // here would silently discard everything after the colon.
  if (/:\s*\S/.test(line)) return null;

  const cleaned = line
    .replace(/[:•\-–—_]+$/g, '')
    .replace(/^[:•\-–—_\s]+/g, '')
    .trim();

  if (cleaned.length === 0 || cleaned.length > MAX_HEADING_LENGTH) return null;
  // A trailing full stop marks prose, not a heading.
  if (/[.!?]$/.test(cleaned)) return null;
  if (cleaned.split(/\s+/).length > MAX_HEADING_WORDS) return null;

  return classify(cleaned);
}

/**
 * Handles headings that share a line with their content, such as
 * "TECHNICAL SKILLS: Java, Python, SQL". PDF extraction produces this whenever
 * the heading and the first entry sit on the same visual line, and treating the
 * whole thing as body text loses the section entirely.
 */
export function splitInlineHeading(line: string): { key: SectionKey; rest: string } | null {
  const match = /^([^:]{1,40}):\s*(.+)$/.exec(line.trim());
  if (!match) return null;

  const [, label, rest] = match;
  if (!label || !rest) return null;
  if (label.split(/\s+/).length > MAX_HEADING_WORDS) return null;

  const key = classify(label.trim());
  if (!key) return null;

  // "Languages: TypeScript, Go" inside a skills section is a skill group, not a
  // new heading, so only treat this as a heading when the label itself names one.
  return { key, rest: rest.trim() };
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

  /** Ensures the section exists and returns its line list. */
  function openSection(key: SectionKey): string[] {
    if (!sections[key]) {
      sections[key] = [];
      order.push(key);
    }
    return sections[key]!;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.length > 0 ? matchSectionHeading(trimmed) : null;

    if (heading) {
      openSection(heading);
      current = heading;
      continue;
    }

    // A heading sharing its line with content, e.g. "SKILLS: Java, Python".
    // Only considered outside an open section, since inside one a labelled line
    // is a sub-group ("Languages: TypeScript") rather than a new heading.
    if (trimmed.length > 0 && current === null) {
      const inline = splitInlineHeading(trimmed);
      if (inline) {
        openSection(inline.key).push(inline.rest);
        current = inline.key;
        continue;
      }
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
