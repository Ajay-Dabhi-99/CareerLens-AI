import type { ResumeBullet } from '@/features/editor/api/editorApi';

/** Ids are generated client-side; the server treats them as opaque strings. */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Maps edited text back onto the bullets it came from.
 *
 * Bullets carry provenance — `source` and `verified` — that plain strings
 * cannot. Editing goes through strings for the rich-text bridge, so this maps
 * back.
 *
 * Matching by text before position, and consuming each match, is what keeps a
 * bullet's provenance attached to the right line. Position alone was wrong:
 * deleting the first bullet shifted every one below it, so each stopped
 * matching, was rebuilt as the user's own words, and an AI-written line
 * silently lost its "check this" badge. A safety flag that disappears when you
 * edit around it is worse than not having one.
 */
export function mergeBullets(existing: ResumeBullet[], texts: string[]): ResumeBullet[] {
  const unclaimed = new Map<string, ResumeBullet[]>();
  for (const bullet of existing) {
    const bucket = unclaimed.get(bullet.text);
    if (bucket) bucket.push(bullet);
    else unclaimed.set(bullet.text, [bullet]);
  }

  const claim = (text: string): ResumeBullet | undefined => unclaimed.get(text)?.shift();

  // Unchanged bullets keep their identity and flags wherever they moved to.
  const matched = texts.map((text) => claim(text));
  const spare = [...unclaimed.values()].flat();

  return texts.map((text, index) => {
    const kept = matched[index];
    if (kept) return kept;

    /*
     * Genuinely new or edited text. Reusing an id left over from a bullet that
     * no longer exists keeps React keys stable while a line is being retyped,
     * but the content is the user's now, so the flags reset.
     */
    const recycled = spare.shift();
    return { id: recycled?.id ?? newId('b'), text, verified: true, source: 'user' };
  });
}

/**
 * Replaces one bullet with AI-written text, recording where it came from.
 *
 * `source: 'ai'` and `verified: false` are what those fields exist for. A line
 * the model wrote is not yet a claim the candidate has stood behind, and losing
 * that distinction is how someone ends up defending an invented achievement in
 * an interview.
 */
export function replaceBulletWithAi(
  bullets: ResumeBullet[],
  index: number,
  text: string,
): ResumeBullet[] {
  return bullets.map((bullet, i) =>
    i === index ? { ...bullet, text, source: 'ai' as const, verified: false } : bullet,
  );
}
