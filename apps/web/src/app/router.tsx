import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard';
import { ResumePage } from '@/features/resume';
import { JobMatchPage } from '@/features/job-match';
import { VersionsPage } from '@/features/versions';
import { NotFoundPage } from '@/app/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="resumes" element={<ResumePage />} />
        <Route path="job-match" element={<JobMatchPage />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
