import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { clampScore, finding } from '../analyzerKit.js';

/** Text left behind from a template. */
const PLACEHOLDER =
  /(lorem ipsum|your name here|insert .{0,20}here|xxx+|tbd\b|to be (added|completed)|\[.{1,30}\]|placeholder)/i;

const UNPROFESSIONAL_EMAIL = /^(sexy|hot|babe|cutie|gangsta|crazy|lazy|killer|monster)\w*@/i;

/**
 * Professionalism and completeness: are the essentials present, and is there
 * anything embarrassing left in the document?
 */
export function analyzeCompleteness(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const { personal } = resume;

  if (personal.fullName.trim() === '') {
    score -= 30;
    findings.push(
      finding(
        'completeness.no-name',
        'critical',
        'No name was detected at the top of the document.',
      ),
    );
  } else {
    findings.push(finding('completeness.name', 'good', 'Name detected.'));
  }

  if (!personal.email) {
    score -= 30;
    findings.push(
      finding(
        'completeness.no-email',
        'critical',
        'No email address was found. Without it nobody can reply to you.',
      ),
    );
  } else {
    findings.push(finding('completeness.email', 'good', 'Email address detected.'));

    if (UNPROFESSIONAL_EMAIL.test(personal.email)) {
      score -= 15;
      findings.push(
        finding(
          'completeness.informal-email',
          'warning',
          'The email address reads informally. A plain name-based address is safer.',
        ),
      );
    }
  }

  if (!personal.phone) {
    score -= 10;
    findings.push(finding('completeness.no-phone', 'warning', 'No phone number was found.'));
  }

  if (!personal.location) {
    score -= 10;
    findings.push(
      finding(
        'completeness.no-location',
        'warning',
        'No location was found. Many filters screen on location.',
      ),
    );
  }

  if (!personal.linkedin && !personal.github && !personal.website) {
    score -= 10;
    findings.push(
      finding(
        'completeness.no-links',
        'warning',
        'No LinkedIn, GitHub or portfolio link was found.',
      ),
    );
  } else {
    findings.push(finding('completeness.has-links', 'good', 'A professional link is included.'));
  }

  // Placeholder text left in a resume is worse than an omission.
  const searchable = [
    personal.fullName,
    resume.summary,
    ...resume.experience.flatMap((role) => [role.title, role.company, ...role.bullets.map((b) => b.text)]),
  ].join(' ');

  if (PLACEHOLDER.test(searchable)) {
    score -= 25;
    findings.push(
      finding(
        'completeness.placeholder-text',
        'critical',
        'Template placeholder text is still in the document.',
      ),
    );
  }

  return {
    category: 'professionalismCompleteness',
    weight: ATS_CATEGORY_WEIGHTS.professionalismCompleteness,
    score: clampScore(score),
    findings,
  };
}
