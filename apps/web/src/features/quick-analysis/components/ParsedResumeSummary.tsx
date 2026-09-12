import { Briefcase, GraduationCap, Mail, MapPin, Phone, User, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ParsedResumePreview } from '@/features/quick-analysis/api/quickAnalysisApi';

export interface ParsedResumeSummaryProps {
  resume: ParsedResumePreview;
  detectedSections: string[];
}

const ALL_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
] as const;

export function ParsedResumeSummary({ resume, detectedSections }: ParsedResumeSummaryProps) {
  const contact = [
    resume.personal.email ? { icon: Mail, value: resume.personal.email } : null,
    resume.personal.phone ? { icon: Phone, value: resume.personal.phone } : null,
    resume.personal.location ? { icon: MapPin, value: resume.personal.location } : null,
  ].filter((item): item is { icon: typeof Mail; value: string } => item !== null);

  return (
    <Card data-testid="parsed-summary">
      <CardHeader>
        <CardTitle>What we read from your CV</CardTitle>
        <CardDescription>
          This is the structure we extracted. If something looks wrong here, an ATS will likely
          misread it too.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">
              {resume.personal.fullName || (
                <span className="text-muted-foreground">No name detected</span>
              )}
            </span>
          </div>
          {contact.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
              {contact.map(({ icon: Icon, value }) => (
                <li key={value} className="flex items-center gap-1.5">
                  <Icon className="size-3" aria-hidden="true" />
                  {value}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pl-6 text-xs text-muted-foreground">No contact details detected</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sections detected
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_SECTIONS.map((section) => {
              const found = detectedSections.includes(section);
              return (
                <Badge key={section} variant={found ? 'success' : 'outline'}>
                  {found ? '' : 'No '}
                  {section}
                </Badge>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Briefcase className="size-3.5" aria-hidden="true" />
              Roles
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{resume.experience.length}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wrench className="size-3.5" aria-hidden="true" />
              Skills
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {resume.skills.reduce((total, group) => total + group.skills.length, 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GraduationCap className="size-3.5" aria-hidden="true" />
              Education
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{resume.education.length}</p>
          </div>
        </div>

        {resume.experience.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Roles found
            </p>
            <ul className="space-y-1.5">
              {resume.experience.slice(0, 4).map((role) => (
                <li key={role.id} className="text-sm">
                  <span className="font-medium">{role.title || 'Untitled role'}</span>
                  {role.company ? (
                    <span className="text-muted-foreground"> at {role.company}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · {role.bullets.length} bullet{role.bullets.length === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
