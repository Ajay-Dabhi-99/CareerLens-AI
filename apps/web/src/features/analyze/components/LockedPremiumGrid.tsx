import { Download, GitCompare, History, PencilLine, Sparkles, Target } from 'lucide-react';
import { LockedFeature } from '@/components/LockedFeature';

const LOCKED_FEATURES = [
  {
    icon: Sparkles,
    title: 'Full AI review',
    description:
      'Section-by-section strengths and weaknesses, prioritised actions, and why each one matters.',
    previewLines: ['a', 'b', 'c'],
  },
  {
    icon: PencilLine,
    title: 'AI rewrites in the editor',
    description:
      'Rewrite your summary, bullets and projects with controlled options you approve one by one.',
    previewLines: ['a', 'b'],
  },
  {
    icon: GitCompare,
    title: 'Diff and approvals',
    description: 'See original vs. suggested side by side, then Accept, Edit or Reject each change.',
    previewLines: ['a', 'b'],
  },
  {
    icon: History,
    title: 'Version history',
    description: 'Every meaningful change saved, comparable and restorable. Nothing overwritten.',
    previewLines: ['a', 'b', 'c'],
  },
  {
    icon: Target,
    title: 'Job description matching',
    description:
      'Paste a job description to see matched, partial and missing skills, then tailor a version for it.',
    previewLines: ['a', 'b', 'c'],
  },
  {
    icon: Download,
    title: 'PDF and DOCX export',
    description: 'Download your polished resume in multiple templates with an A4 preview.',
    previewLines: ['a', 'b'],
  },
] as const;

export function LockedPremiumGrid() {
  return (
    <section aria-labelledby="unlock-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="unlock-heading" className="text-base font-semibold">
          Unlock with a free account
        </h2>
        <p className="text-sm text-muted-foreground">
          Your quick check covers the basics. Everything below needs an account so your work can
          be saved and stays yours.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOCKED_FEATURES.map((feature) => (
          <LockedFeature
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            previewLines={[...feature.previewLines]}
          />
        ))}
      </div>
    </section>
  );
}
