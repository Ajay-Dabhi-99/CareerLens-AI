import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/features/auth';
import { AppRouter } from '@/app/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function App() {
  return (
    // The outermost net: catches anything the page-level boundary cannot, such
    // as a crash in the auth provider itself, so there is never a blank screen.
    <ErrorBoundary title="Something went wrong">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
