import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /**
   * When this changes, a caught error is cleared. Keyed on the route, so moving
   * to another page recovers without a reload instead of carrying one page's
   * crash onto the next.
   */
  resetKey?: string;
  /** Shown above the actions; the full-page boundary words it differently. */
  title?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches a rendering crash and shows a way forward instead of a blank page.
 *
 * Without one, any thrown render error unmounts the whole React tree and the
 * user is left looking at white — with no idea whether their work was saved.
 * The message says plainly that saved work is safe, because in this product it
 * is: every edit is persisted by the server, and nothing lives only in the page.
 *
 * The error detail is logged, never shown. A stack trace means nothing to the
 * person reading it and can reveal internals to someone who shouldn't see them.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The one place a render crash is recorded. A monitoring service would hook
    // in here in production.
    console.error('Render error caught by boundary', error, info.componentStack);
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
      >
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">{this.props.title ?? 'This page ran into a problem'}</h2>
          <p className="text-sm text-muted-foreground">
            Anything you had already saved is safe. Try again, or reload the page if it keeps
            happening.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={this.reset}>
            <RotateCcw />
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
