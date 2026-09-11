import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getMe, type MeResponse } from '@/lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: MeResponse };

export function ApiIdentityCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    getMe()
      .then((data) => setState({ kind: 'loaded', data }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not reach the API',
        }),
      );
  }, []);

  useEffect(load, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          Verified by the API
        </CardTitle>
        <CardDescription>
          Identity confirmed server-side from your session token, not just the browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' ? <LoadingState rows={2} /> : null}
        {state.kind === 'error' ? (
          <ErrorState description={state.message} onRetry={load} />
        ) : null}
        {state.kind === 'loaded' ? (
          <dl className="space-y-1 text-sm" data-testid="api-identity">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{state.data.user?.email ?? 'unknown'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="truncate font-mono text-xs">{state.data.user?.id ?? 'unknown'}</dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
