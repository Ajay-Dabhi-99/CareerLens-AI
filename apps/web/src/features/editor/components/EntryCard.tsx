import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** One repeated entry (a role, a project, a qualification) with a way to remove it. */
export function EntryCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
        <Button variant="ghost" size="icon" aria-label={removeLabel} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {children}
    </div>
  );
}

/** A labelled text input. Every field on a resume needs a real label, not a placeholder. */
export function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
