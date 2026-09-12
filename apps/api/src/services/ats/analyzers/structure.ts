import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { clampScore, finding } from '../analyzerKit.js';

/**
 * ATS compatibility / structure.
 *
 * Measures whether the document is laid out the way parsers expect: the
 * sections an ATS looks for, present and populated. This scores what we could
 * actually detect — if a section exists in the PDF but we could not read it,
 * an ATS very likely could not either, which is the point.
 */
export function analyzeStructure(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const hasExperience = resume.experience.length > 0;
  const hasEducation = resume.education.length > 0;
  const hasSkills = resume.skills.length > 0;
  const hasSummary = resume.summary.trim().length > 0;

  if (hasExperience) {
    findings.push(finding('structure.experience-found', 'good', 'Experience section detected.'));
  } else {
    score -= 35;
    findings.push(
      finding(
        'structure.no-experience',
        'critical',
        'No experience section was detected. This is the section recruiters and filters look for first.',
      ),
    );
  }

  if (hasEducation) {
    findings.push(finding('structure.education-found', 'good', 'Education section detected.'));
  } else {
    score -= 15;
    findings.push(
      finding('structure.no-education', 'warning', 'No education section was detected.'),
    );
  }

  if (hasSkills) {
    findings.push(finding('structure.skills-found', 'good', 'Skills section detected.'));
  } else {
    score -= 25;
    findings.push(
      finding(
        'structure.no-skills',
        'critical',
        'No skills section was detected. Keyword filters rely on it heavily.',
      ),
    );
  }

  if (hasSummary) {
    findings.push(finding('structure.summary-found', 'good', 'Summary section detected.'));
  } else {
    score -= 10;
    findings.push(
      finding(
        'structure.no-summary',
        'warning',
        'No summary was detected. A short summary frames everything below it.',
      ),
    );
  }

  // Roles with neither a title nor a company usually mean a layout the parser
  // could not follow, such as multiple columns or a table.
  const unreadableRoles = resume.experience.filter(
    (role) => role.title.trim() === '' && role.company.trim() === '',
  ).length;

  if (unreadableRoles > 0) {
    score -= Math.min(20, unreadableRoles * 10);
    findings.push(
      finding(
        'structure.unreadable-roles',
        'critical',
        `${unreadableRoles} role${unreadableRoles === 1 ? '' : 's'} could not be read properly. Multi-column layouts and tables often break parsers.`,
      ),
    );
  }

  return {
    category: 'atsCompatibility',
    weight: ATS_CATEGORY_WEIGHTS.atsCompatibility,
    score: clampScore(score),
    findings,
  };
}
