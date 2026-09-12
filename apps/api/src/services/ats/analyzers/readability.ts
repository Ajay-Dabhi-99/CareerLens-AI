import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allBullets, clampScore, finding, wordCount } from '../analyzerKit.js';

const LONG_BULLET_WORDS = 32;
const SHORT_BULLET_WORDS = 4;
const LONG_SUMMARY_WORDS = 120;

const FIRST_PERSON = /\b(i|me|my|mine|myself)\b/i;

/**
 * Readability: bullet length, summary length, and person.
 *
 * Resume convention is implied first person ("Led the migration"), not explicit
 * ("I led the migration"), so explicit first-person pronouns are flagged.
 */
export function analyzeReadability(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const bullets = allBullets(resume);

  if (bullets.length === 0 && resume.summary.trim() === '') {
    return {
      category: 'readability',
      weight: ATS_CATEGORY_WEIGHTS.readability,
      score: 0,
      findings: [
        finding('readability.no-prose', 'critical', 'There is no written content to assess.'),
      ],
    };
  }

  if (bullets.length > 0) {
    const lengths = bullets.map((bullet) => wordCount(bullet.text));
    const longBullets = lengths.filter((length) => length > LONG_BULLET_WORDS).length;
    const shortBullets = lengths.filter((length) => length < SHORT_BULLET_WORDS).length;
    const average = Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length);

    if (longBullets > 0) {
      score -= Math.min(25, longBullets * 8);
      findings.push(
        finding(
          'readability.long-bullets',
          'warning',
          `${longBullets} bullet${longBullets === 1 ? ' runs' : 's run'} past ${LONG_BULLET_WORDS} words. Long bullets get skimmed past.`,
        ),
      );
    }

    if (shortBullets > 0) {
      score -= Math.min(15, shortBullets * 5);
      findings.push(
        finding(
          'readability.short-bullets',
          'warning',
          `${shortBullets} bullet${shortBullets === 1 ? ' is' : 's are'} too short to say anything meaningful.`,
        ),
      );
    }

    if (longBullets === 0 && shortBullets === 0) {
      findings.push(
        finding(
          'readability.good-bullet-length',
          'good',
          `Bullets average ${average} words, which scans well.`,
        ),
      );
    }
  }

  const firstPersonBullets = bullets.filter((bullet) => FIRST_PERSON.test(bullet.text)).length;
  const firstPersonSummary = FIRST_PERSON.test(resume.summary);

  if (firstPersonBullets > 0 || firstPersonSummary) {
    score -= 15;
    findings.push(
      finding(
        'readability.first-person',
        'warning',
        'First-person pronouns are used. Resume convention is implied first person: "Led the migration", not "I led the migration".',
      ),
    );
  }

  const summaryWords = wordCount(resume.summary);
  if (summaryWords > LONG_SUMMARY_WORDS) {
    score -= 15;
    findings.push(
      finding(
        'readability.long-summary',
        'warning',
        `The summary is ${summaryWords} words. Three or four tight sentences land better.`,
      ),
    );
  } else if (summaryWords > 0) {
    findings.push(
      finding('readability.concise-summary', 'good', `The summary is a readable ${summaryWords} words.`),
    );
  }

  return {
    category: 'readability',
    weight: ATS_CATEGORY_WEIGHTS.readability,
    score: clampScore(score),
    findings,
  };
}
