import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RewritePanel, type RewriteOption } from './RewritePanel';

function options(): RewriteOption[] {
  return [
    {
      text: 'Owned the billing service end to end.',
      explanation: 'Replaces "responsible for" with ownership.',
      requiresVerification: false,
    },
    {
      text: 'Owned billing, cutting failed payments by [X]%.',
      explanation: 'Stronger with a number, which your resume does not contain.',
      requiresVerification: true,
    },
  ];
}

const CURRENT = 'Responsible for the billing service.';

describe('RewritePanel', () => {
  it('shows nothing at all until a rewrite is asked for', () => {
    const { container } = render(
      <RewritePanel
        state={{ kind: 'idle' }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('applies nothing on its own — every option needs a click', () => {
    const onAccept = vi.fn();
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />,
    );

    // Rendering suggestions must never be the same as taking them.
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /use this/i })[0]!);
    expect(onAccept).toHaveBeenCalledWith('Owned the billing service end to end.');
  });

  it('keeps the current text on screen so the choice is a comparison', () => {
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(CURRENT)).toBeVisible();
  });

  it('explains every option rather than offering bare text', () => {
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/replaces "responsible for"/i)).toBeVisible();
    expect(screen.getByText(/^Stronger with a number/i)).toBeVisible();
  });

  it('warns on an option that needs a fact the resume does not have', () => {
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // The placeholder must not be pasted onto a resume unread.
    expect(screen.getByText(/replace the placeholder with a real figure/i)).toBeVisible();
  });

  it('offers the option anyway rather than hiding it', () => {
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // Flagged, not withheld: the user may well have the number to hand.
    expect(screen.getAllByRole('button', { name: /use this/i })).toHaveLength(2);
  });

  it('says the work is safe and reversible', () => {
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/nothing changes until you choose/i)).toBeVisible();
  });

  it('can be dismissed without taking anything', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RewritePanel
        state={{ kind: 'ready', options: options() }}
        currentText={CURRENT}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /dismiss suggestions/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('reports a failure without suggesting the resume was harmed', () => {
    render(
      <RewritePanel
        state={{ kind: 'error', message: 'The AI is at capacity right now.' }}
        currentText={CURRENT}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The AI is at capacity right now.');
    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible();
  });
});
