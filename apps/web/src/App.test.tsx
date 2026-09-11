import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { fakeSession } from './test/authTestUtils';

const { mockAuthApi, mockApi, authListeners } = vi.hoisted(() => ({
  mockAuthApi: {
    getCurrentSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn(),
  },
  mockApi: {
    getHealth: vi.fn(),
    getMe: vi.fn(),
  },
  authListeners: [] as Array<(session: unknown) => void>,
}));

vi.mock('@/features/auth/api/authApi', () => mockAuthApi);
vi.mock('@/lib/api', () => mockApi);

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authListeners.length = 0;

    // Mirror the real SDK: listeners registered here are notified on auth changes.
    mockAuthApi.onAuthStateChange.mockImplementation((cb: (session: unknown) => void) => {
      authListeners.push(cb);
      return () => {
        const index = authListeners.indexOf(cb);
        if (index >= 0) authListeners.splice(index, 1);
      };
    });
    mockAuthApi.signOut.mockImplementation(async () => {
      authListeners.forEach((cb) => cb(null));
    });

    mockApi.getHealth.mockResolvedValue({
      status: 'ok',
      service: 'career-lens-ai-api',
      timestamp: new Date().toISOString(),
    });
    mockApi.getMe.mockResolvedValue({ user: { id: 'user-1', email: 'jane@example.com' } });
  });

  it('redirects an unauthenticated visitor to the login page', async () => {
    mockAuthApi.getCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('renders the dashboard for an authenticated user', async () => {
    mockAuthApi.getCurrentSession.mockResolvedValue(fakeSession());

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('api-status')).toHaveTextContent('API online');
    });
  });

  it('shows the identity confirmed by the API', async () => {
    mockAuthApi.getCurrentSession.mockResolvedValue(fakeSession());

    render(<App />);

    expect(await screen.findByTestId('api-identity')).toHaveTextContent('jane@example.com');
  });

  it('navigates between sidebar pages when authenticated', async () => {
    mockAuthApi.getCurrentSession.mockResolvedValue(fakeSession());

    render(<App />);

    fireEvent.click(await screen.findByRole('link', { name: /resumes/i }));
    expect(await screen.findByText(/resume upload isn.t built yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /job match/i }));
    expect(await screen.findByText(/job matching isn.t built yet/i)).toBeInTheDocument();
  });

  it('signs the user out and returns them to the login page', async () => {
    mockAuthApi.getCurrentSession.mockResolvedValue(fakeSession());

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(mockAuthApi.signOut).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
