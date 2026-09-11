import { Target } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export function JobMatchPage() {
  return (
    <EmptyState
      icon={Target}
      title="Job matching isn't built yet"
      description="Paste or upload a Job Description to see matched, partial and missing skills. Arrives in Phases 12-13. Always optional — resume analysis works without it."
    />
  );
}
