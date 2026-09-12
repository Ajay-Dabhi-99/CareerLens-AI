import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutosave } from './useAutosave';

class StaleError extends Error {}

/**
 * Lets queued promise callbacks run.
 *
 * testing-library's waitFor polls on a timer, which fake timers freeze, so it
 * deadlocks here. Flushing the microtask queue explicitly is what these tests
 * actually need: the work is already queued, it just has not run yet.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches a burst of typing into a single save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<string>({ save }));

    act(() => {
      result.current.schedule('a');
      result.current.schedule('ab');
      result.current.schedule('abc');
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
  });

  it('does not claim "saved" until the server has confirmed it', async () => {
    let resolve!: () => void;
    const save = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const { result } = renderHook(() => useAutosave<string>({ save }));

    act(() => result.current.schedule('draft'));
    expect(result.current.status.kind).toBe('pending');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status.kind).toBe('saving');

    await act(async () => {
      resolve();
    });
    await flush();
    expect(result.current.status.kind).toBe('saved');
  });

  it('keeps an edit made while a save was in flight', async () => {
    let resolveFirst!: () => void;
    const save = vi
      .fn()
      .mockReturnValueOnce(new Promise<void>((r) => (resolveFirst = r)))
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useAutosave<string>({ save }));

    act(() => result.current.schedule('first'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // Typed while the first request was still open. Dropping this is silent
    // data loss, which is the worst kind.
    act(() => result.current.schedule('second'));

    await act(async () => {
      resolveFirst();
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('second');
  });

  it('reports a failure and can retry the exact value that failed', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<string>({ save }));

    act(() => result.current.schedule('work'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flush();
    expect(result.current.status.kind).toBe('error');
    const status = result.current.status;
    if (status.kind !== 'error') throw new Error('expected an error status');
    expect(status.message).toBe('offline');

    await act(async () => {
      status.retry();
    });

    await flush();
    expect(result.current.status.kind).toBe('saved');
    expect(save).toHaveBeenLastCalledWith('work');
  });

  it('never retries a conflict, because that would overwrite the other change', async () => {
    const save = vi.fn().mockRejectedValue(new StaleError('changed somewhere else'));
    const { result } = renderHook(() =>
      useAutosave<string>({ save, isConflict: (e) => e instanceof StaleError }),
    );

    act(() => result.current.schedule('mine'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await flush();
    expect(result.current.status.kind).toBe('conflict');

    // Further typing must not quietly clear the conflict and resume saving over
    // whatever the other tab wrote.
    act(() => result.current.schedule('mine again'));
    expect(result.current.status.kind).toBe('conflict');
  });

  it('saves immediately when asked, without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<string>({ save }));

    act(() => result.current.schedule('urgent'));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(save).toHaveBeenCalledWith('urgent');
  });
});
