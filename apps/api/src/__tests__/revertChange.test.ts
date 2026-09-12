import { describe, expect, it } from 'vitest';
import type { Resume } from '@career-lens-ai/types';
import { revertChange } from '../modules/editor/revertChange.js';

function resume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe' },
    summary: 'Owned the billing service end to end.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go', 'Python'] }],
    experience: [
      {
        id: 'e1',
        company: 'Acme',
        title: 'Engineer',
        current: true,
        bullets: [
          { id: 'b1', text: 'Led the migration', verified: true, source: 'user' },
          { id: 'b2', text: 'Owned billing end to end', verified: false, source: 'ai' },
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

describe('revertChange', () => {
  it('puts a summary back', () => {
    const result = revertChange(
      resume(),
      'summary',
      'Owned the billing service end to end.',
      'Responsible for billing.',
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resume.summary).toBe('Responsible for billing.');
  });

  it('puts a single bullet back and leaves the others alone', () => {
    const result = revertChange(
      resume(),
      'bullet',
      'Owned billing end to end',
      'Responsible for billing',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bullets = result.resume.experience[0]!.bullets;
    expect(bullets[1]!.text).toBe('Responsible for billing');
    expect(bullets[0]!.text).toBe('Led the migration');
  });

  it('clears the AI flag, because the line is the user\'s words again', () => {
    const result = revertChange(
      resume(),
      'bullet',
      'Owned billing end to end',
      'Responsible for billing',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const restored = result.resume.experience[0]!.bullets[1]!;
    expect(restored.source).toBe('user');
    expect(restored.verified).toBe(true);
  });

  it('refuses when the user has rewritten that line since', () => {
    const edited = resume({
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: [
            { id: 'b1', text: 'My own much better wording', verified: true, source: 'user' },
          ],
        },
      ],
    });

    // Putting the old text back here would discard the user's later work, which
    // is not what "undo the AI" means.
    const result = revertChange(edited, 'bullet', 'Owned billing end to end', 'Old text');
    expect(result.ok).toBe(false);
  });

  it('refuses a summary revert when the summary has moved on', () => {
    const result = revertChange(resume(), 'summary', 'Some text that is not there', 'Older');
    expect(result.ok).toBe(false);
  });

  it('changes nothing at all when it refuses', () => {
    const before = resume();
    const snapshot = JSON.stringify(before);

    revertChange(before, 'bullet', 'not present', 'older');

    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('puts a skills grouping back', () => {
    const result = revertChange(
      resume(),
      'skills',
      'Languages: Go, Python',
      'Languages: Go\nTools: Docker',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.resume.skills).toHaveLength(2);
    expect(result.resume.skills[1]!.category).toBe('Tools');
  });

  it('reverts only the first matching bullet, not every copy of it', () => {
    const duplicated = resume({
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: [
            { id: 'b1', text: 'Same line', verified: false, source: 'ai' },
            { id: 'b2', text: 'Same line', verified: false, source: 'ai' },
          ],
        },
      ],
    });

    const result = revertChange(duplicated, 'bullet', 'Same line', 'Original');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One accepted change is one line put back.
    const texts = result.resume.experience[0]!.bullets.map((b) => b.text);
    expect(texts).toEqual(['Original', 'Same line']);
  });
});
