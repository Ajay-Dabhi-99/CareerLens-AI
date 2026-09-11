import { FileText, Target, TrendingUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { ApiIdentityCard } from '@/features/dashboard/components/ApiIdentityCard';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Upload a resume to get an ATS-style health score and AI-powered suggestions — a Job
          Description is optional.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={FileText} label="Resumes" value="0" hint="Upload your first resume" />
        <StatCard icon={TrendingUp} label="Avg. resume health" value="—" hint="No analysis yet" />
        <StatCard icon={Target} label="Job matches" value="0" hint="Optional, add a JD anytime" />
      </div>

      <ApiIdentityCard />

      <EmptyState
        icon={Upload}
        title="No resumes yet"
        description="Upload a PDF, DOCX or TXT resume to get started. Resume upload arrives in Phase 3."
        action={
          <Button disabled>
            <Upload />
            Upload resume
          </Button>
        }
      />
    </div>
  );
}
