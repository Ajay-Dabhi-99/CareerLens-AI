import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string; retry: () => void }
  | { kind: 'conflict'; message: string };

/** Long enough to batch a burst of typing, short enough that nobody notices. */
const DEBOUNCE_MS = 1200;

export interface AutosaveOptions<T> {
  /** Performs the save. Rejecting with a StaleDraftError surfaces as a conflict. */
  save: (value: T) => Promise<void>;
  /** Named so a conflict can be reported differently from an ordinary failure. */
  isConflict?: (error: unknown) => boolean;
}

/**
 * Debounced autosave with an honest status.
 *
 * Two things this deliberately does not do. It does not report "saved" until
 * the server has said so, because a draft that only exists in a textarea is not
 * saved. And it does not retry a conflict: if the draft moved on elsewhere,
 * sending the same edit again would overwrite whatever moved it.
 */
export function useAutosave<T>({ save, isConflict }: AutosaveOptions<T>) {
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const inFlight = useRef(false);
  /** Kept in a ref so a save queued during typing uses the current callback. */
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current === null) return;

    const value = pending.current;
    pending.current = null;
    inFlight.current = true;
    setStatus({ kind: 'saving' });

    try {
      await saveRef.current(value);
      setStatus({ kind: 'saved', at: Date.now() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Your changes could not be saved.';

      if (isConflict?.(error)) {
        // Retrying would overwrite whatever changed. The user has to decide.
        setStatus({ kind: 'conflict', message });
      } else {
        setStatus({
          kind: 'error',
          message,
          retry: () => {
            pending.current = value;
            void flush();
          },
        });
      }
    } finally {
      inFlight.current = false;

      // Something arrived while we were saving; it must not be dropped.
      if (pending.current !== null) void flush();
    }
  }, [isConflict]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = value;
      setStatus((current) => (current.kind === 'conflict' ? current : { kind: 'pending' }));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  /** Saves immediately, for leaving the page or an explicit save action. */
  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    return flush();
  }, [flush]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /*
   * A pending edit at page-close would otherwise be lost in the debounce
   * window. This cannot save asynchronously during unload, so it warns instead
   * of pretending the work is safe.
   */
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (pending.current === null && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { status, schedule, saveNow };
}
