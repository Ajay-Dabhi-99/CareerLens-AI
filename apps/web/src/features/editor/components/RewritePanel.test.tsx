import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

function renderPanel(overrides: Partial<Parameters<typeof RewritePanel>[0]> = {}) {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();

  render(
    <RewritePanel
      state={{ kind: 'ready', options: options() }}
      currentText={CURRENT}
      onAccept={onAccept}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );

  return { onAccept, onDismiss };
}

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
    const { onAccept } = renderPanel();

    // Rendering suggestions must never be the same as taking them.
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /^accept$/i })[0]!);
    expect(onAccept).toHaveBeenCalledWith({
      text: 'Owned the billing service end to end.',
      edited: false,
    });
  });

  it('shows a diff so the change is visible word by word', () => {
    renderPanel();

    const diffs = screen.getAllByTestId('diff-view');
    expect(diffs).toHaveLength(2);
    // Both sides are present, so the user compares rather than guesses.
    expect(within(diffs[0]!).getByText('Now')).toBeVisible();
    expect(within(diffs[0]!).getByText('Suggested')).toBeVisible();
  });

  it('lets the user edit a suggestion before taking it', () => {
    const { onAccept } = renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /edit first/i })[0]!);

    const box = screen.getByLabelText(/your version/i);
    expect(box).toHaveValue('Owned the billing service end to end.');

    fireEvent.change(box, { target: { value: 'Owned billing, cutting failures by 40%.' } });
    fireEvent.click(screen.getByRole('button', { name: /use my version/i }));

    // Recorded as edited, so the history can tell "took the AI's words" from
    // "used them as a starting point".
    expect(onAccept).toHaveBeenCalledWith({
      text: 'Owned billing, cutting failures by 40%.',
      edited: true,
    });
  });

  it('will not accept an edit the user has emptied', () => {
    renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /edit first/i })[0]!);
    fireEvent.change(screen.getByLabelText(/your version/i), {
      target: { value: '   ' },
    });

    expect(screen.getByRole('button', { name: /use my version/i })).toBeDisabled();
  });

  it('can go back from editing to the original suggestion', () => {
    renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /edit first/i })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /back to the suggestion/i }));

    expect(screen.queryByLabelText(/edit the suggestion/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('diff-view')).toHaveLength(2);
  });

  it('explains every option rather than offering bare text', () => {
    renderPanel();

    expect(screen.getByText(/replaces "responsible for"/i)).toBeVisible();
    expect(screen.getByText(/^Stronger with a number/i)).toBeVisible();
  });

  it('warns on an option that needs a fact the resume does not have', () => {
    renderPanel();

    expect(screen.getByText(/replace the placeholder with a real figure/i)).toBeVisible();
  });

  it('offers the flagged option anyway rather than hiding it', () => {
    renderPanel();

    // Flagged, not withheld: the user may well have the number to hand.
    expect(screen.getAllByRole('button', { name: /^accept$/i })).toHaveLength(2);
  });

  it('rejects everything without taking anything', () => {
    const { onAccept, onDismiss } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /reject all/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('says the work is safe and reversible', () => {
    renderPanel();

    expect(screen.getByText(/nothing changes until you choose/i)).toBeVisible();
    expect(screen.getByText(/can be put back later/i)).toBeVisible();
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
