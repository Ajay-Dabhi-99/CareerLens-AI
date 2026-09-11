import { describe, expect, it } from 'vitest';
import { resumeSchema, resumeSuggestionSchema } from '../resume.js';

const validResume = {
  id: 'r1',
  userId: 'u1',
  personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
  summary: 'Experienced software engineer.',
  skills: [{ id: 's1', category: 'Languages', skills: ['TypeScript', 'Python'] }],
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  metadata: {},
};

describe('resumeSchema', () => {
  it('accepts a well-formed resume', () => {
    expect(resumeSchema.safeParse(validResume).success).toBe(true);
  });

  it('rejects a resume missing a required field', () => {
    const { personal: _personal, ...rest } = validResume;
    expect(resumeSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const invalid = { ...validResume, personal: { ...validResume.personal, email: 'not-an-email' } };
    expect(resumeSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('resumeSuggestionSchema', () => {
  it('requires confidence between 0 and 1', () => {
    const suggestion = {
      id: 'sg1',
      section: 'summary',
      priority: 'high',
      issue: 'Summary is generic.',
      whyItMatters: 'Recruiters skim the summary first.',
      requiresVerification: false,
      confidence: 1.5,
    };
    expect(resumeSuggestionSchema.safeParse(suggestion).success).toBe(false);
  });
});
