import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import * as api from './lib/api';

describe('App', () => {
  it('renders the dashboard by default and reflects API health', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({
      status: 'ok',
      service: 'career-lens-ai-api',
      timestamp: new Date().toISOString(),
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('api-status')).toHaveTextContent('API online');
    });
  });

  it('reports the API as offline when the health check fails', async () => {
    vi.spyOn(api, 'getHealth').mockRejectedValue(new Error('network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-status')).toHaveTextContent('API offline');
    });
  });

  it('navigates between sidebar pages', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({
      status: 'ok',
      service: 'career-lens-ai-api',
      timestamp: new Date().toISOString(),
    });

    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /resumes/i }));
    expect(
      await screen.findByText(/resume upload isn.t built yet/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /job match/i }));
    expect(
      await screen.findByText(/job matching isn.t built yet/i),
    ).toBeInTheDocument();
  });
});
