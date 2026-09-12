import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUndoable } from './useUndoable';

describe('useUndoable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has nothing to undo before anything is edited', () => {
    const { result } = renderHook(() => useUndoable('start'));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('restores the previous value', () => {
    const { result } = renderHook(() => useUndoable('start'));

    act(() => result.current.push('edited', { coalesce: false }));
    expect(result.current.present).toBe('edited');

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe('start');
  });

  it('treats a burst of typing as one undo, not thirty', () => {
    const { result } = renderHook(() => useUndoable('a'));

    act(() => {
      result.current.push('ab');
      result.current.push('abc');
      result.current.push('abcd');
    });

    act(() => {
      result.current.undo();
    });

    // One keystroke at a time would make undo useless.
    expect(result.current.present).toBe('a');
  });

  it('keeps a structural change separately undoable inside a burst of typing', () => {
    const { result } = renderHook(() => useUndoable('roles: 2'));

    act(() => result.current.push('roles: 2, typing'));
    // A delete landing mid-burst must not be swallowed by the coalesce window.
    act(() => result.current.push('roles: 1', { coalesce: false }));

    act(() => {
      result.current.undo();
    });

    expect(result.current.present).toBe('roles: 2, typing');
  });

  it('separates edits made after a pause', () => {
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.push('ab'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => result.current.push('abc'));

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe('ab');
  });

  it('redoes what was undone', () => {
    const { result } = renderHook(() => useUndoable('start'));

    act(() => result.current.push('edited', { coalesce: false }));
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });

    expect(result.current.present).toBe('edited');
  });

  it('drops the redo branch once a new edit is made', () => {
    const { result } = renderHook(() => useUndoable('start'));

    act(() => result.current.push('first', { coalesce: false }));
    act(() => {
      result.current.undo();
    });
    act(() => result.current.push('different', { coalesce: false }));

    expect(result.current.canRedo).toBe(false);
  });

  it('does not merge a later edit into a value it just restored', () => {
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.push('b', { coalesce: false }));
    act(() => {
      result.current.undo();
    });
    // Immediately after an undo, so inside the coalesce window.
    act(() => result.current.push('c'));

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toBe('a');
  });

  it('stops at the beginning instead of throwing', () => {
    const { result } = renderHook(() => useUndoable('only'));

    act(() => {
      expect(result.current.undo()).toBeNull();
    });
    expect(result.current.present).toBe('only');
  });

  it('clears history when a different document is loaded', () => {
    const { result } = renderHook(() => useUndoable('first doc'));

    act(() => result.current.push('first doc edited', { coalesce: false }));
    act(() => result.current.reset('second doc'));

    // Undoing into the previous document would be data from another resume.
    expect(result.current.canUndo).toBe(false);
    expect(result.current.present).toBe('second doc');
  });
});
