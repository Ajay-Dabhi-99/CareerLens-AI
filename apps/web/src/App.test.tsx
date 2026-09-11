import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import * as api from './lib/api';

describe('App', () => {
  it('renders the product name and reflects API health', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({
      status: 'ok',
      service: 'career-lens-ai-api',
      timestamp: new Date().toISOString(),
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'CareerLens AI' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('api-status')).toHaveTextContent('online');
    });
  });

  it('reports the API as offline when the health check fails', async () => {
    vi.spyOn(api, 'getHealth').mockRejectedValue(new Error('network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-status')).toHaveTextContent('offline');
    });
  });
});
