import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoginPage, ProtectedRoute, SignupPage } from '@/features/auth';
import { LandingPage } from '@/features/marketing';
import { AnalyzePage } from '@/features/analyze';
import { DashboardPage } from '@/features/dashboard';
import { ResumePage } from '@/features/resume';
import { JobMatchPage } from '@/features/job-match';
import { VersionsPage } from '@/features/versions';
import { NotFoundPage } from '@/app/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      {/* Public: no account required */}
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="analyze" element={<AnalyzePage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Private: account required */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="resumes" element={<ResumePage />} />
          <Route path="job-match" element={<JobMatchPage />} />
          <Route path="versions" element={<VersionsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
