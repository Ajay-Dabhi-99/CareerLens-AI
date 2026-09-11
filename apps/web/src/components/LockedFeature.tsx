import type { ComponentType } from 'react';
import { Lock } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface LockedFeatureProps {
  icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  /** Short labels hinting at the shape of the locked content (never real data). */
  previewLines?: string[];
  className?: string;
}

/**
 * Teaser for a feature that requires an account.
 *
 * Renders only placeholder shapes — gated content is never sent to an anonymous
 * client, so there is nothing real here to blur or reveal via devtools.
 */
export function LockedFeature({
  icon: Icon,
  title,
  description,
  previewLines = [],
  className,
}: LockedFeatureProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{title}</h3>
              <Lock className="size-3 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {previewLines.length > 0 ? (
          <ul aria-hidden="true" className="space-y-2 select-none">
            {previewLines.map((line, index) => (
              <li key={line} className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                <span
                  className="h-3 rounded bg-muted"
                  style={{ width: `${Math.max(35, 80 - index * 12)}%` }}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/signup">Log in to unlock</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
