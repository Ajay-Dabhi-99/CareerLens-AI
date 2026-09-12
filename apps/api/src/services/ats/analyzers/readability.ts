import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allBullets, clampScore, finding, wordCount } from '../analyzerKit.js';

const FIRST_PERSON = /\b(i|me|my|mine|myself)\b/i;

const LONG_SUMMARY_WORDS = 120;
const SHORT_SUMMARY_WORDS = 10;

/**
 * How well a single bullet reads, by length.
 *
 * Under five words cannot carry an achievement ("Helped with the website");
 * eight to thirty is the band that states what was done and what changed;
 * beyond forty it stops being skimmable.
 */
function bulletReadability(words: number): number {
  if (words < 5) return 0;
  if (words < 8) return 40;
  if (words <= 30) return 100;
  if (words <= 40) return 60;
  return 30;
}

function summaryReadability(words: number): number {
  if (words === 0) return 0;
  if (words < SHORT_SUMMARY_WORDS) return 50;
  if (words <= LONG_SUMMARY_WORDS) return 100;
  return 60;
}

/**
 * Readability: whether the writing is substantial enough to be read.
 *
 * Scores the quality of what is there rather than deducting for defects. A
 * resume of four-word bullets has no detectable "problem" to deduct for, yet
 * communicates nothing, and previously scored full marks.
 */
export function analyzeReadability(resume: Resume): AtsCategoryResult {
  const findings = [];
  const bullets = allBullets(resume);
  const summaryWords = wordCount(resume.summary);

  if (bullets.length === 0 && summaryWords === 0) {
    return {
      category: 'readability',
      weight: ATS_CATEGORY_WEIGHTS.readability,
      score: 0,
      notAssessed: true,
      findings: [
        finding(
          'readability.no-prose',
          'warning',
          'There was no written content to assess, so readability could not be scored.',
        ),
      ],
    };
  }

  const lengths = bullets.map((bullet) => wordCount(bullet.text));
  const bulletScore =
    lengths.length > 0
      ? lengths.reduce((total, words) => total + bulletReadability(words), 0) / lengths.length
      : 0;

  // With no bullets at all, the summary carries the category.
  const score =
    lengths.length > 0
      ? bulletScore * 0.6 + summaryReadability(summaryWords) * 0.4
      : summaryReadability(summaryWords);

  if (lengths.length > 0) {
    const average = Math.round(lengths.reduce((sum, words) => sum + words, 0) / lengths.length);
    const tooShort = lengths.filter((words) => words < 5).length;
    const tooLong = lengths.filter((words) => words > 40).length;

    if (tooShort > 0) {
      findings.push(
        finding(
          'readability.short-bullets',
          'warning',
          `${tooShort} bullet${tooShort === 1 ? ' is' : 's are'} under five words — too short to say what you did or what changed.`,
        ),
      );
    }

    if (tooLong > 0) {
      findings.push(
        finding(
          'readability.long-bullets',
          'warning',
          `${tooLong} bullet${tooLong === 1 ? ' runs' : 's run'} past 40 words and will be skimmed past.`,
        ),
      );
    }

    if (tooShort === 0 && tooLong === 0) {
      findings.push(
        finding(
          'readability.good-bullet-length',
          'good',
          `Bullets average ${average} words, which scans well.`,
        ),
      );
    }
  }

  if (summaryWords === 0) {
    findings.push(
      finding(
        'readability.no-summary',
        'warning',
        'There is no summary. Two or three lines at the top frame everything below them.',
      ),
    );
  } else if (summaryWords > LONG_SUMMARY_WORDS) {
    findings.push(
      finding(
        'readability.long-summary',
        'warning',
        `The summary is ${summaryWords} words. Three or four tight sentences land better.`,
      ),
    );
  } else {
    findings.push(
      finding(
        'readability.concise-summary',
        'good',
        `The summary is a readable ${summaryWords} words.`,
      ),
    );
  }

  const usesFirstPerson =
    bullets.some((bullet) => FIRST_PERSON.test(bullet.text)) || FIRST_PERSON.test(resume.summary);

  if (usesFirstPerson) {
    findings.push(
      finding(
        'readability.first-person',
        'warning',
        'First-person pronouns are used. Resume convention is implied first person: "Led the migration", not "I led the migration".',
      ),
    );
  }

  return {
    category: 'readability',
    weight: ATS_CATEGORY_WEIGHTS.readability,
    score: clampScore(usesFirstPerson ? score - 15 : score),
    findings,
  };
}
