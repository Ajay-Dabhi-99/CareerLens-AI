import { Check, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LockedPremiumGrid } from '@/features/analyze/components/LockedPremiumGrid';

const FREE_INCLUDES = [
  'Overall Resume Health / ATS-style score',
  'A few basic findings on structure and formatting',
  'Whether your core sections are detected correctly',
];

export function AnalyzePage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Free resume check</h1>
          <Badge variant="secondary">No account needed</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a PDF, DOCX or TXT resume to get an ATS-style score. Your file and results are
          temporary and are deleted automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload your resume</CardTitle>
          <CardDescription>PDF, DOCX or TXT. Nothing is saved to an account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Upload arrives in Phase 3</p>
              <p className="text-sm text-muted-foreground">
                The anonymous quick-analysis pipeline is being built next.
              </p>
            </div>
            <Button disabled>
              <Upload />
              Choose file
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="free-heading" className="space-y-3">
        <h2 id="free-heading" className="text-base font-semibold">
          What you get without an account
        </h2>
        <ul className="space-y-2">
          {FREE_INCLUDES.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <LockedPremiumGrid />
    </div>
  );
}
