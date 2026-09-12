/**
 * Word-level diff between the current text and a suggestion.
 *
 * Written here rather than pulled from a library: the need is one small,
 * well-understood algorithm on short strings, and a dependency would be more
 * code to audit than the thirty lines below.
 *
 * Words, not characters. A character diff of a rewritten sentence produces
 * confetti — fragments highlighted inside words — which is harder to read than
 * no diff at all. Whole words are the unit a person actually compares.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffPart {
  kind: DiffKind;
  text: string;
}

/** Splits into words while keeping the whitespace that follows each one. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Longest common subsequence over tokens.
 *
 * The table is O(n*m), which is irrelevant at the length of a resume bullet and
 * would matter for a whole document — hence the guard in `diffWords`.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  return table;
}

/** Beyond this, a diff stops being readable and the pair is shown whole. */
const MAX_TOKENS = 400;

export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) {
    return before ? [{ kind: 'same', text: before }] : [];
  }

  const a = tokenize(before);
  const b = tokenize(after);

  // Falling back to "all removed, all added" is honest: it says the texts
  // differ without pretending to a word-by-word comparison nobody could read.
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ];
  }

  const table = lcsTable(a, b);
  const parts: DiffPart[] = [];

  /** Appends to the previous part when the kind matches, so runs stay merged. */
  function push(kind: DiffKind, text: string) {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  }

  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      push('removed', a[i]!);
      i += 1;
    } else {
      push('added', b[j]!);
      j += 1;
    }
  }

  while (i < a.length) {
    push('removed', a[i]!);
    i += 1;
  }
  while (j < b.length) {
    push('added', b[j]!);
    j += 1;
  }

  return parts;
}

/** The parts that make up one side of a side-by-side view. */
export function beforeParts(parts: DiffPart[]): DiffPart[] {
  return parts.filter((part) => part.kind !== 'added');
}

export function afterParts(parts: DiffPart[]): DiffPart[] {
  return parts.filter((part) => part.kind !== 'removed');
}

/** True when the suggestion only reshuffles whitespace. */
export function isWhitespaceOnlyChange(before: string, after: string): boolean {
  return before !== after && before.replace(/\s+/g, ' ').trim() === after.replace(/\s+/g, ' ').trim();
}
