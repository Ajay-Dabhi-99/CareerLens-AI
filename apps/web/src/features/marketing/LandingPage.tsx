import { ArrowRight, FileSearch, Gauge, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const HIGHLIGHTS = [
  {
    icon: Gauge,
    title: 'ATS-style health score',
    description:
      'A transparent, weighted score across structure, skills, impact, readability and formatting — with the reasoning shown, not just a number.',
  },
  {
    icon: FileSearch,
    title: 'Works without a job description',
    description:
      'Resume-only analysis is a complete flow. Add a job description later if you want targeted matching.',
  },
  {
    icon: ShieldCheck,
    title: 'Never invents facts',
    description:
      'Suggestions are grounded in what your resume actually says. Anything uncertain is flagged for you to verify.',
  },
];

export function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          See how your resume scores — before you sign up
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground">
          Upload your resume and get an ATS-style health score in seconds. No account needed for
          the basics. Create a free account when you want the full AI review, editing, tailoring
          and export.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/analyze">
              Analyze my resume
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/signup">Create free account</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Analysis without an account is temporary and deleted automatically.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="space-y-2">
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
