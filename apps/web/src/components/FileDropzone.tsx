import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACCEPTED_EXTENSIONS } from '@/lib/upload';
import { cn } from '@/lib/utils';

export interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  selectedFile?: File | null;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  onFileSelected,
  selectedFile,
  onClear,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }

  if (selectedFile) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border bg-card p-4',
          className,
        )}
      >
        <div className="rounded-lg bg-primary/10 p-2.5">
          <FileText className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(selectedFile.size)}</p>
        </div>
        {onClear ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            disabled={disabled}
            aria-label="Remove file"
          >
            <X />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'rounded-xl border border-dashed p-8 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border',
        disabled && 'opacity-60',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          // Allow re-selecting the same file after a failure.
          event.target.value = '';
        }}
      />

      <Upload className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">Drag your CV here</p>
      <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX or TXT, up to 5 MB</p>

      <Button
        type="button"
        variant="outline"
        className="mt-4"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>
    </div>
  );
}
