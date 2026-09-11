import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { NAV_ITEMS, Sidebar } from '@/components/layout/Sidebar';

function useCurrentPageTitle(): string {
  const { pathname } = useLocation();
  const match = NAV_ITEMS.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label ?? 'CareerLens AI';
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const title = useCurrentPageTitle();

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-svh flex-1 flex-col">
        <Header title={title} onOpenSidebar={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
