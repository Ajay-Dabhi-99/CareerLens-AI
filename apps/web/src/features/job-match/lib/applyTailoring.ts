import type { ResumeData } from '@/features/editor/api/editorApi';
import type { TailorSuggestion } from '@/features/job-match/components/TailorPanel';

/**
 * Applies the suggestions the user accepted, and nothing else.
 *
 * Each one replaces an exact piece of text. A suggestion whose original text is
 * no longer in the resume is skipped rather than guessed at — the user may have
 * edited that line since the suggestions were generated, and replacing the
 * wrong thing on a resume is worse than leaving a suggestion unapplied.
 *
 * Text the AI wrote is marked on the bullets it replaces, the same as in the
 * editor, so a tailored version does not launder AI wording into something that
 * looks reviewed.
 */
export function applyTailoring(
  resume: ResumeData,
  accepted: TailorSuggestion[],
): { data: ResumeData; applied: number; skipped: number } {
  let data: ResumeData = structuredClone(resume);
  let applied = 0;
  let skipped = 0;

  for (const suggestion of accepted) {
    const from = suggestion.originalText?.trim();
    const to = suggestion.suggestedText?.trim();
    if (!from || !to) {
      skipped += 1;
      continue;
    }

    const result = replaceText(data, from, to);
    if (result) {
      data = result;
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  return { data, applied, skipped };
}

/** Replaces the first exact occurrence, or returns null if there is none. */
function replaceText(resume: ResumeData, from: string, to: string): ResumeData | null {
  if (resume.summary.trim() === from) {
    return { ...resume, summary: to };
  }

  let done = false;

  const experience = resume.experience.map((role) => {
    if (done) return role;

    const index = role.bullets.findIndex((bullet) => bullet.text.trim() === from);
    if (index === -1) return role;

    done = true;
    return {
      ...role,
      bullets: role.bullets.map((bullet, i) =>
        i === index
          ? { ...bullet, text: to, source: 'ai' as const, verified: false }
          : bullet,
      ),
    };
  });

  if (done) return { ...resume, experience };

  const projects = resume.projects.map((project) => {
    if (done) return project;

    if (project.description?.trim() === from) {
      done = true;
      return { ...project, description: to };
    }

    const index = project.bullets.findIndex((bullet) => bullet.text.trim() === from);
    if (index === -1) return project;

    done = true;
    return {
      ...project,
      bullets: project.bullets.map((bullet, i) =>
        i === index
          ? { ...bullet, text: to, source: 'ai' as const, verified: false }
          : bullet,
      ),
    };
  });

  return done ? { ...resume, projects } : null;
}
