import { describe, expect, it } from 'vitest';
import { afterParts, beforeParts, diffWords, isWhitespaceOnlyChange } from './diff';

/** Reassembling each side must give back exactly what went in. */
function rebuild(parts: ReturnType<typeof diffWords>, side: 'before' | 'after'): string {
  const selected = side === 'before' ? beforeParts(parts) : afterParts(parts);
  return selected.map((part) => part.text).join('');
}

describe('diffWords', () => {
  it('reports nothing changed when nothing changed', () => {
    expect(diffWords('Same text', 'Same text')).toEqual([{ kind: 'same', text: 'Same text' }]);
  });

  it('marks a replaced word without touching the rest', () => {
    const parts = diffWords('Responsible for billing', 'Owned billing');

    expect(parts.some((p) => p.kind === 'removed' && p.text.includes('Responsible'))).toBe(true);
    expect(parts.some((p) => p.kind === 'added' && p.text.includes('Owned'))).toBe(true);
    expect(parts.some((p) => p.kind === 'same' && p.text.includes('billing'))).toBe(true);
  });

  it('reconstructs both sides exactly', () => {
    const before = 'Led the migration of the ledger service to Go';
    const after = 'Led the migration of the payments ledger to Go and Rust';
    const parts = diffWords(before, after);

    // If either side cannot be rebuilt, the diff is lying about one of them.
    expect(rebuild(parts, 'before')).toBe(before);
    expect(rebuild(parts, 'after')).toBe(after);
  });

  it('handles text added at the end', () => {
    const parts = diffWords('Cut costs', 'Cut costs by 35%');

    expect(rebuild(parts, 'before')).toBe('Cut costs');
    expect(rebuild(parts, 'after')).toBe('Cut costs by 35%');
  });

  it('handles text removed from the start', () => {
    const parts = diffWords('Basically I built the thing', 'I built the thing');

    expect(rebuild(parts, 'before')).toBe('Basically I built the thing');
    expect(rebuild(parts, 'after')).toBe('I built the thing');
  });

  it('merges runs so the view is not a mosaic', () => {
    const parts = diffWords('one two three four', 'one nine ten four');

    // "two three" should be one removed run, not two.
    const removed = parts.filter((p) => p.kind === 'removed');
    expect(removed).toHaveLength(1);
  });

  it('copes with an empty starting point', () => {
    const parts = diffWords('', 'Brand new summary');

    expect(rebuild(parts, 'before')).toBe('');
    expect(rebuild(parts, 'after')).toBe('Brand new summary');
  });

  it('copes with everything being deleted', () => {
    const parts = diffWords('All of this goes', '');

    expect(rebuild(parts, 'before')).toBe('All of this goes');
    expect(rebuild(parts, 'after')).toBe('');
  });

  it('says so plainly rather than producing an unreadable diff of huge texts', () => {
    const before = 'word '.repeat(500);
    const after = 'other '.repeat(500);
    const parts = diffWords(before, after);

    expect(parts).toEqual([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
  });

  it('returns nothing for two empty strings', () => {
    expect(diffWords('', '')).toEqual([]);
  });
});

describe('isWhitespaceOnlyChange', () => {
  it('spots a change that is only spacing', () => {
    expect(isWhitespaceOnlyChange('Led  the   team', 'Led the team')).toBe(true);
  });

  it('does not flag a real edit', () => {
    expect(isWhitespaceOnlyChange('Led the team', 'Led the squad')).toBe(false);
  });

  it('does not flag identical text', () => {
    expect(isWhitespaceOnlyChange('Same', 'Same')).toBe(false);
  });
});
