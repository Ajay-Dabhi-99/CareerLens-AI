import { Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useApiHealth } from '@/hooks/useApiHealth';

const STATUS_COPY: Record<ReturnType<typeof useApiHealth>, string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API offline',
};

const STATUS_VARIANT = {
  checking: 'secondary',
  online: 'success',
  offline: 'destructive',
} as const;

export function ApiStatusBadge() {
  const status = useApiHealth();

  return (
    <Badge variant={STATUS_VARIANT[status]} className="gap-1.5" data-testid="api-status">
      <Circle className="size-2 fill-current" aria-hidden="true" />
      {STATUS_COPY[status]}
    </Badge>
  );
}
