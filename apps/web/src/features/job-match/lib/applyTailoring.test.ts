import { describe, expect, it } from 'vitest';
import { applyTailoring } from './applyTailoring';
import type { ResumeData } from '@/features/editor/api/editorApi';
import type { TailorSuggestion } from '@/features/job-match/components/TailorPanel';

function resume(): ResumeData {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe' },
    summary: 'Backend engineer.',
    skills: [],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        current: true,
        bullets: [
          { id: 'b1', text: 'Led the ledger migration', verified: true, source: 'user' },
          { id: 'b2', text: 'Fixed bugs', verified: true, source: 'user' },
        ],
      },
    ],
    education: [],
    projects: [
      {
        id: 'p1',
        name: 'StudyBuddy',
        description: 'A revision planner',
        bullets: [{ id: 'pb1', text: 'Built the scheduler', verified: true, source: 'user' }],
      },
    ],
    certifications: [],
    metadata: {},
  };
}

function suggestion(overrides: Partial<TailorSuggestion> = {}): TailorSuggestion {
  return {
    id: 'sug-1',
    section: 'summary',
    priority: 'high',
    issue: 'Lead with the payments work',
    whyItMatters: 'The posting is about payments.',
    originalText: 'Backend engineer.',
    suggestedText: 'Backend engineer who led a ledger migration.',
    requiresVerification: false,
    confidence: 0.8,
    ...overrides,
  };
}

describe('applyTailoring', () => {
  it('replaces the summary', () => {
    const { data, applied } = applyTailoring(resume(), [suggestion()]);

    expect(applied).toBe(1);
    expect(data.summary).toBe('Backend engineer who led a ledger migration.');
  });

  it('replaces a bullet and leaves the others alone', () => {
    const { data } = applyTailoring(resume(), [
      suggestion({
        originalText: 'Fixed bugs',
        suggestedText: 'Resolved defects across the payments path',
      }),
    ]);

    const bullets = data.experience[0]!.bullets;
    expect(bullets[1]!.text).toBe('Resolved defects across the payments path');
    expect(bullets[0]!.text).toBe('Led the ledger migration');
  });

  it('marks a rewritten bullet as AI-written and unverified', () => {
    const { data } = applyTailoring(resume(), [
      suggestion({ originalText: 'Fixed bugs', suggestedText: 'Resolved defects' }),
    ]);

    // A tailored version must not launder AI wording into something that looks
    // like the user's own reviewed text.
    expect(data.experience[0]!.bullets[1]!.source).toBe('ai');
    expect(data.experience[0]!.bullets[1]!.verified).toBe(false);
  });

  it('replaces a project description', () => {
    const { data, applied } = applyTailoring(resume(), [
      suggestion({
        section: 'projects',
        originalText: 'A revision planner',
        suggestedText: 'A revision planner used by 120 classmates',
      }),
    ]);

    expect(applied).toBe(1);
    expect(data.projects[0]!.description).toBe('A revision planner used by 120 classmates');
  });

  it('skips a suggestion whose text is no longer in the resume', () => {
    const { data, applied, skipped } = applyTailoring(resume(), [
      suggestion({ originalText: 'Something I already rewrote', suggestedText: 'New text' }),
    ]);

    // Replacing the wrong line on a resume is worse than leaving a suggestion
    // unapplied, so a stale one is skipped rather than guessed at.
    expect(applied).toBe(0);
    expect(skipped).toBe(1);
    expect(data.summary).toBe('Backend engineer.');
  });

  it('skips advice that carries no replacement text', () => {
    const { applied, skipped } = applyTailoring(resume(), [
      suggestion({ originalText: undefined, suggestedText: undefined }),
    ]);

    expect(applied).toBe(0);
    expect(skipped).toBe(1);
  });

  it('never mutates the resume it was given', () => {
    const original = resume();
    const snapshot = JSON.stringify(original);

    applyTailoring(original, [suggestion()]);

    // The working copy must survive tailoring untouched.
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('applies several suggestions in one pass', () => {
    const { data, applied } = applyTailoring(resume(), [
      suggestion(),
      suggestion({
        id: 'sug-2',
        originalText: 'Fixed bugs',
        suggestedText: 'Resolved defects',
      }),
    ]);

    expect(applied).toBe(2);
    expect(data.summary).toContain('ledger migration');
    expect(data.experience[0]!.bullets[1]!.text).toBe('Resolved defects');
  });

  it('changes nothing when nothing was accepted', () => {
    const { data, applied } = applyTailoring(resume(), []);

    expect(applied).toBe(0);
    expect(data).toEqual(resume());
  });
});
