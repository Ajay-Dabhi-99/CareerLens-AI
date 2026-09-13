import type { JobRequirement, MatchState, Resume, SkillMatch } from '@career-lens-ai/types';
import { allBullets, allSkills } from '../ats/analyzerKit.js';

/**
 * The part of matching that does not need a model.
 *
 * A requirement naming a specific technology either appears in the resume or it
 * does not, and that is a lookup rather than a judgement. Deciding it here
 * means the answer is explainable, identical every time, and free — and only
 * what is genuinely ambiguous is passed to the AI layer.
 *
 * Every match carries the line it came from. A claim of "matched" with nothing
 * to point at is not a match, it is an assertion, and the user has no way to
 * check it.
 */

/** A line of the resume, kept whole so it can be quoted back as evidence. */
export interface EvidenceLine {
  text: string;
  /** Lowercased once, because every requirement is tested against every line. */
  normalized: string;
}

export function evidenceLines(resume: Resume): EvidenceLine[] {
  const lines: string[] = [];

  if (resume.summary.trim()) lines.push(resume.summary.trim());

  for (const role of resume.experience) {
    const header = [role.title, role.company].filter(Boolean).join(' at ');
    if (header) lines.push(header);
    for (const bullet of role.bullets) lines.push(bullet.text);
  }

  for (const project of resume.projects) {
    if (project.name) {
      lines.push([project.name, project.description].filter(Boolean).join(': '));
    }
    for (const bullet of project.bullets) lines.push(bullet.text);
    if (project.technologies?.length) {
      lines.push(`${project.name}: ${project.technologies.join(', ')}`);
    }
  }

  for (const group of resume.skills) {
    lines.push(`${group.category}: ${group.skills.join(', ')}`);
  }

  for (const entry of resume.education) {
    lines.push([entry.degree, entry.fieldOfStudy, entry.institution].filter(Boolean).join(', '));
  }

  for (const certification of resume.certifications) {
    lines.push(certification.name);
  }

  return lines
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ text, normalized: text.toLowerCase() }));
}

/**
 * Words that carry no signal about whether a requirement is met.
 *
 * Matching on these produces "matched" for every requirement containing the
 * word "experience", which is most of them.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'have', 'in', 'is', 'of',
  'on', 'or', 'our', 'that', 'the', 'to', 'up', 'we', 'will', 'with', 'you', 'your',
  'experience', 'strong', 'good', 'excellent', 'ability', 'able', 'work', 'working',
  'knowledge', 'understanding', 'skills', 'years', 'year', 'plus', 'using', 'used',
]);

/**
 * Words that describe the shape of work rather than identify it.
 *
 * These are not filler — "systems" and "platform" mean something — but they are
 * true of almost every engineering resume, so a hit on one proves nothing on
 * its own. "Rust systems programming" finding the word "systems" in "payment
 * systems" would otherwise be reported as partial Rust experience, which is
 * exactly the kind of match that wastes an interview.
 *
 * They still count towards a full match, where the distinctive term is present
 * too and these confirm the context.
 */
const GENERIC_TERMS = new Set([
  'systems', 'system', 'programming', 'development', 'developing', 'software',
  'platform', 'platforms', 'services', 'service', 'tools', 'tooling', 'team', 'teams',
  'environment', 'environments', 'background', 'pipelines', 'pipeline', 'applications',
  'application', 'projects', 'project', 'solutions', 'technologies', 'technology',
  'engineering', 'engineer', 'developer', 'stack', 'modern', 'best', 'practices',
]);

/** Kept whole rather than split, because the dot or plus is part of the name. */
const KNOWN_COMPOUNDS = [
  'ci/cd', 'c++', 'c#', 'f#', '.net', 'node.js', 'next.js', 'vue.js', 'objective-c',
  'react native', 'machine learning', 'deep learning', 'data science', 'rest api',
  'unit testing', 'test driven development', 'version control',
];

/** Terms worth matching on, in order of how much they identify the requirement. */
export function significantTerms(requirement: string): string[] {
  const lower = requirement.toLowerCase();
  const terms: string[] = [];

  for (const compound of KNOWN_COMPOUNDS) {
    if (lower.includes(compound)) terms.push(compound);
  }

  const words = lower
    // Keeps the characters that are part of technology names.
    .split(/[^a-z0-9+#./-]+/)
    .map((word) => word.replace(/^[-./]+|[-./]+$/g, ''))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));

  for (const word of words) {
    if (!terms.some((term) => term.includes(word))) terms.push(word);
  }

  return terms;
}

/** Whole-word containment, so "go" does not match "going" or "Google". */
function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Technology names end in punctuation often enough that a trailing \b fails:
  // "c++" and ".net" have no word boundary after the symbol.
  const boundary = /[a-z0-9]$/.test(term) ? '\\b' : '';
  return new RegExp(`\\b${escaped}${boundary}`, 'i').test(haystack);
}

export interface DeterministicResult {
  /** Requirements settled without a model, each with the line proving it. */
  matches: SkillMatch[];
  /** Requirements that need judgement rather than a lookup. */
  unresolved: JobRequirement[];
}

/** Proportion of a requirement's terms that must appear to count as a full match. */
const FULL_MATCH_RATIO = 0.75;

/**
 * Settles what can be settled by looking.
 *
 * Anything short of a clear hit is deliberately left unresolved rather than
 * guessed at: "missing" is a claim about someone's career, and a keyword search
 * is not entitled to make it. The AI layer sees the resume and can tell the
 * difference between a term that is absent and a skill that is described in
 * other words.
 */
export function deterministicMatch(
  requirements: JobRequirement[],
  resume: Resume,
): DeterministicResult {
  const lines = evidenceLines(resume);
  const skills = allSkills(resume).map((skill) => skill.toLowerCase());
  const bullets = allBullets(resume);

  const matches: SkillMatch[] = [];
  const unresolved: JobRequirement[] = [];

  for (const requirement of requirements) {
    const terms = significantTerms(requirement.text);

    if (terms.length === 0) {
      unresolved.push(requirement);
      continue;
    }

    /*
     * Terms are counted across the whole resume, and the single best line is
     * quoted as evidence.
     *
     * Counting per line was stricter and wrong: "Go backend engineer" is met by
     * someone whose title is Backend Engineer and whose skills list Go, and
     * demanding one line contain all three called that a partial match. The
     * quote is the strongest supporting line rather than proof of every term,
     * which is what a person reading a resume would point at too.
     */
    const found = new Set<string>();
    let best: { line: EvidenceLine; hits: number } | null = null;

    for (const line of lines) {
      const hit = terms.filter((term) => containsTerm(line.normalized, term));
      for (const term of hit) found.add(term);

      if (hit.length > 0 && (!best || hit.length > best.hits)) {
        best = { line, hits: hit.length };
      }
    }

    /*
     * A hit made only of generic words is not evidence. Without this, "Rust
     * systems programming" matches a resume that says "payment systems" and
     * reports partial Rust experience to someone who has none.
     */
    const distinctive = [...found].filter((term) => !GENERIC_TERMS.has(term)).length;
    if (distinctive === 0) best = null;

    const ratio = best ? found.size / terms.length : 0;

    if (best && ratio >= FULL_MATCH_RATIO) {
      matches.push({
        id: requirement.id,
        requirementId: requirement.id,
        state: 'matched',
        evidence: best.line.text,
        // Naming the skill outright is stronger evidence than mentioning it in
        // passing, but both are real; neither is certainty.
        confidence: skills.includes(terms[0]!) || bullets.length > 0 ? 0.9 : 0.75,
      });
      continue;
    }

    /*
     * Any hit at all is partial evidence, because the filler has already been
     * stripped: what is left are terms that identify the requirement, so
     * finding one is a real, quotable connection even when the rest is absent.
     *
     * A ratio threshold here was worse. "Kubernetes and Kafka streaming" hits
     * one term of three, and sending that to the AI to be told "partial,
     * Kubernetes" spends a call to reach the answer already in hand.
     */
    if (best) {
      matches.push({
        id: requirement.id,
        requirementId: requirement.id,
        // Proportionate, so one term of four reads as weaker than two of three.
        confidence: Math.max(0.4, Math.round(ratio * 100) / 100),
        state: 'partial',
        evidence: best.line.text,
      });
      continue;
    }

    /*
     * Nothing found by looking, which is not the same as absent — this is
     * precisely the case the AI layer exists for. A requirement phrased as
     * "experience leading teams" finds no term in a resume that says "Led the
     * ledger migration", and only a reader can tell that those are the same
     * thing.
     */
    unresolved.push(requirement);
  }

  return { matches, unresolved };
}

/**
 * How much each state counts towards the score.
 *
 * 'needsVerification' earns a little rather than nothing: it means the evidence
 * is suggestive and we could not confirm it, and scoring our own uncertainty as
 * a zero would penalise the candidate for our limits. It earns much less than a
 * real match, because it is not one.
 */
const STATE_CREDIT: Record<MatchState, number> = {
  matched: 1,
  partial: 0.5,
  needsVerification: 0.25,
  missing: 0,
};

/** A stated requirement counts for more than a nice-to-have. */
const REQUIRED_WEIGHT = 2;
const OPTIONAL_WEIGHT = 1;

/**
 * The match score.
 *
 * Deterministic, like the resume score: the model contributes judgements about
 * individual requirements, never the arithmetic. That keeps the number
 * explainable and means no prompt can move it.
 */
export function matchScore(requirements: JobRequirement[], matches: SkillMatch[]): number {
  if (requirements.length === 0) return 0;

  const byId = new Map(matches.map((match) => [match.requirementId, match]));
  let earned = 0;
  let possible = 0;

  for (const requirement of requirements) {
    const weight = requirement.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT;
    const state = byId.get(requirement.id)?.state ?? 'missing';

    earned += STATE_CREDIT[state] * weight;
    possible += weight;
  }

  return Math.round((earned / possible) * 100);
}
