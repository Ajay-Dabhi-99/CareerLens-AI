import { FileText, History, LayoutDashboard, Target, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/resumes', label: 'Resumes', icon: FileText, end: false },
  { to: '/job-match', label: 'Job Match', icon: Target, end: false },
  { to: '/versions', label: 'Versions', icon: History, end: false },
] as const;

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight">CareerLens AI</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

export { NAV_ITEMS };
