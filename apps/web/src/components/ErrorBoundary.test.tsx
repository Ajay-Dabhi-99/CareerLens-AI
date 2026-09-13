import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;

function Unstable() {
  if (shouldThrow) throw new Error('secret internal detail at /srv/app.js:42');
  return <p>Recovered content</p>;
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors; silenced so the test output stays readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows a way forward instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This page ran into a problem');
    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible();
  });

  it('tells the user their saved work is safe', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/already saved is safe/i)).toBeVisible();
  });

  it('never shows the error detail to the user', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    // A stack trace means nothing to the reader and can reveal internals.
    expect(screen.queryByText(/secret internal detail/)).not.toBeInTheDocument();
  });

  it('logs the error so it is not lost', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(consoleError).toHaveBeenCalledWith(
      'Render error caught by boundary',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('recovers when asked to try again and the problem has gone', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Recovered content')).toBeVisible();
  });

  it('clears the error when the user moves to another page', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/editor/1">
        <Unstable />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    // One page's crash must not follow the user to the next one.
    rerender(
      <ErrorBoundary resetKey="/versions">
        <Unstable />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Recovered content')).toBeVisible();
  });

  it('renders its children untouched when nothing goes wrong', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Recovered content')).toBeVisible();
  });
});
