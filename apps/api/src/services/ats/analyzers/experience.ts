import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { clampScore, finding } from '../analyzerKit.js';

const MIN_BULLETS_PER_ROLE = 2;

/**
 * Experience strength: role clarity, dates, and whether each role actually says
 * what the person did.
 *
 * Chronology is checked only where dates were parsed — a missing date is
 * reported as missing, never assumed to be out of order.
 */
export function analyzeExperience(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const roles = resume.experience;

  if (roles.length === 0) {
    return {
      category: 'experienceStrength',
      weight: ATS_CATEGORY_WEIGHTS.experienceStrength,
      score: 0,
      findings: [
        finding('experience.none', 'critical', 'No work experience was found.'),
      ],
    };
  }

  findings.push(
    finding('experience.count', 'good', `${roles.length} role${roles.length === 1 ? '' : 's'} found.`),
  );

  const missingTitle = roles.filter((role) => role.title.trim() === '').length;
  const missingCompany = roles.filter((role) => role.company.trim() === '').length;

  if (missingTitle > 0) {
    score -= Math.min(20, missingTitle * 10);
    findings.push(
      finding(
        'experience.missing-title',
        'critical',
        `${missingTitle} role${missingTitle === 1 ? ' is' : 's are'} missing a job title.`,
      ),
    );
  }

  if (missingCompany > 0) {
    score -= Math.min(20, missingCompany * 10);
    findings.push(
      finding(
        'experience.missing-company',
        'critical',
        `${missingCompany} role${missingCompany === 1 ? ' is' : 's are'} missing an employer.`,
      ),
    );
  }

  const missingDates = roles.filter((role) => !role.startDate).length;
  if (missingDates > 0) {
    score -= Math.min(20, missingDates * 10);
    findings.push(
      finding(
        'experience.missing-dates',
        'warning',
        `${missingDates} role${missingDates === 1 ? ' has' : 's have'} no start date. Filters often reject resumes they cannot date.`,
      ),
    );
  } else {
    findings.push(finding('experience.dated', 'good', 'Every role has a start date.'));
  }

  const thinRoles = roles.filter((role) => role.bullets.length < MIN_BULLETS_PER_ROLE).length;
  if (thinRoles > 0) {
    score -= Math.min(25, thinRoles * 12);
    findings.push(
      finding(
        'experience.thin-roles',
        'warning',
        `${thinRoles} role${thinRoles === 1 ? ' has' : 's have'} fewer than ${MIN_BULLETS_PER_ROLE} bullet points describing the work.`,
      ),
    );
  }

  const emptyRoles = roles.filter((role) => role.bullets.length === 0).length;
  if (emptyRoles > 0) {
    findings.push(
      finding(
        'experience.empty-roles',
        'critical',
        `${emptyRoles} role${emptyRoles === 1 ? ' lists' : 's list'} no responsibilities at all.`,
      ),
    );
  }

  return {
    category: 'experienceStrength',
    weight: ATS_CATEGORY_WEIGHTS.experienceStrength,
    score: clampScore(score),
    findings,
  };
}
