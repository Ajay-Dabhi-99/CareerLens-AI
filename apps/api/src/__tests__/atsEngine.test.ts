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

  it('caps a resume that games keyword matching', () => {
    // Padding a skills list and repeating one ecosystem were each penalised in
    // their own category, but the rest of the resume could still carry the
    // total to a respectable number.
    const stuffed: Resume = {
      ...strongResume(),
      skills: [
        {
          id: 's1',
          category: 'Frontend',
          skills: [
            'React', 'React Native', 'React Router', 'React Query', 'React Hook Form',
            'Redux', 'Vue', 'Angular', 'Svelte', 'Ember', 'Backbone', 'jQuery',
            'Alpine', 'Lit', 'Preact', 'Solid', 'Qwik', 'Astro', 'Remix', 'Next',
            'Nuxt', 'Gatsby', 'Eleventy', 'Hugo', 'Jekyll', 'Webpack', 'Vite',
            'Rollup', 'Parcel', 'esbuild', 'Turbopack', 'Babel', 'SWC', 'Bun',
            'Deno', 'Node', 'Express', 'Koa', 'Fastify', 'Nest', 'Hapi', 'Sails',
          ],
        },
      ],
    };

    const score = scoreResume(stuffed);
    const ids = score.categories.flatMap((c) => c.findings).map((f) => f.id);

    expect(ids).toContain('skills.too-many');
    expect(ids).toContain('skills.repetitive');
    expect(score.finalScore).toBeLessThanOrEqual(55);
  });

  it('does not cap a legitimately broad resume with one weak signal', () => {
    // A single signal is weak evidence; the cap needs a pattern.
    const broad: Resume = {
      ...strongResume(),
      skills: [
        {
          id: 's1',
          category: 'Tools',
          skills: Array.from({ length: 42 }, (_, i) => `Tool${i}`),
        },
      ],
    };

    const ids = scoreResume(broad)
      .categories.flatMap((c) => c.findings)
      .map((f) => f.id);

    expect(ids).toContain('skills.too-many');
    expect(ids).not.toContain('skills.repetitive');
  });

  it('gives an empty resume a very low score without throwing', () => {
    const score = scoreResume(emptyResume());
    expect(score.finalScore).toBeLessThan(20);
  });

  it('excludes categories it could not assess rather than scoring them zero', () => {
    // A resume whose bullets are drawn as vector glyphs yields no bullets to
    // read. Counting impact and formatting as zero would blame the candidate
    // for a limitation of our parsing.
    const noBullets: Resume = {
      ...strongResume(),
      experience: strongResume().experience.map((role) => ({ ...role, bullets: [] })),
    };

    const score = scoreResume(noBullets);
    const impact = score.categories.find((c) => c.category === 'impactAchievements');
    const formatting = score.categories.find((c) => c.category === 'formatting');

    expect(impact?.notAssessed).toBe(true);
    expect(formatting?.notAssessed).toBe(true);

    // The remaining categories are renormalised, so the total still reads out of
    // 100 rather than being dragged down by the two that could not be judged.
    const assessed = score.categories.filter((c) => !c.notAssessed);
    const weight = assessed.reduce((total, c) => total + c.weight, 0);
    const expected = Math.round(
      assessed.reduce((total, c) => total + c.score * c.weight, 0) / weight,
    );
    expect(score.finalScore).toBe(expected);
    expect(score.finalScore).toBeGreaterThan(60);
  });

  it('still counts a category that had data and scored badly', () => {
    // Not-assessed must not become an escape hatch for genuinely weak sections.
    const weak = scoreResume(weakResume());
    const impact = weak.categories.find((c) => c.category === 'impactAchievements');

    // The weak resume has one bullet, so impact is assessable and scores poorly.
    expect(impact?.notAssessed).toBeUndefined();
    expect(impact?.score).toBeLessThan(40);
  });

  it('scores a long career with no evidence below the same resume written by a junior', () => {
    /*
     * The same words, the same sections, the same everything except the dates.
     * Seniority must raise the bar, never the score — a score that climbed with
     * years would reassure exactly the person whose resume is not landing.
     */
    const dutiesOnly = (startDate: string): Resume => ({
      ...emptyResume(),
      personal: { fullName: 'Alex Doe', email: 'alex@example.com', phone: '+44 7700 900123' },
      skills: [{ id: 's1', category: 'Languages', skills: ['Java', 'Go'] }],
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'BigCorp',
          startDate,
          current: true,
          bullets: [
            bullet('Built and maintained internal services for the platform team'),
            bullet('Delivered features across the reporting and billing areas'),
          ],
        },
      ],
    });

    const junior = scoreResume(dutiesOnly('Jan 2025'));
    const seasoned = scoreResume(dutiesOnly('Jan 2014'));

    expect(seasoned.finalScore).toBeLessThan(junior.finalScore);
  });

  it('does not apply the expectation gap to a short history', () => {
    const junior: Resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Engineer',
          company: 'BigCorp',
          startDate: 'Jan 2025',
          current: true,
          bullets: [bullet('Built and maintained internal services for the platform team')],
        },
      ],
    };

    const ids = scoreResume(junior).categories.flatMap((c) => c.findings.map((f) => f.id));
    expect(ids).not.toContain('impact.experience-without-evidence');
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
    // Title and employer are reported together: a role missing either is
    // equally unreadable to a filter.
    expect(ids).toContain('experience.missing-title');
    expect(ids).toContain('experience.missing-dates');
  });

  it('scores a thinly described history well below a fully described one', () => {
    // The category previously started at 100 and only deducted, so a single
    // role with two throwaway bullets tied with a full senior history.
    const thin = analyzeExperience(weakResume()).score;
    const full = analyzeExperience(strongResume()).score;

    expect(full).toBeGreaterThan(thin + 15);
  });

  it('lets described projects stand in for employment, but not fully', () => {
    const projectsOnly: Resume = {
      ...emptyResume(),
      projects: [
        {
          id: 'p1',
          name: 'StudyBuddy',
          bullets: [
            bullet('Built spaced-repetition scheduling used by 120 classmates'),
            bullet('Deployed on Vercel with a Firestore backend'),
          ],
        },
      ],
    };

    const result = analyzeExperience(projectsOnly);

    expect(result.score).toBeGreaterThan(0);
    // Paid experience remains stronger evidence, so the substitute is capped.
    expect(result.score).toBeLessThanOrEqual(70);
    expect(result.findings.map((f) => f.id)).toContain('experience.projects-only');
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

  it('flags a long career described without a single measurable outcome', () => {
    const seasonedNoMetrics: Resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Principal Engineer',
          company: 'BigCorp',
          startDate: 'Jan 2014',
          current: true,
          bullets: [
            bullet('Responsible for the architecture of the platform team'),
            bullet('Worked on various services and helped with migrations'),
          ],
        },
      ],
    };

    expect(analyzeImpact(seasonedNoMetrics).findings.map((f) => f.id)).toContain(
      'impact.experience-without-evidence',
    );
  });

  it('does not hold a graduate to the same expectation', () => {
    const graduate: Resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Intern',
          company: 'Startup',
          startDate: 'Jun 2025',
          current: true,
          bullets: [bullet('Worked on the internal dashboard with the platform team')],
        },
      ],
    };

    expect(analyzeImpact(graduate).findings.map((f) => f.id)).not.toContain(
      'impact.experience-without-evidence',
    );
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
          bullets: [bullet(Array.from({ length: 48 }, () => 'word').join(' '))],
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

  it('scores bullets too short to say anything well below well-written ones', () => {
    // Four-word bullets trip no defect check, so this category previously
    // awarded full marks to a resume that communicates nothing.
    const terse: Resume = {
      ...emptyResume(),
      experience: [
        {
          id: 'e1',
          title: 'Developer',
          company: 'Acme',
          current: true,
          bullets: [
            bullet('Helped with the website'),
            bullet('Worked on projects'),
            bullet('Did various tasks'),
          ],
        },
      ],
    };

    const terseScore = analyzeReadability(terse).score;

    expect(terseScore).toBeLessThan(40);
    expect(analyzeReadability(strongResume()).score).toBeGreaterThan(terseScore + 40);
    expect(analyzeReadability(terse).findings.map((f) => f.id)).toContain(
      'readability.short-bullets',
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
