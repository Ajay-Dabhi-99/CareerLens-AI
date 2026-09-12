import type { Resume } from '@career-lens-ai/types';
import type { AiChangeTarget } from './aiChangeRepository.js';

export type RevertResult =
  | { ok: true; resume: Resume }
  /** The text is no longer there to put back, so nothing was touched. */
  | { ok: false; reason: 'not-found' };

/**
 * Puts one accepted AI change back, leaving every other edit alone.
 *
 * Matching on the exact text the user accepted is deliberate. If they have
 * since rewritten that line themselves, the text will not be found and the
 * revert is refused rather than guessed at — overwriting someone's later work
 * in the name of undoing an earlier change would be the opposite of what they
 * asked for.
 *
 * Restoring also clears the AI provenance, because after the revert the line is
 * once again exactly what the user wrote.
 */
export function revertChange(
  resume: Resume,
  target: AiChangeTarget,
  afterText: string,
  beforeText: string,
): RevertResult {
  if (target === 'summary') {
    if (resume.summary !== afterText) return { ok: false, reason: 'not-found' };
    return { ok: true, resume: { ...resume, summary: beforeText } };
  }

  if (target === 'skills') {
    const current = resume.skills
      .map((group) => `${group.category}: ${group.skills.join(', ')}`)
      .join('\n');

    if (current !== afterText) return { ok: false, reason: 'not-found' };

    const restored = beforeText
      .split('\n')
      .map((line, index) => {
        const at = line.indexOf(':');
        if (at <= 0) return null;
        const skills = line
          .slice(at + 1)
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean);
        if (skills.length === 0) return null;
        return {
          id: resume.skills[index]?.id ?? `s-${index}`,
          category: line.slice(0, at).trim(),
          skills,
        };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);

    if (restored.length === 0) return { ok: false, reason: 'not-found' };
    return { ok: true, resume: { ...resume, skills: restored } };
  }

  // 'bullet' and 'project' both live in bullet lists; the change was recorded
  // against a single line, so the line is what we look for.
  let replaced = false;

  const restoreIn = <T extends { bullets: Resume['experience'][number]['bullets'] }>(
    entries: T[],
  ): T[] =>
    entries.map((entry) => {
      if (replaced) return entry;

      const index = entry.bullets.findIndex((bullet) => bullet.text === afterText);
      if (index === -1) return entry;

      replaced = true;
      return {
        ...entry,
        bullets: entry.bullets.map((bullet, i) =>
          i === index
            ? { ...bullet, text: beforeText, source: 'user' as const, verified: true }
            : bullet,
        ),
      };
    });

  const experience = restoreIn(resume.experience);
  const projects = replaced ? resume.projects : restoreIn(resume.projects);

  if (!replaced) return { ok: false, reason: 'not-found' };
  return { ok: true, resume: { ...resume, experience, projects } };
}
