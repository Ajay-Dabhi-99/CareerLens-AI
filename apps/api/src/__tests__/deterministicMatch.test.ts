import { describe, expect, it } from 'vitest';
import type { JobRequirement, Resume, SkillMatch } from '@career-lens-ai/types';
import {
  deterministicMatch,
  evidenceLines,
  matchScore,
  significantTerms,
} from '../services/matcher/deterministicMatch.js';

function resume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe' },
    summary: 'Backend engineer working on payment systems.',
    skills: [
      { id: 's1', category: 'Languages', skills: ['Go', 'Python'] },
      { id: 's2', category: 'Infrastructure', skills: ['Kubernetes', 'Terraform'] },
    ],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        current: true,
        bullets: [
          { id: 'b1', text: 'Led the ledger migration to Go', verified: true, source: 'user' },
          { id: 'b2', text: 'Cut p99 latency from 800ms to 120ms', verified: true, source: 'user' },
        ],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

function requirement(
  id: string,
  text: string,
  required = true,
  category: JobRequirement['category'] = 'skill',
): JobRequirement {
  return { id, text, category, required };
}

describe('significantTerms', () => {
  it('drops filler that would match almost any requirement', () => {
    // "Strong experience with Go" must match on Go, not on "experience".
    expect(significantTerms('Strong experience with Go')).toEqual(['go']);
  });

  it('keeps technology names that punctuation would otherwise split', () => {
    expect(significantTerms('Experience with CI/CD pipelines')).toContain('ci/cd');
    expect(significantTerms('C++ and C# development')).toEqual(
      expect.arrayContaining(['c++', 'c#']),
    );
  });

  it('keeps multi-word terms whole', () => {
    expect(significantTerms('Machine learning background')).toContain('machine learning');
  });

  it('ignores bare numbers, which say nothing on their own', () => {
    expect(significantTerms('5 years of Python')).toEqual(['python']);
  });
});

describe('deterministicMatch', () => {
  it('matches a named technology and quotes where it found it', () => {
    const { matches } = deterministicMatch([requirement('r1', 'Strong Go experience')], resume());

    expect(matches[0]!.state).toBe('matched');
    // A match with nothing to point at is an assertion, not a match.
    expect(matches[0]!.evidence).toBeTruthy();
    expect(matches[0]!.evidence!.toLowerCase()).toContain('go');
  });

  it('matches against the skills section as well as the bullets', () => {
    const { matches } = deterministicMatch([requirement('r1', 'Terraform')], resume());

    expect(matches[0]!.state).toBe('matched');
    expect(matches[0]!.evidence).toContain('Terraform');
  });

  it('does not match a substring of an unrelated word', () => {
    // "Go" must not be found inside "Google" or "going".
    const noGo = resume({
      skills: [{ id: 's1', category: 'Tools', skills: ['Google Cloud'] }],
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: [{ id: 'b1', text: 'Going to standups', verified: true, source: 'user' }],
        },
      ],
      summary: '',
    });

    const { matches, unresolved } = deterministicMatch([requirement('r1', 'Go')], noGo);

    expect(matches).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });

  it('leaves a requirement it cannot find unresolved rather than calling it missing', () => {
    const { matches, unresolved } = deterministicMatch(
      [requirement('r1', 'Rust systems programming')],
      resume(),
    );

    // "Missing" is a claim about someone's career, and a keyword search is not
    // entitled to make it — the AI layer looks before anyone says that.
    expect(matches).toHaveLength(0);
    expect(unresolved.map((r) => r.id)).toEqual(['r1']);
  });

  it('does not call a generic word a match', () => {
    // "Rust systems programming" against a resume saying "payment systems".
    // Reporting that as partial Rust experience is how someone walks into an
    // interview for a language they have never written.
    const { matches, unresolved } = deterministicMatch(
      [requirement('r1', 'Rust systems programming')],
      resume(),
    );

    expect(matches).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });

  it('still counts generic words towards a match the distinctive term anchors', () => {
    const { matches } = deterministicMatch(
      [requirement('r1', 'Go backend engineer')],
      resume(),
    );

    // "backend" and "engineer" are weak alone; behind "Go" they confirm it.
    expect(matches[0]!.state).toBe('matched');
  });

  it('reports a half-met requirement as partial', () => {
    const { matches } = deterministicMatch(
      [requirement('r1', 'Kubernetes and Kafka streaming')],
      resume(),
    );

    expect(matches[0]!.state).toBe('partial');
    expect(matches[0]!.evidence).toContain('Kubernetes');
  });

  it('never invents evidence', () => {
    const subject = resume();
    const { matches } = deterministicMatch(
      [requirement('r1', 'Go'), requirement('r2', 'Kubernetes')],
      subject,
    );

    /*
     * Every quote has to be a line the extractor actually read out of this
     * resume. A skills line is composed ("Languages: Go, Python") rather than
     * copied, so a verbatim substring check would be the wrong invariant — but
     * the set of quotable lines is still closed, and nothing outside it may
     * ever be presented as proof.
     */
    const quotable = new Set(evidenceLines(subject).map((line) => line.text));

    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(quotable.has(match.evidence!)).toBe(true);
    }
  });

  it('resolves nothing from an empty resume', () => {
    const empty = resume({ summary: '', skills: [], experience: [] });
    const { matches, unresolved } = deterministicMatch([requirement('r1', 'Go')], empty);

    expect(matches).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });
});

describe('matchScore', () => {
  const required = [requirement('r1', 'Go'), requirement('r2', 'Kubernetes')];

  function match(id: string, state: SkillMatch['state']): SkillMatch {
    return { id, requirementId: id, state, confidence: 0.9 };
  }

  it('is 100 only when everything is matched', () => {
    expect(matchScore(required, [match('r1', 'matched'), match('r2', 'matched')])).toBe(100);
  });

  it('is 0 when nothing is', () => {
    expect(matchScore(required, [])).toBe(0);
  });

  it('weighs a stated requirement above a nice-to-have', () => {
    const mixed = [requirement('r1', 'Go', true), requirement('r2', 'Kubernetes', false)];

    const essentialMet = matchScore(mixed, [match('r1', 'matched')]);
    const optionalMet = matchScore(mixed, [match('r2', 'matched')]);

    expect(essentialMet).toBeGreaterThan(optionalMet);
  });

  it('gives an unconfirmed match a little credit, not none and not full', () => {
    const one = [requirement('r1', 'Go')];

    const unconfirmed = matchScore(one, [match('r1', 'needsVerification')]);

    // Scoring our own uncertainty as zero would penalise the candidate for our
    // limits; scoring it as a match would claim something we cannot support.
    expect(unconfirmed).toBeGreaterThan(0);
    expect(unconfirmed).toBeLessThan(matchScore(one, [match('r1', 'partial')]));
  });

  it('treats a requirement with no verdict as missing rather than skipping it', () => {
    // Dropping unjudged requirements from the denominator would let a resume
    // matching one of twenty requirements score 100.
    expect(matchScore(required, [match('r1', 'matched')])).toBe(50);
  });

  it('does not divide by zero when a posting had no requirements', () => {
    expect(matchScore([], [])).toBe(0);
  });
});
