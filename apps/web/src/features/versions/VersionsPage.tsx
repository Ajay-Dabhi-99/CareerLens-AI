import { History } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export function VersionsPage() {
  return (
    <EmptyState
      icon={History}
      title="No versions yet"
      description="Every meaningful resume state will be restorable and comparable here. Arrives in Phase 11."
    />
  );
}
