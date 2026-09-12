import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allSkills, clampScore, finding, resumeCorpus, wordCount } from '../analyzerKit.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'across', 'their', 'them',
  'our', 'was', 'were', 'been', 'have', 'has', 'had', 'are', 'not', 'but', 'all', 'any',
  'its', 'it', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'as', 'is', 'be', 'or',
  'using', 'used', 'via', 'per', 'over', 'more', 'than', 'new', 'also', 'other', 'within',
]);

const REPETITION_THRESHOLD = 0.04;

/**
 * Keyword quality: is domain terminology present, and does it read naturally?
 *
 * Without a job description this cannot judge relevance to a specific role —
 * that is Phase 13's job. What it can judge is whether the resume uses concrete
 * terminology at all, and whether any single term is repeated so often it looks
 * like stuffing.
 */
export function analyzeKeywords(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const corpus = resumeCorpus(resume);
  const total = wordCount(corpus);

  if (total < 40) {
    return {
      category: 'keywordQuality',
      weight: ATS_CATEGORY_WEIGHTS.keywordQuality,
      score: total === 0 ? 0 : 25,
      findings: [
        finding(
          'keywords.too-little-text',
          'critical',
          'There is too little text to assess terminology. Most resumes need considerably more detail.',
        ),
      ],
    };
  }

  const skills = allSkills(resume);
  if (skills.length >= 8) {
    findings.push(
      finding('keywords.varied-terms', 'good', 'A varied set of concrete terms is present.'),
    );
  } else if (skills.length > 0) {
    score -= 20;
    findings.push(
      finding(
        'keywords.limited-terms',
        'warning',
        'Relatively few concrete tools or technologies are named.',
      ),
    );
  } else {
    score -= 35;
    findings.push(
      finding(
        'keywords.no-terms',
        'critical',
        'No specific tools or technologies were found to match against a job.',
      ),
    );
  }

  // Stuffing check: any single meaningful word dominating the text.
  const counts = new Map<string, number>();
  for (const word of corpus.split(/[^a-z0-9+#.]+/)) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const [topWord, topCount] = [...counts.entries()].reduce<[string, number]>(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    ['', 0],
  );

  if (topCount / total > REPETITION_THRESHOLD && topCount >= 5) {
    score -= 25;
    findings.push(
      finding(
        'keywords.repetition',
        'warning',
        `"${topWord}" appears ${topCount} times. Heavy repetition of one term reads as keyword stuffing.`,
      ),
    );
  } else {
    findings.push(
      finding('keywords.natural-distribution', 'good', 'Terminology is spread naturally.'),
    );
  }

  return {
    category: 'keywordQuality',
    weight: ATS_CATEGORY_WEIGHTS.keywordQuality,
    score: clampScore(score),
    findings,
  };
}
