import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {user?.email ? (
        <span
          className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline"
          title={user.email}
        >
          {user.email}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="Log out"
      >
        <LogOut />
        <span className="hidden sm:inline">{signingOut ? 'Logging out…' : 'Log out'}</span>
      </Button>
    </div>
  );
}
