import { useEffect, useState } from 'react';
import { getHealth } from './lib/api';

type ApiStatus = 'checking' | 'online' | 'offline';

export default function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) setApiStatus('online');
      })
      .catch(() => {
        if (!cancelled) setApiStatus('offline');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <h1>CareerLens AI</h1>
      <p className="tagline">AI-Powered Resume Intelligence &amp; Job Matching Platform</p>
      <p data-testid="api-status" className={`api-status api-status--${apiStatus}`}>
        API status: {apiStatus}
      </p>
    </main>
  );
}
