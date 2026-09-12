import { useCallback, useRef, useState } from 'react';
import { requestRewrite, type RewriteTarget } from '@/features/editor/api/editorApi';
import type { RewriteState } from '@/features/editor/components/RewritePanel';

/**
 * Runs one rewrite at a time, anywhere in the editor.
 *
 * Single-slot on purpose. Two panels open at once would mean two AI calls in
 * flight against a small free-tier quota, and a user deciding between
 * suggestions for two different parts of their resume at the same time.
 *
 * The panel never applies anything itself: `start` is handed the function that
 * would apply a choice, and it is only ever called from `accept`.
 */
export function useRewriteController(resumeId: string | undefined) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [state, setState] = useState<RewriteState>({ kind: 'idle' });
  const [currentText, setCurrentText] = useState('');

  const apply = useRef<((text: string) => void) | null>(null);
  const lastRequest = useRef<{ target: RewriteTarget; text: string } | null>(null);

  const run = useCallback(
    async (target: RewriteTarget, text: string) => {
      if (!resumeId) return;
      setState({ kind: 'loading' });

      try {
        const { options } = await requestRewrite(resumeId, target, text);
        setState({ kind: 'ready', options });
      } catch (error) {
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'That rewrite could not be generated.',
        });
      }
    },
    [resumeId],
  );

  const start = useCallback(
    (key: string, target: RewriteTarget, text: string, applyChoice: (next: string) => void) => {
      if (!text.trim()) {
        setActiveKey(key);
        setCurrentText('');
        setState({
          kind: 'error',
          message: 'Write something first — there is nothing here to improve yet.',
        });
        return;
      }

      apply.current = applyChoice;
      lastRequest.current = { target, text };
      setActiveKey(key);
      setCurrentText(text);
      void run(target, text);
    },
    [run],
  );

  const accept = useCallback((text: string) => {
    apply.current?.(text);
    apply.current = null;
    setActiveKey(null);
    setState({ kind: 'idle' });
  }, []);

  const dismiss = useCallback(() => {
    apply.current = null;
    setActiveKey(null);
    setState({ kind: 'idle' });
  }, []);

  const retry = useCallback(() => {
    const previous = lastRequest.current;
    if (previous) void run(previous.target, previous.text);
  }, [run]);

  return { activeKey, state, currentText, start, accept, dismiss, retry };
}

export type RewriteController = ReturnType<typeof useRewriteController>;
