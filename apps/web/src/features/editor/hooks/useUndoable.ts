import { useCallback, useRef, useState } from 'react';

/**
 * Document-level undo for the whole resume.
 *
 * TipTap gives each text field its own history, which covers typing and
 * nothing else. Removing a role, adding a project or reverting to the original
 * happen above that layer, so without this they are permanent the moment
 * autosave fires. Deleting six years of work history with no way back is not an
 * acceptable outcome of a mis-click.
 *
 * State lives in a ref as well as in React state: callers need to read the
 * current value synchronously when deciding what to push, and a stale closure
 * there would silently drop an edit.
 */

/** Successive edits closer together than this are treated as one action. */
const COALESCE_MS = 700;

/** Bounded so a long session cannot grow memory without limit. */
const MAX_HISTORY = 100;

export interface PushOptions {
  /**
   * When false, always starts a new history entry. Structural changes — adding
   * or removing an entry — must be separately undoable even if they land in
   * the middle of a burst of typing.
   */
  coalesce?: boolean;
}

export function useUndoable<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const presentRef = useRef<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastPushAt = useRef(0);

  // Tracked in state purely so buttons re-render as availability changes.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback((next: T) => {
    presentRef.current = next;
    setPresent(next);
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  const push = useCallback(
    (next: T, { coalesce = true }: PushOptions = {}) => {
      const now = Date.now();
      const merge = coalesce && now - lastPushAt.current < COALESCE_MS && past.current.length > 0;

      if (!merge) {
        past.current.push(presentRef.current);
        if (past.current.length > MAX_HISTORY) past.current.shift();
      }

      // Any new edit invalidates the redo branch, as in every editor.
      future.current = [];
      lastPushAt.current = now;
      sync(next);
    },
    [sync],
  );

  const undo = useCallback((): T | null => {
    const previous = past.current.pop();
    if (previous === undefined) return null;

    future.current.push(presentRef.current);
    // A following edit must not merge into the entry we just restored.
    lastPushAt.current = 0;
    sync(previous);
    return previous;
  }, [sync]);

  const redo = useCallback((): T | null => {
    const next = future.current.pop();
    if (next === undefined) return null;

    past.current.push(presentRef.current);
    lastPushAt.current = 0;
    sync(next);
    return next;
  }, [sync]);

  /** Replaces the value and clears history, for loading a fresh document. */
  const reset = useCallback(
    (value: T) => {
      past.current = [];
      future.current = [];
      lastPushAt.current = 0;
      sync(value);
    },
    [sync],
  );

  return { present, presentRef, push, undo, redo, reset, canUndo, canRedo };
}
