import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { diffWords } from '@/features/editor/lib/diff';
import { DiffView } from '@/features/editor/components/DiffView';
import { cn } from '@/lib/utils';
import type { ResumeData } from '@/features/editor/api/editorApi';

/**
 * Flattens a resume into comparable, named pieces of text.
 *
 * Comparing two whole documents as one blob produces a diff nobody reads. A
 * resume is already a list of sections, so the comparison follows that shape
 * and names which part changed.
 */
function sectionsOf(resume: ResumeData): Array<{ key: string; label: string; text: string }> {
  const sections = [
    { key: 'name', label: 'Name', text: resume.personal.fullName },
    { key: 'contact', label: 'Contact', text: [resume.personal.email, resume.personal.phone, resume.personal.location].filter(Boolean).join(' · ') },
    { key: 'summary', label: 'Summary', text: resume.summary },
  ];

  resume.experience.forEach((role, index) => {
    sections.push({
      key: `experience-${index}`,
      label: `${role.title || 'Role'}${role.company ? ` at ${role.company}` : ''}`,
      text: role.bullets.map((bullet) => `• ${bullet.text}`).join('\n'),
    });
  });

  resume.projects.forEach((project, index) => {
    sections.push({
      key: `project-${index}`,
      label: project.name || `Project ${index + 1}`,
      text: [project.description, ...project.bullets.map((bullet) => `• ${bullet.text}`)]
        .filter(Boolean)
        .join('\n'),
    });
  });

  sections.push({
    key: 'skills',
    label: 'Skills',
    text: resume.skills.map((group) => `${group.category}: ${group.skills.join(', ')}`).join('\n'),
  });

  sections.push({
    key: 'education',
    label: 'Education',
    text: resume.education
      .map((entry) => [entry.degree, entry.institution].filter(Boolean).join(', '))
      .join('\n'),
  });

  return sections;
}

export function VersionCompare({
  leftName,
  rightName,
  leftScore,
  rightScore,
  left,
  right,
}: {
  leftName: string;
  rightName: string;
  leftScore: number;
  rightScore: number;
  left: ResumeData;
  right: ResumeData;
}) {
  const sections = useMemo(() => {
    const leftSections = sectionsOf(left);
    const rightSections = sectionsOf(right);
    const keys = [...new Set([...leftSections.map((s) => s.key), ...rightSections.map((s) => s.key)])];

    return keys
      .map((key) => {
        const a = leftSections.find((s) => s.key === key);
        const b = rightSections.find((s) => s.key === key);
        return {
          key,
          label: b?.label ?? a?.label ?? key,
          before: a?.text ?? '',
          after: b?.text ?? '',
        };
      })
      .filter((section) => section.before !== section.after);
  }, [left, right]);

  const delta = rightScore - leftScore;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="text-muted-foreground">{leftName}</span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>{rightName}</span>
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-xs tabular-nums',
              delta > 0
                ? 'bg-success/10 text-success'
                : delta < 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {leftScore} → {rightScore}
            {delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            These two versions are identical. Nothing has changed between them.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="space-y-1.5">
              <h4 className="text-sm font-semibold">{section.label}</h4>
              {section.before && section.after ? (
                <DiffView before={section.before} after={section.after} />
              ) : (
                // A whole section appearing or disappearing is worth saying in
                // words; a diff of something against nothing is just the text.
                <p className="rounded-lg border border-border bg-background p-2.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    {section.after ? 'Added in this version: ' : 'Removed in this version: '}
                  </span>
                  {section.after || section.before}
                </p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Exported for tests: the section flattening is the part worth pinning down. */
export { sectionsOf, diffWords };
