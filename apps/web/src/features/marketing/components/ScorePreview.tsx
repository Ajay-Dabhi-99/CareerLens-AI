import type { CSSProperties } from 'react';
import { Check, TriangleAlert } from 'lucide-react';

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SAMPLE_SCORE = 78;

/** Illustrative only — category names mirror the real ATS scoring model. */
const SAMPLE_CATEGORIES = [
  { label: 'Structure', value: 92 },
  { label: 'Skills', value: 81 },
  { label: 'Impact', value: 54 },
  { label: 'Readability', value: 74 },
] as const;

const SAMPLE_FINDINGS = [
  { tone: 'good' as const, text: 'All core sections detected' },
  { tone: 'warn' as const, text: '7 bullets have no measurable outcome' },
];

function barTone(value: number): string {
  if (value >= 80) return 'bg-emerald-400';
  if (value >= 65) return 'bg-sky-400';
  return 'bg-amber-400';
}

export function ScorePreview() {
  const offset = CIRCUMFERENCE * (1 - SAMPLE_SCORE / 100);

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-white/15 to-transparent blur-2xl"
      />

      <div className="relative rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Resume Health</p>
            <p className="text-xs text-white/50">Weighted across 8 categories</p>
          </div>
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-white/60">
            Sample
          </span>
        </div>

        <div className="mt-6 flex items-center gap-6">
          <div className="relative shrink-0">
            <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r={RADIUS} fill="none" strokeWidth="9" className="stroke-white/10" />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <circle
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                stroke="url(#scoreGradient)"
                className="animate-ring"
                style={
                  {
                    strokeDasharray: CIRCUMFERENCE,
                    strokeDashoffset: offset,
                    transform: 'rotate(-90deg)',
                    transformOrigin: '70px 70px',
                    '--ring-circumference': `${CIRCUMFERENCE}`,
                    '--ring-offset': `${offset}`,
                  } as CSSProperties
                }
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="animate-count text-4xl font-semibold tabular-nums text-white">
                {SAMPLE_SCORE}
              </span>
              <span className="text-[0.65rem] uppercase tracking-wide text-white/45">
                out of 100
              </span>
            </div>
          </div>

          <ul className="flex-1 space-y-3">
            {SAMPLE_CATEGORIES.map((category, index) => (
              <li key={category.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs text-white/70">
                  <span className="font-medium">{category.label}</span>
                  <span className="tabular-nums text-white/40">{category.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`animate-sweep h-full rounded-full ${barTone(category.value)}`}
                    style={{
                      width: `${category.value}%`,
                      animationDelay: `${500 + index * 130}ms`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-6 space-y-2 border-t border-white/10 pt-4">
          {SAMPLE_FINDINGS.map((finding) => (
            <li key={finding.text} className="flex items-start gap-2 text-xs text-white/70">
              {finding.tone === 'good' ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-amber-400"
                  aria-hidden="true"
                />
              )}
              {finding.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
