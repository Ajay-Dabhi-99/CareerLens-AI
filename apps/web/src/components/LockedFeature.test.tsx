import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { LockedFeature } from './LockedFeature';

function renderLocked(previewLines?: string[]) {
  return render(
    <MemoryRouter>
      <LockedFeature
        icon={Sparkles}
        title="Full AI review"
        description="Section-by-section strengths and weaknesses."
        previewLines={previewLines}
      />
    </MemoryRouter>,
  );
}

describe('LockedFeature', () => {
  it('describes the locked feature and links to signup', () => {
    renderLocked();

    expect(screen.getByRole('heading', { name: 'Full AI review' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in to unlock/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('renders placeholder shapes rather than any real content', () => {
    const { container } = renderLocked(['a', 'b', 'c']);

    // The preview is decorative only: hidden from assistive tech and carrying no text.
    const preview = container.querySelector('ul[aria-hidden="true"]');
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toBe('');
    expect(preview?.querySelectorAll('li')).toHaveLength(3);
  });
});
