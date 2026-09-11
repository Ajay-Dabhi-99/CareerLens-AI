import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiStatusBadge } from '@/components/layout/ApiStatusBadge';
import { UserMenu } from '@/components/layout/UserMenu';

export interface HeaderProps {
  title: string;
  onOpenSidebar: () => void;
}

export function Header({ title, onOpenSidebar }: HeaderProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        onClick={onOpenSidebar}
        className="lg:hidden"
      >
        <Menu />
      </Button>
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-3">
        <ApiStatusBadge />
        <UserMenu />
      </div>
    </header>
  );
}
