import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allBullets, clampScore, finding } from '../analyzerKit.js';

/** Runs of capitals that are not an acronym, e.g. "MANAGED THE TEAM". */
const SHOUTING = /\b[A-Z]{4,}(\s+[A-Z]{2,}){2,}\b/;
const TERMINAL_PUNCTUATION = /[.!?]$/;

/**
 * Formatting consistency: the mechanical tidiness a reviewer notices
 * immediately and a parser sometimes trips over.
 */
export function analyzeFormatting(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const bullets = allBullets(resume);

  if (bullets.length === 0) {
    return {
      category: 'formatting',
      weight: ATS_CATEGORY_WEIGHTS.formatting,
      score: 0,
      findings: [
        finding('formatting.nothing-to-check', 'critical', 'There is no formatted content to assess.'),
      ],
    };
  }

  // Mixed punctuation across bullets is the most common inconsistency.
  const punctuated = bullets.filter((bullet) => TERMINAL_PUNCTUATION.test(bullet.text.trim()));
  const isMixed = punctuated.length > 0 && punctuated.length < bullets.length;

  if (isMixed) {
    score -= 15;
    findings.push(
      finding(
        'formatting.mixed-punctuation',
        'warning',
        'Some bullets end with a full stop and others do not. Pick one and apply it throughout.',
      ),
    );
  } else {
    findings.push(
      finding('formatting.consistent-punctuation', 'good', 'Bullet punctuation is consistent.'),
    );
  }

  const shouting = bullets.filter((bullet) => SHOUTING.test(bullet.text)).length;
  if (shouting > 0) {
    score -= Math.min(20, shouting * 10);
    findings.push(
      finding(
        'formatting.shouting',
        'warning',
        'Some content is in long runs of capitals, which is harder to read and can confuse parsers.',
      ),
    );
  }

  // Trailing or doubled whitespace usually survives a bad copy-paste.
  const whitespaceIssues = bullets.filter((bullet) => /\s{2,}|^\s|\s$/.test(bullet.text)).length;
  if (whitespaceIssues > 0) {
    score -= Math.min(10, whitespaceIssues * 4);
    findings.push(
      finding(
        'formatting.stray-whitespace',
        'warning',
        `${whitespaceIssues} bullet${whitespaceIssues === 1 ? ' has' : 's have'} stray or doubled spacing.`,
      ),
    );
  }

  const startsLowercase = bullets.filter((bullet) => /^[a-z]/.test(bullet.text.trim())).length;
  if (startsLowercase > 0) {
    score -= Math.min(10, startsLowercase * 4);
    findings.push(
      finding(
        'formatting.lowercase-start',
        'warning',
        `${startsLowercase} bullet${startsLowercase === 1 ? ' starts' : 's start'} with a lowercase letter.`,
      ),
    );
  }

  return {
    category: 'formatting',
    weight: ATS_CATEGORY_WEIGHTS.formatting,
    score: clampScore(score),
    findings,
  };
}
