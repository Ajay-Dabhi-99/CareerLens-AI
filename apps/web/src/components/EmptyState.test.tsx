import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Nothing here" description="Try adding something." />);

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Try adding something.')).toBeInTheDocument();
  });

  it('renders an action when provided', () => {
    render(<EmptyState title="Nothing here" action={<button>Do it</button>} />);

    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });
});
