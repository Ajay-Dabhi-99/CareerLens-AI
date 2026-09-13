import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoadingState } from '@/components/LoadingState';
import { LoginPage, ProtectedRoute, SignupPage } from '@/features/auth';
import { LandingPage } from '@/features/marketing';
import { NotFoundPage } from '@/app/NotFoundPage';

/*
 * Everything behind a login, and the analysis page, is loaded when first
 * visited rather than up front.
 *
 * The app shipped as a single 1 MB bundle, so the public landing page — the
 * first thing a new visitor sees, often on a phone — downloaded the whole rich
 * text editor, the diff viewer and every template before it could show a
 * headline. The landing and sign-in pages stay in the main bundle because they
 * are where a first visit starts; the rest arrives when someone gets there.
 */
const QuickAnalysisPage = lazy(() =>
  import('@/features/quick-analysis').then((m) => ({ default: m.QuickAnalysisPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const ResumePage = lazy(() => import('@/features/resume').then((m) => ({ default: m.ResumePage })));
const EditorPage = lazy(() => import('@/features/editor').then((m) => ({ default: m.EditorPage })));
const TemplatePreviewPage = lazy(() =>
  import('@/features/templates').then((m) => ({ default: m.TemplatePreviewPage })),
);
const JobMatchPage = lazy(() =>
  import('@/features/job-match').then((m) => ({ default: m.JobMatchPage })),
);
const VersionsPage = lazy(() =>
  import('@/features/versions').then((m) => ({ default: m.VersionsPage })),
);

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <Routes>
        {/* Public: no account required */}
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="analyze" element={<QuickAnalysisPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Private: account required */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="resumes" element={<ResumePage />} />
            <Route path="editor/:id" element={<EditorPage />} />
            <Route path="editor/:id/preview" element={<TemplatePreviewPage />} />
            <Route path="job-match" element={<JobMatchPage />} />
            <Route path="versions" element={<VersionsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
