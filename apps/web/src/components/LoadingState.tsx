import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  rows?: number;
  className?: string;
}

export function LoadingState({ rows = 3, className }: LoadingStateProps) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}
