import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allBullets, clampScore, estimateYearsOfExperience, finding } from '../analyzerKit.js';

/** Past this many years, a resume with no measurable outcome is a bigger miss. */
const EXPERIENCE_EXPECTATION_THRESHOLD = 3;

/**
 * Percentages, currency, magnitudes with a unit, and standalone numbers.
 *
 * The unit branch matters: a trailing word boundary alone misses "800ms", "2TB"
 * and "10x", which are exactly the measurements strong bullets are made of.
 */
const METRIC_PATTERN = new RegExp(
  [
    String.raw`\d+(?:\.\d+)?\s*%`,
    String.raw`[$£€₹]\s*\d`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:k|m|bn|b|x|ms|s|gb|tb|mb|kb|fps|rps|qps|hrs?|hours?|days?|weeks?|months?|years?)\b`,
    String.raw`\b\d+\b`,
  ].join('|'),
  'i',
);

const WEAK_OPENERS =
  /^(responsible for|worked on|helped( with)?|assisted( with)?|involved in|participated in|tasked with|duties includ)/i;

const STRONG_VERBS =
  /^(led|built|shipped|launched|designed|architected|migrated|reduced|increased|improved|delivered|automated|scaled|owned|created|drove|cut|grew|rebuilt|introduced|established|negotiated|mentored|resolved|streamlined|optimi[sz]ed)/i;

/**
 * Impact and achievements: does a bullet say what changed, or only what the
 * person was assigned to?
 *
 * Measured on bullets that exist. An absence of numbers is reported as exactly
 * that — the engine never guesses at what the numbers might have been.
 */
export function analyzeImpact(resume: Resume): AtsCategoryResult {
  const findings = [];
  const bullets = allBullets(resume);

  if (bullets.length === 0) {
    // Nothing to judge. Reported, but excluded from the total rather than
    // scored zero — an unreadable layout is not the same as weak achievements.
    return {
      category: 'impactAchievements',
      weight: ATS_CATEGORY_WEIGHTS.impactAchievements,
      score: 0,
      notAssessed: true,
      findings: [
        finding(
          'impact.no-bullets',
          'warning',
          'No bullet points were found to assess, so impact could not be scored. If your resume does describe your work, the layout may be hard for filters to read.',
        ),
      ],
    };
  }

  const quantified = bullets.filter((bullet) => METRIC_PATTERN.test(bullet.text));
  const weakOpeners = bullets.filter((bullet) => WEAK_OPENERS.test(bullet.text.trim()));
  const strongOpeners = bullets.filter((bullet) => STRONG_VERBS.test(bullet.text.trim()));

  const quantifiedRatio = quantified.length / bullets.length;
  const strongRatio = strongOpeners.length / bullets.length;

  // Quantified outcomes carry most of the weight, with verb strength behind it.
  let score = Math.round(quantifiedRatio * 65 + strongRatio * 35);

  /*
   * Expectations scale with the length of the history, they do not become
   * credit for it. Someone four years in describing only what they were
   * assigned has understated themselves more than a graduate doing the same,
   * so the same absence of metrics costs them more.
   *
   * This deliberately lowers such a resume rather than raising it. A score that
   * flattered a long career would reassure exactly the person who most needs
   * telling that their resume is not landing.
   */
  const years = estimateYearsOfExperience(resume);
  const seasoned = years >= EXPERIENCE_EXPECTATION_THRESHOLD;

  if (quantified.length === 0) {
    findings.push(
      finding(
        'impact.no-metrics',
        'critical',
        'No bullet contains a measurable outcome. Numbers are the single biggest differentiator here.',
      ),
    );

    if (seasoned) {
      // The reduction is applied to the final score rather than here, because
      // a resume with no metrics has already bottomed this category out and
      // subtracting from zero would make the finding cosmetic.
      findings.push(
        finding(
          'impact.experience-without-evidence',
          'critical',
          `Around ${years} years of experience are described without a single measurable result. At this stage reviewers expect outcomes, not responsibilities — and your work almost certainly produced some.`,
        ),
      );
    }
  } else if (quantifiedRatio < 0.3) {
    findings.push(
      finding(
        'impact.few-metrics',
        'warning',
        `Only ${quantified.length} of ${bullets.length} bullets include a measurable outcome.`,
      ),
    );
  } else {
    findings.push(
      finding(
        'impact.quantified',
        'good',
        `${quantified.length} of ${bullets.length} bullets include a measurable outcome.`,
      ),
    );
  }

  if (weakOpeners.length > 0) {
    score -= Math.min(20, weakOpeners.length * 7);
    findings.push(
      finding(
        'impact.weak-openers',
        'warning',
        `${weakOpeners.length} bullet${weakOpeners.length === 1 ? ' opens' : 's open'} with phrasing like "responsible for", which describes a job description rather than an achievement.`,
      ),
    );
  }

  if (strongRatio >= 0.6) {
    findings.push(
      finding('impact.strong-verbs', 'good', 'Most bullets open with a strong action verb.'),
    );
  } else if (strongRatio < 0.3) {
    findings.push(
      finding(
        'impact.weak-verbs',
        'warning',
        'Few bullets open with a strong action verb such as led, built, reduced or shipped.',
      ),
    );
  }

  return {
    category: 'impactAchievements',
    weight: ATS_CATEGORY_WEIGHTS.impactAchievements,
    score: clampScore(score),
    findings,
  };
}
