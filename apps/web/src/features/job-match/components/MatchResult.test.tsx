import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchResult } from './MatchResult';
import type { JobAnalysis } from '@/features/job-match/api/jobApi';
import type { SkillMatch } from '@/features/job-match/api/matchApi';

function analysis(): JobAnalysis {
  return {
    id: 'a1',
    jobDescriptionId: 'job-1',
    requirements: [
      { id: 'r1', text: 'Strong Go experience', category: 'skill', required: true },
      { id: 'r2', text: 'Kubernetes', category: 'skill', required: false },
      { id: 'r3', text: 'Mentoring engineers', category: 'responsibility', required: true },
      { id: 'r4', text: 'Rust', category: 'skill', required: false },
    ],
    keywords: [],
    model: 'gemini-3.8-flash',
    createdAt: new Date().toISOString(),
  };
}

function matches(): SkillMatch[] {
  return [
    {
      id: 'r1',
      requirementId: 'r1',
      state: 'matched',
      evidence: 'Led the ledger migration to Go',
      confidence: 0.9,
    },
    {
      id: 'r2',
      requirementId: 'r2',
      state: 'partial',
      evidence: 'Infrastructure: Kubernetes, Terraform',
      confidence: 0.6,
    },
    { id: 'r3', requirementId: 'r3', state: 'needsVerification', confidence: 0.4 },
    { id: 'r4', requirementId: 'r4', state: 'missing', confidence: 0.9 },
  ];
}

describe('MatchResult', () => {
  it('shows the score', () => {
    render(<MatchResult analysis={analysis()} matches={matches()} matchScore={58} />);

    expect(screen.getByText('58')).toBeVisible();
  });

  it('quotes the resume for anything it claims to have found', () => {
    render(<MatchResult analysis={analysis()} matches={matches()} matchScore={58} />);

    // The quote is the whole basis for believing the verdict.
    expect(screen.getByText('Led the ledger migration to Go')).toBeVisible();
    expect(screen.getByText('Infrastructure: Kubernetes, Terraform')).toBeVisible();
  });

  it('leads with what is missing, not with what already works', () => {
    render(<MatchResult analysis={analysis()} matches={matches()} matchScore={58} />);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const order = headings.join(' | ');

    // The point of the screen is what to fix before applying.
    expect(order.indexOf('Not in your resume')).toBeLessThan(order.indexOf('Shown in your resume'));
  });

  it('says "not in your resume", never "you do not have this"', () => {
    render(<MatchResult analysis={analysis()} matches={matches()} matchScore={58} />);

    // The spec is explicit that missing-from-resume and lacking-the-skill are
    // different claims, and only one of them is ours to make.
    expect(screen.getByText(/statement about the document, not about you/i)).toBeVisible();
    expect(screen.getByText(/reads your resume, not your career/i)).toBeVisible();
  });

  it('counts the essential requirements that are not shown', () => {
    render(<MatchResult analysis={analysis()} matches={matches()} matchScore={58} />);

    // r3 is essential and only needsVerification; r1 is essential and matched.
    expect(screen.getByText(/1 essential requirement is not clearly shown/i)).toBeVisible();
  });

  it('says so when nothing essential is missing', () => {
    const allEssentialMet: SkillMatch[] = [
      { id: 'r1', requirementId: 'r1', state: 'matched', confidence: 0.9 },
      { id: 'r3', requirementId: 'r3', state: 'matched', confidence: 0.9 },
    ];

    render(<MatchResult analysis={analysis()} matches={allEssentialMet} matchScore={80} />);

    expect(screen.getByText(/shows every requirement the posting calls essential/i)).toBeVisible();
  });

  it('treats a requirement with no verdict as not shown rather than hiding it', () => {
    render(<MatchResult analysis={analysis()} matches={[]} matchScore={0} />);

    // Silently dropping it would overstate the match by omission.
    expect(screen.getByText('Strong Go experience')).toBeVisible();
    expect(screen.getByText('Rust')).toBeVisible();
  });

  it('omits a group that has nothing in it', () => {
    const onlyMatched: SkillMatch[] = analysis().requirements.map((requirement) => ({
      id: requirement.id,
      requirementId: requirement.id,
      state: 'matched' as const,
      evidence: 'Led the ledger migration to Go',
      confidence: 0.9,
    }));

    render(<MatchResult analysis={analysis()} matches={onlyMatched} matchScore={100} />);

    expect(screen.queryByText('Not in your resume')).not.toBeInTheDocument();
  });
});
