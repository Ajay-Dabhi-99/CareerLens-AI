import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export function ResumePage() {
  return (
    <EmptyState
      icon={FileText}
      title="Resume upload isn't built yet"
      description="Upload, parsing and ATS-style analysis arrive in Phases 3-5."
    />
  );
}
