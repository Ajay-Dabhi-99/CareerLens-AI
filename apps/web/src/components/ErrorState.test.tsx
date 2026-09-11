import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders the description and an alert role', () => {
    render(<ErrorState description="Could not load resumes." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load resumes.');
  });

  it('calls onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState description="Could not load resumes." onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when onRetry is not provided', () => {
    render(<ErrorState description="Could not load resumes." />);

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});
