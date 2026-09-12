import { describe, expect, it } from 'vitest';
import { mergeBullets, replaceBulletWithAi } from './bullets';
import type { ResumeBullet } from '@/features/editor/api/editorApi';

function bullet(id: string, text: string, overrides: Partial<ResumeBullet> = {}): ResumeBullet {
  return { id, text, verified: true, source: 'user', ...overrides };
}

describe('mergeBullets', () => {
  it('keeps untouched bullets exactly as they were', () => {
    const existing = [bullet('b1', 'First'), bullet('b2', 'Second')];
    const merged = mergeBullets(existing, ['First', 'Second']);

    expect(merged[0]).toBe(existing[0]);
    expect(merged[1]).toBe(existing[1]);
  });

  it('keeps an AI bullet flagged after an earlier bullet is deleted', () => {
    // The bug this exists to prevent: positional matching shifted every bullet
    // below the deleted one, so the AI line was rebuilt as the user's own words
    // and quietly lost its "check this" badge.
    const existing = [
      bullet('b1', 'Written by me'),
      bullet('b2', 'Written by the AI', { source: 'ai', verified: false }),
    ];

    const merged = mergeBullets(existing, ['Written by the AI']);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe('ai');
    expect(merged[0]!.verified).toBe(false);
    expect(merged[0]!.id).toBe('b2');
  });

  it('keeps provenance when bullets are reordered', () => {
    const existing = [
      bullet('b1', 'Plain'),
      bullet('b2', 'Generated', { source: 'ai', verified: false }),
    ];

    const merged = mergeBullets(existing, ['Generated', 'Plain']);

    expect(merged[0]!.id).toBe('b2');
    expect(merged[0]!.source).toBe('ai');
    expect(merged[1]!.id).toBe('b1');
  });

  it('treats edited text as the user writing, so the AI flag clears', () => {
    const existing = [bullet('b1', 'Generated line', { source: 'ai', verified: false })];

    const merged = mergeBullets(existing, ['Generated line, now with my own edit']);

    // Once someone has rewritten it, it is their sentence and their claim.
    expect(merged[0]!.source).toBe('user');
    expect(merged[0]!.verified).toBe(true);
  });

  it('gives new bullets an id of their own', () => {
    const existing = [bullet('b1', 'First')];
    const merged = mergeBullets(existing, ['First', 'Brand new']);

    expect(merged[1]!.id).not.toBe('b1');
    expect(merged[1]!.text).toBe('Brand new');
  });

  it('never assigns the same id to two bullets', () => {
    const existing = [bullet('b1', 'One'), bullet('b2', 'Two'), bullet('b3', 'Three')];
    const merged = mergeBullets(existing, ['Two', 'Edited', 'Another edit']);

    expect(new Set(merged.map((b) => b.id)).size).toBe(3);
  });

  it('handles duplicate text without giving both the same identity', () => {
    const existing = [bullet('b1', 'Same'), bullet('b2', 'Same')];
    const merged = mergeBullets(existing, ['Same', 'Same']);

    expect(merged.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('returns nothing when every bullet is removed', () => {
    expect(mergeBullets([bullet('b1', 'Gone')], [])).toEqual([]);
  });
});

describe('replaceBulletWithAi', () => {
  it('marks the accepted line as AI-written and unverified', () => {
    const bullets = [bullet('b1', 'Responsible for billing')];
    const next = replaceBulletWithAi(bullets, 0, 'Owned billing end to end');

    expect(next[0]!.text).toBe('Owned billing end to end');
    expect(next[0]!.source).toBe('ai');
    expect(next[0]!.verified).toBe(false);
    // Identity is kept so the row does not jump as it updates.
    expect(next[0]!.id).toBe('b1');
  });

  it('leaves every other bullet alone', () => {
    const bullets = [bullet('b1', 'One'), bullet('b2', 'Two')];
    const next = replaceBulletWithAi(bullets, 1, 'Rewritten');

    expect(next[0]).toBe(bullets[0]);
  });
});
