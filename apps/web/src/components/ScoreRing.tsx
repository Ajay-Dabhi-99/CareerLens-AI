import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function scoreTone(score: number): { ring: string; text: string; label: string } {
  if (score >= 80) return { ring: 'stroke-success', text: 'text-success', label: 'Strong' };
  if (score >= 60) return { ring: 'stroke-primary', text: 'text-primary', label: 'Decent' };
  if (score >= 40) return { ring: 'stroke-warning', text: 'text-warning', label: 'Needs work' };
  return { ring: 'stroke-destructive', text: 'text-destructive', label: 'Needs a rework' };
}

export function barTone(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-warning';
  return 'bg-destructive';
}

export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  const offset = CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className={cn('relative shrink-0', className)}>
      <svg width="136" height="136" viewBox="0 0 136 136" aria-hidden="true">
        <circle cx="68" cy="68" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="68"
          cy="68"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={cn('animate-ring', tone.ring)}
          style={
            {
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: offset,
              transform: 'rotate(-90deg)',
              transformOrigin: '68px 68px',
              '--ring-circumference': `${CIRCUMFERENCE}`,
              '--ring-offset': `${offset}`,
            } as CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums" data-testid="final-score">
          {score}
        </span>
        <span className={cn('text-xs font-medium', tone.text)}>{tone.label}</span>
      </div>
    </div>
  );
}
