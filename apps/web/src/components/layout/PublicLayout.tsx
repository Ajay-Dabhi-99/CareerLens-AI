import { ScanLine } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';

export function PublicLayout() {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <ScanLine className="size-5 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight">CareerLens AI</span>
        </Link>

        <nav aria-label="Account" className="ml-auto flex items-center gap-2">
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <ScanLine className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">CareerLens AI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The free check is temporary and is cleared automatically.
          </p>
          <p className="text-xs text-muted-foreground">
            Developed by <span className="font-medium text-foreground">Ajay Dabhi</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
