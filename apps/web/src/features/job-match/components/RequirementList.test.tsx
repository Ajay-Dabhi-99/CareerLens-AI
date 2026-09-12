import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequirementList } from './RequirementList';
import type { JobAnalysis } from '@/features/job-match/api/jobApi';

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id: 'a1',
    jobDescriptionId: 'job-1',
    requirements: [
      { id: 'r1', text: 'Strong Go experience', category: 'skill', required: true },
      { id: 'r2', text: 'Kubernetes', category: 'skill', required: false },
      { id: 'r3', text: 'Mentor other engineers', category: 'responsibility', required: false },
    ],
    keywords: ['Go', 'Kubernetes'],
    model: 'gemini-3.8-flash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RequirementList', () => {
  it('groups requirements by what they are', () => {
    render(<RequirementList analysis={analysis()} />);

    expect(screen.getByText('Skills')).toBeVisible();
    expect(screen.getByText('Responsibilities')).toBeVisible();
  });

  it('marks only what the posting itself called essential', () => {
    render(<RequirementList analysis={analysis()} />);

    // Most listings pad a wish list. Treating every line as mandatory would
    // talk people out of jobs they would get.
    expect(screen.getAllByText('Essential')).toHaveLength(1);
  });

  it('says how many are essential, so the count is not left to be counted', () => {
    render(<RequirementList analysis={analysis()} />);

    expect(screen.getByText(/3 requirements, of which 1 is stated as essential/i)).toBeVisible();
  });

  it('says nothing was inferred', () => {
    render(<RequirementList analysis={analysis()} />);

    expect(screen.getByText(/read from the posting — nothing is inferred/i)).toBeVisible();
  });

  it('omits the keyword card when the posting had none', () => {
    render(<RequirementList analysis={analysis({ keywords: [] })} />);

    expect(screen.queryByText('Keywords')).not.toBeInTheDocument();
  });

  it('shows a category only when it has something in it', () => {
    render(
      <RequirementList
        analysis={analysis({
          requirements: [
            { id: 'r1', text: 'Go', category: 'skill', required: true },
          ],
        })}
      />,
    );

    expect(screen.getByText('Skills')).toBeVisible();
    expect(screen.queryByText('Qualifications')).not.toBeInTheDocument();
  });

  it('renders a posting with no requirements at all without breaking', () => {
    render(<RequirementList analysis={analysis({ requirements: [], keywords: [] })} />);

    expect(screen.getByText(/0 requirements/i)).toBeVisible();
  });
});
