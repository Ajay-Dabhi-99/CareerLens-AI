import { describe, expect, it } from 'vitest';
import type { Resume, ResumeBullet } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { scoreResume, weightsAreValid } from '../services/ats/scoreResume.js';
import { analyzeStructure } from '../services/ats/analyzers/structure.js';
import { analyzeSkills } from '../services/ats/analyzers/skills.js';
import { analyzeExperience } from '../services/ats/analyzers/experience.js';
import { analyzeImpact } from '../services/ats/analyzers/impact.js';
import { analyzeReadability } from '../services/ats/analyzers/readability.js';
import { analyzeFormatting } from '../services/ats/analyzers/formatting.js';
import { analyzeCompleteness } from '../services/ats/analyzers/completeness.js';

let bulletCounter = 0;
function bullet(text: string): ResumeBullet {
  bulletCounter += 1;
  return { id: `b${bulletCounter}`, text, verified: true, source: 'user' };
}

function emptyResume(): Resume {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: '' },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
  };
}

function strongResume(): Resume {
  return {
    ...emptyResume(),
    personal: {
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '+44 7700 900123',
      location: 'London, UK',
      linkedin: 'https://linkedin.com/in/janedoe',
    },
    summary:
      'Senior engineer with eight years building payment systems, focused on reliability and cost.',
    skills: [
      { id: 's1', category: 'Languages', skills: ['TypeScript', 'Go', 'Python'] },
      { id: 's2', category: 'Infrastructure', skills: ['Kubernetes', 'Terraform', 'AWS', 'Kafka'] },
      { id: 's3', category: 'Practices', skills: ['Observability', 'CI/CD'] },
    ],
    experience: [
      {
        id: 'e1',
        title: 'Staff Engineer',
        company: 'Monzo',
        location: 'London',
        startDate: 'Jan 2021',
        current: true,
        bullets: [
          bullet('Led migration of the ledger service handling 4M daily transactions to Go'),
          bullet('Reduced p99 latency from 800ms to 120ms across the TypeScript payments path'),
          bullet('Mentored 6 engineers and introduced Terraform-based AWS provisioning'),
        ],
      },
      {
        id: 'e2',
        title: 'Backend Engineer',
        company: 'Revolut',
        location: 'London',
        startDate: 'Jun 2018',
        endDate: 'Dec 2020',
        current: false,
        bullets: [
          bullet('Built a fraud detection pipeline in Python streaming 2TB of Kafka events daily'),
          bullet('Cut infrastructure spend by 35% by rightsizing Kubernetes workloads'),
          bullet('Established Observability dashboards and CI/CD pipelines for 12 services'),
        ],
      },
    ],
    education: [
      { id: 'ed1', institution: 'University of Manchester', degree: 'BSc Computer Science' },
    ],
  };
}

function weakResume(): Resume {
  return {
    ...emptyResume(),
    personal: { fullName: 'Bob Smith' },
    experience: [
      {
        id: 'e1',
        title: '',
        company: '',
        current: false,
        bullets: [bullet('responsible for various tasks')],
      },
    ],
  };
}

describe('scoring model', () => {
  it('has weights that sum to 1', () => {
    expect(weightsAreValid()).toBe(true);
    const total = Object.values(ATS_CATEGORY_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('scores every category', () => {
    const score = scoreResume(strongResume());
    expect(score.categories).toHaveLength(8);
    expect(new Set(score.categories.map((c) => c.category)).size).toBe(8);
  });

  it('is deterministic — the same resume always scores the same', () => {
    const resume = strongResume();
    expect(scoreResume(resume).finalScore).toBe(scoreResume(resume).finalScore);
  });

  it('keeps the final score within 0-100', () => {
    for (const resume of [strongResume(), weakResume(), emptyResume()]) {
      const { finalScore } = scoreResume(resume);
      expect(finalScore).toBeGreaterThanOrEqual(0);
      expect(finalScore).toBeLessThanOrEqual(100);
    }
  });

  it('equals the weighted sum of its categories', () => {
    const score = scoreResume(strongResume());
    const expected = Math.round(
      score.categories.reduce((total, c) => total + c.score * c.weight, 0),
    );
    expect(score.finalScore).toBe(expected);
  });

  it('rates a strong resume well above a weak one', () => {
    expect(scoreResume(strongResume()).finalScore).toBeGreaterThan(
      scoreResume(weakResume()).finalScore + 30,
    );
  });

  it('gives an empty resume a very low score without throwing', () => {
    const score = scoreResume(emptyResume());
    expect(score.finalScore).toBeLessThan(20);
  });
});

describe('structure analyzer', () => {
  it('flags every missing section on an empty resume', () => {
    const ids = analyzeStructure(emptyResume()).findings.map((f) => f.id);
    expect(ids).toContain('structure.no-experience');
    expect(ids).toContain('structure.no-skills');
    expect(ids).toContain('structure.no-summary');
  });

  it('flags roles that could not be read as a layout problem', () => {
    const result = analyzeStructure(weakResume());
    expect(result.findings.map((f) => f.id)).toContain('structure.unreadable-roles');
  });

  it('scores a complete structure highly', () => {
    expect(analyzeStructure(strongResume()).score).toBeGreaterThanOrEqual(90);
  });
});

describe('skills analyzer', () => {
  it('scores zero with no skills', () => {
    const result = analyzeSkills(emptyResume());
    expect(result.score).toBe(0);
    expect(result.findings[0]?.id).toBe('skills.none');
  });

  it('rewards grouped, evidenced skills', () => {
    const ids = analyzeSkills(strongResume()).findings.map((f) => f.id);
    expect(ids).toContain('skills.grouped');
    expect(ids).toContain('skills.well-evidenced');
  });

  it('flags skills that appear nowhere else in the resume', () => {
    const resume = {
      ...emptyResume(),
      skills: [
        { id: 's1', category: 'Tools', skills: ['Fortran', 'COBOL', 'Delphi', 'Haskell', 'Erlang'] },
      ],
    };
    expect(analyzeSkills(resume).findings.map((f) => f.id)).toContain('skills.no-evidence');
  });

  it('flags duplicates across groups', () => {
    const resume = {
      ...emptyResume(),
      skills: [
        { id: 's1', category: 'A', skills: ['React', 'Node'] },
        { id: 's2', category: 'B', skills: ['react', 'Node'] },
      ],
    };
    expect(analyzeSkills(resume).findings.map((f) => f.id)).toContain('skills.duplicates');
  });
});

describe('experience analyzer', () => {
  it('scores zero with no roles', () => {
    expect(analyzeExperience(emptyResume()).score).toBe(0);
  });

  it('flags missing titles, employers and dates', () => {
    const ids = analyzeExperience(weakResume()).findings.map((f) => f.id);
    expect(ids).toContain('experience.missing-title');
    expect(ids).toContain('experience.missing-company');
    expect(ids).toContain('experience.missing-dates');
  });

  it('flags a role with no bullets at all', () => {
    const resume = {
      ...emptyResume(),
      experience: [
        { id: 'e1', title: 'Engineer', company: 'Acme', startDate: '2020', current: true, bullets: [] },
      ],
    };
    expect(analyzeExperience(resume).findings.map((f) => f.id)).toContain('experience.empty-roles');
  });
});

describe('impact analyzer', () => {
  it('rewards quantified achievements', () => {
    const result = analyzeImpact(strongResume());
    expect(result.findings.map((f) => f.id)).toContain('impact.quantified');
    expect(result.score).toBeGreaterThan(50);
  });

  it('flags a complete absence of metrics', () => {
    const resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'Acme',
          current: true,
          bullets: [bullet('Built features for the web application')],
        },
      ],
    };
    expect(analyzeImpact(resume).findings.map((f) => f.id)).toContain('impact.no-metrics');
  });

  it('flags job-description phrasing like "responsible for"', () => {
    expect(analyzeImpact(weakResume()).findings.map((f) => f.id)).toContain('impact.weak-openers');
  });

  it('scores zero when there are no bullets to assess', () => {
    expect(analyzeImpact(emptyResume()).score).toBe(0);
  });

  it.each([
    'Reduced p99 latency from 800ms to 120ms across the payments path',
    'Processed 2TB of events daily through the pipeline',
    'Mentored 6 engineers across two squads',
    'Improved throughput 10x after rewriting the scheduler',
    'Cut spend by 35%',
    'Saved $40k a year in infrastructure costs',
  ])('counts a measurement written as %s', (text) => {
    // Units attached to the number (800ms, 2TB, 10x) broke an earlier pattern
    // that required a word boundary straight after the digits.
    const resume = {
      ...emptyResume(),
      experience: [
        { id: 'e1', title: 'Engineer', company: 'Acme', current: true, bullets: [bullet(text)] },
      ],
    };
    expect(analyzeImpact(resume).findings.map((f) => f.id)).toContain('impact.quantified');
  });

  it('still recognises a bullet with no measurement at all', () => {
    const resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'Acme',
          current: true,
          bullets: [bullet('Worked closely with designers on the checkout flow')],
        },
      ],
    };
    expect(analyzeImpact(resume).findings.map((f) => f.id)).toContain('impact.no-metrics');
  });
});

describe('readability analyzer', () => {
  it('flags first-person pronouns', () => {
    const resume = {
      ...emptyResume(),
      summary: 'I am a senior engineer and I led several teams.',
    };
    expect(analyzeReadability(resume).findings.map((f) => f.id)).toContain(
      'readability.first-person',
    );
  });

  it('flags bullets that run too long', () => {
    const resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'Acme',
          current: true,
          bullets: [bullet(Array.from({ length: 40 }, () => 'word').join(' '))],
        },
      ],
    };
    expect(analyzeReadability(resume).findings.map((f) => f.id)).toContain(
      'readability.long-bullets',
    );
  });

  it('approves well-sized bullets', () => {
    expect(analyzeReadability(strongResume()).findings.map((f) => f.id)).toContain(
      'readability.good-bullet-length',
    );
  });
});

describe('formatting analyzer', () => {
  it('flags inconsistent bullet punctuation', () => {
    const resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'Acme',
          current: true,
          bullets: [bullet('Built the thing.'), bullet('Shipped the other thing')],
        },
      ],
    };
    expect(analyzeFormatting(resume).findings.map((f) => f.id)).toContain(
      'formatting.mixed-punctuation',
    );
  });

  it('accepts consistent punctuation', () => {
    expect(analyzeFormatting(strongResume()).findings.map((f) => f.id)).toContain(
      'formatting.consistent-punctuation',
    );
  });

  it('flags bullets starting lowercase', () => {
    expect(analyzeFormatting(weakResume()).findings.map((f) => f.id)).toContain(
      'formatting.lowercase-start',
    );
  });
});

describe('completeness analyzer', () => {
  it('flags missing contact essentials', () => {
    const ids = analyzeCompleteness(weakResume()).findings.map((f) => f.id);
    expect(ids).toContain('completeness.no-email');
    expect(ids).toContain('completeness.no-phone');
    expect(ids).toContain('completeness.no-location');
  });

  it('flags leftover template placeholder text', () => {
    const resume = { ...emptyResume(), summary: 'Lorem ipsum dolor sit amet' };
    expect(analyzeCompleteness(resume).findings.map((f) => f.id)).toContain(
      'completeness.placeholder-text',
    );
  });

  it('scores a complete header highly', () => {
    expect(analyzeCompleteness(strongResume()).score).toBeGreaterThanOrEqual(90);
  });
});
