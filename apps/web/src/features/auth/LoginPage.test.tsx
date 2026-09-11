import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

const { mockAuthApi } = vi.hoisted(() => ({
  mockAuthApi: {
    getCurrentSession: vi.fn(),
    onAuthStateChange: vi.fn(() => () => {}),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn(),
  },
}));

vi.mock('@/features/auth/api/authApi', () => mockAuthApi);

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthApi.onAuthStateChange.mockReturnValue(() => {});
    mockAuthApi.getCurrentSession.mockResolvedValue(null);
  });

  it('shows a validation error for an invalid email and does not call the API', async () => {
    renderLogin();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mockAuthApi.signInWithPassword).not.toHaveBeenCalled();
  });

  it('requires a password', async () => {
    renderLogin();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(mockAuthApi.signInWithPassword).not.toHaveBeenCalled();
  });

  it('submits valid credentials', async () => {
    mockAuthApi.signInWithPassword.mockResolvedValue(undefined);
    renderLogin();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockAuthApi.signInWithPassword).toHaveBeenCalledWith(
        'jane@example.com',
        'password123',
      );
    });
  });

  it('surfaces a failed sign in without crashing', async () => {
    mockAuthApi.signInWithPassword.mockRejectedValue(new Error('Invalid login credentials'));
    renderLogin();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
  });
});
