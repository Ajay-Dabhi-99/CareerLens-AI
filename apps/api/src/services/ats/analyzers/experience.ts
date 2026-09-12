import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { clampScore, finding } from '../analyzerKit.js';

/**
 * Depth curve: how well an average of N bullets per role describes the work.
 *
 * One line under a job says almost nothing; four or five is where a role is
 * genuinely explained. The curve is deliberately steep at the bottom.
 */
const DEPTH_BY_BULLETS = [0, 20, 45, 70, 90, 100];

/** Projects can stand in for employment, but not fully — see analyzeExperience. */
const PROJECT_SUBSTITUTE_CEILING = 70;

function depthScore(averageBullets: number): number {
  const lower = Math.floor(averageBullets);
  const upper = Math.min(lower + 1, DEPTH_BY_BULLETS.length - 1);
  const low = DEPTH_BY_BULLETS[Math.min(lower, DEPTH_BY_BULLETS.length - 1)] ?? 100;
  const high = DEPTH_BY_BULLETS[upper] ?? 100;
  return low + (high - low) * (averageBullets - lower);
}

/**
 * Experience strength: role clarity, chronology, and how well the work is
 * actually described.
 *
 * This scores the presence of substance rather than the absence of defects. An
 * earlier version started every resume at 100 and only deducted for missing
 * fields, so a single role with two throwaway bullets scored the same as a
 * fully described senior history — the category discriminated between almost
 * nothing.
 *
 * Chronology is only checked where dates parsed; a missing date is reported as
 * missing, never assumed to be out of order.
 */
export function analyzeExperience(resume: Resume): AtsCategoryResult {
  const findings = [];
  const roles = resume.experience;

  if (roles.length === 0) {
    // Projects substitute for employment, which matters for graduates and
    // career changers whose evidence is real but not an employment record.
    // Capped, because demonstrated employment is stronger evidence.
    const projectBullets = resume.projects.reduce(
      (total, project) => total + project.bullets.length,
      0,
    );

    if (resume.projects.length === 0 || projectBullets === 0) {
      return {
        category: 'experienceStrength',
        weight: ATS_CATEGORY_WEIGHTS.experienceStrength,
        score: 0,
        findings: [
          finding(
            'experience.none',
            'critical',
            'No work experience or described projects were found.',
          ),
        ],
      };
    }

    const perProject = projectBullets / resume.projects.length;
    const score = Math.min(PROJECT_SUBSTITUTE_CEILING, Math.round(depthScore(perProject)));

    return {
      category: 'experienceStrength',
      weight: ATS_CATEGORY_WEIGHTS.experienceStrength,
      score,
      findings: [
        finding(
          'experience.projects-only',
          'warning',
          `No employment history was found, so your ${resume.projects.length} described project${resume.projects.length === 1 ? '' : 's'} stood in for it. Projects count, but paid experience carries more weight.`,
        ),
      ],
    };
  }

  const withTitleAndCompany = roles.filter(
    (role) => role.title.trim() !== '' && role.company.trim() !== '',
  ).length;
  const withDates = roles.filter((role) => role.startDate).length;
  const totalBullets = roles.reduce((total, role) => total + role.bullets.length, 0);
  const averageBullets = totalBullets / roles.length;

  const clarity = (withTitleAndCompany / roles.length) * 100;
  const dated = (withDates / roles.length) * 100;
  const depth = depthScore(averageBullets);

  // Depth dominates: naming an employer is table stakes, describing the work is
  // what a reviewer actually reads.
  const score = clarity * 0.2 + dated * 0.15 + depth * 0.65;

  findings.push(
    finding(
      'experience.count',
      'good',
      `${roles.length} role${roles.length === 1 ? '' : 's'} found, averaging ${averageBullets.toFixed(1)} bullet points each.`,
    ),
  );

  if (withTitleAndCompany < roles.length) {
    findings.push(
      finding(
        'experience.missing-title',
        'critical',
        `${roles.length - withTitleAndCompany} role${roles.length - withTitleAndCompany === 1 ? ' is' : 's are'} missing a job title or employer.`,
      ),
    );
  }

  if (withDates < roles.length) {
    findings.push(
      finding(
        'experience.missing-dates',
        'warning',
        `${roles.length - withDates} role${roles.length - withDates === 1 ? ' has' : 's have'} no start date. Filters often reject resumes they cannot date.`,
      ),
    );
  } else {
    findings.push(finding('experience.dated', 'good', 'Every role has a start date.'));
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
  } else if (averageBullets < 3) {
    findings.push(
      finding(
        'experience.thin-roles',
        'warning',
        `Roles average ${averageBullets.toFixed(1)} bullets. Three to five well-chosen lines per role is the usual expectation.`,
      ),
    );
  } else {
    findings.push(
      finding('experience.well-described', 'good', 'Roles are described in useful depth.'),
    );
  }

  return {
    category: 'experienceStrength',
    weight: ATS_CATEGORY_WEIGHTS.experienceStrength,
    score: clampScore(score),
    findings,
  };
}
