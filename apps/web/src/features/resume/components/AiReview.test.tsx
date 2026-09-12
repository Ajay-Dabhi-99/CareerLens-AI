import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AiReview } from './AiReview';
import type { ResumeAnalysis } from '@/features/resume/api/reviewApi';

function analysis(overrides: Partial<ResumeAnalysis> = {}): ResumeAnalysis {
  return {
    pros: ['Clear chronology with no gaps'],
    cons: ['No measurable outcomes anywhere'],
    sectionReviews: [
      { section: 'experience', strengths: ['Named employers'], weaknesses: ['Duties, not results'] },
    ],
    priorityActions: [
      { priority: 'low', action: 'Trim the summary', reason: 'It repeats the first role' },
      { priority: 'high', action: 'Quantify the billing work', reason: 'Numbers differentiate' },
    ],
    ...overrides,
  };
}

describe('AiReview', () => {
  it('leads with the highest priority action regardless of the order returned', () => {
    render(<AiReview analysis={analysis()} />);

    const actions = screen.getAllByRole('listitem');
    // The model returned "low" first; the user should still see "high" at the top.
    expect(actions[0]).toHaveTextContent('Quantify the billing work');
    expect(actions[0]).toHaveTextContent('Do first');
  });

  it('shows the reason alongside every action, not just the instruction', () => {
    render(<AiReview analysis={analysis()} />);

    expect(screen.getByText('Numbers differentiate')).toBeInTheDocument();
    expect(screen.getByText('It repeats the first role')).toBeInTheDocument();
  });

  it('separates strengths from weaknesses', () => {
    render(<AiReview analysis={analysis()} />);

    const working = screen.getByText('What is working').closest('div[class]')?.parentElement;
    expect(working).not.toBeNull();
    expect(within(working as HTMLElement).getByText('Clear chronology with no gaps')).toBeVisible();
    expect(screen.getByText('No measurable outcomes anywhere')).toBeVisible();
  });

  it('says so plainly when nothing was flagged rather than showing an empty box', () => {
    render(<AiReview analysis={analysis({ cons: [] })} />);

    expect(screen.getByText('Nothing significant was flagged.')).toBeInTheDocument();
  });

  it('offers a refresh only when regenerating is possible', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<AiReview analysis={analysis()} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /review again/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<AiReview analysis={analysis()} />);
    expect(screen.queryByRole('button', { name: /review again/i })).not.toBeInTheDocument();
  });

  it('disables the refresh while a review is running, so a second call cannot be started', () => {
    render(<AiReview analysis={analysis()} onRefresh={vi.fn()} refreshing />);

    expect(screen.getByRole('button', { name: /reviewing/i })).toBeDisabled();
  });

  it('tells the user the advice is not fact about them', () => {
    render(<AiReview analysis={analysis()} createdAt={new Date().toISOString()} />);

    expect(screen.getByText(/check anything you are unsure of/i)).toBeInTheDocument();
  });
});
