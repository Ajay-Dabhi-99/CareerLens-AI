import type { AtsCategoryResult, Resume } from '@career-lens-ai/types';
import { ATS_CATEGORY_WEIGHTS } from '@career-lens-ai/types';
import { allSkills, clampScore, finding, resumeCorpus } from '../analyzerKit.js';

const TOO_FEW_SKILLS = 5;
const HEALTHY_SKILLS = 10;
const SUSPICIOUSLY_MANY_SKILLS = 40;

/**
 * Skills quality: coverage, grouping, and whether the skills are backed by
 * evidence elsewhere in the resume.
 *
 * A long list nobody can corroborate reads as keyword stuffing to a human
 * reviewer even when it passes a filter, so evidence is scored explicitly.
 */
export function analyzeSkills(resume: Resume): AtsCategoryResult {
  const findings = [];
  let score = 100;

  const skills = allSkills(resume);

  if (skills.length === 0) {
    return {
      category: 'skillsQuality',
      weight: ATS_CATEGORY_WEIGHTS.skillsQuality,
      score: 0,
      findings: [
        finding('skills.none', 'critical', 'No skills were found. Add a grouped skills section.'),
      ],
    };
  }

  if (skills.length < TOO_FEW_SKILLS) {
    score -= 30;
    findings.push(
      finding(
        'skills.too-few',
        'warning',
        `Only ${skills.length} skill${skills.length === 1 ? '' : 's'} listed. Aim for around ${HEALTHY_SKILLS} relevant ones.`,
      ),
    );
  } else if (skills.length > SUSPICIOUSLY_MANY_SKILLS) {
    // Scales with the excess: a list this long is padding, and a flat penalty
    // let a resume claiming forty-plus tools still score respectably.
    const excess = skills.length - SUSPICIOUSLY_MANY_SKILLS;
    score -= Math.min(45, 15 + excess * 2);
    findings.push(
      finding(
        'skills.too-many',
        'warning',
        `${skills.length} skills listed. A list this long reads as padding and dilutes the ones that matter.`,
      ),
    );
  } else {
    findings.push(
      finding('skills.healthy-count', 'good', `${skills.length} skills listed.`),
    );
  }

  // Duplicates usually mean the same tool repeated across groups.
  const normalized = skills.map((skill) => skill.toLowerCase().trim());
  const duplicates = normalized.length - new Set(normalized).size;
  if (duplicates > 0) {
    score -= Math.min(15, duplicates * 5);
    findings.push(
      finding(
        'skills.duplicates',
        'warning',
        `${duplicates} duplicate skill${duplicates === 1 ? '' : 's'} found.`,
      ),
    );
  }

  /*
   * Padding by variation: "React, React Native, React Router, React Query"
   * inflates a skills list without adding evidence of a distinct competence.
   *
   * This is checked here rather than in the keyword analyzer because that one
   * deliberately excludes the skills list — it measures terminology in the
   * prose, which is exactly where a stuffed resume has nothing.
   */
  const rootCounts = new Map<string, number>();
  for (const skill of normalized) {
    const root = skill.split(/[\s/]/)[0] ?? '';
    if (root.length < 3) continue;
    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
  }

  const [repeatedRoot, repeatCount] = [...rootCounts.entries()].reduce<[string, number]>(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    ['', 0],
  );

  if (repeatCount >= 4) {
    score -= Math.min(30, repeatCount * 6);
    findings.push(
      finding(
        'skills.repetitive',
        'warning',
        `${repeatCount} listed skills are variations of "${repeatedRoot}". Naming the ecosystem once is stronger than listing every package in it.`,
      ),
    );
  }

  const grouped = resume.skills.length > 1 || resume.skills.some((g) => g.category !== 'Skills');
  if (grouped) {
    findings.push(
      finding('skills.grouped', 'good', 'Skills are grouped into labelled categories.'),
    );
  } else {
    score -= 10;
    findings.push(
      finding(
        'skills.ungrouped',
        'warning',
        'Skills are one flat list. Grouping them (Languages, Tools, Platforms) scans far better.',
      ),
    );
  }

  // Evidence: does the skill appear anywhere outside the skills list?
  const corpus = resumeCorpus(resume);
  const unevidenced = normalized.filter((skill) => skill.length > 2 && !corpus.includes(skill));
  const evidencedRatio = 1 - unevidenced.length / normalized.length;

  // Feedback across the whole range — a resume in the middle should not get silence.
  if (evidencedRatio < 0.3) {
    score -= 25;
    findings.push(
      finding(
        'skills.no-evidence',
        'warning',
        'Most listed skills are not mentioned anywhere else. Showing where you used them is far more convincing than listing them.',
      ),
    );
  } else if (evidencedRatio < 0.6) {
    score -= 10;
    findings.push(
      finding(
        'skills.partially-evidenced',
        'warning',
        `${unevidenced.length} of ${normalized.length} listed skills do not appear in your experience or projects.`,
      ),
    );
  } else {
    findings.push(
      finding(
        'skills.well-evidenced',
        'good',
        'Most listed skills also appear in your experience or projects.',
      ),
    );
  }

  return {
    category: 'skillsQuality',
    weight: ATS_CATEGORY_WEIGHTS.skillsQuality,
    score: clampScore(score),
    findings,
  };
}
