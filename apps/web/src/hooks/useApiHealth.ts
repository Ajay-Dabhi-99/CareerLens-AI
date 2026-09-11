import { useEffect, useState } from 'react';
import { getHealth } from '@/lib/api';

export type ApiHealthStatus = 'checking' | 'online' | 'offline';

export function useApiHealth(): ApiHealthStatus {
  const [status, setStatus] = useState<ApiHealthStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) setStatus('online');
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
