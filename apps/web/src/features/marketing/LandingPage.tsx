import {
  ArrowRight,
  Download,
  FileUp,
  GitCompare,
  Gauge,
  History,
  Lock,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/Reveal';
import { ScorePreview } from '@/features/marketing/components/ScorePreview';
import { cn } from '@/lib/utils';

const AI_FEATURES = [
  { icon: Sparkles, label: 'Full AI review' },
  { icon: GitCompare, label: 'Rewrites you approve' },
  { icon: Target, label: 'Job match' },
  { icon: History, label: 'Version history' },
  { icon: Download, label: 'PDF & DOCX export' },
] as const;

const BENTO = [
  {
    icon: Gauge,
    title: 'Eight weighted categories',
    body: 'Structure, skills, experience, impact, keywords, readability, formatting and completeness — scored separately, with the weighting visible. No black-box number.',
    span: 'md:col-span-2 md:row-span-1',
    accent: 'from-indigo-500/12',
  },
  {
    icon: ShieldCheck,
    title: 'It will not invent facts',
    body: 'Grounded in what your CV actually says. Anything unverifiable is flagged for you to confirm, never asserted.',
    span: '',
    accent: 'from-emerald-500/12',
  },
  {
    icon: Target,
    title: 'Job description optional',
    body: 'CV-only analysis is a complete flow. Paste a job posting when you want matched, partial and missing requirements.',
    span: '',
    accent: 'from-sky-500/12',
  },
  {
    icon: GitCompare,
    title: 'Nothing gets overwritten',
    body: 'Every AI rewrite shows original against suggested. Accept, edit or reject each one — and every version stays restorable.',
    span: 'md:col-span-2',
    accent: 'from-fuchsia-500/12',
  },
] as const;

const STEPS = [
  {
    icon: FileUp,
    title: 'Upload your CV',
    body: 'PDF, DOCX or TXT. It gets parsed into real sections, not just scraped for loose text.',
  },
  {
    icon: Gauge,
    title: 'Get your score',
    body: 'Deterministic checks run first, so the result is repeatable and every point is explainable.',
  },
  {
    icon: Zap,
    title: 'Log in for the AI tools',
    body: 'Full review, rewrites, tailoring per role, version history and export — all behind one login.',
  },
] as const;

export function LandingPage() {
  return (
    <div className="overflow-hidden">
      {/* ---------------- Hero (dark) ---------------- */}
      <section className="relative isolate overflow-hidden bg-[#0a0b14] px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
        {/* Aurora field */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora-a absolute -top-56 left-[8%] size-[34rem] rounded-full bg-indigo-600/35 blur-[120px]" />
          <div className="aurora-b absolute -top-24 right-[4%] size-[30rem] rounded-full bg-cyan-500/25 blur-[120px]" />
          <div className="absolute bottom-[-14rem] left-1/3 size-[28rem] rounded-full bg-fuchsia-600/20 blur-[130px]" />
          <div className="grain-overlay absolute inset-0 opacity-[0.16] mix-blend-overlay" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        </div>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
                <ScanLine className="size-3.5 text-cyan-300" aria-hidden="true" />
                ATS-style CV scoring
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-white text-balance sm:text-6xl">
                Upload your CV.
                <br />
                <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
                  Get your score.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={150}>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/60">
                Instant ATS-style scoring with the reasoning behind every point. No account, no
                email. Log in only when you want the AI tools switched on.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="group h-12 bg-white px-7 text-[#0a0b14] hover:bg-white/90"
                >
                  <Link to="/analyze">
                    <FileUp />
                    Upload my CV
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-12 px-6 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#how">See how it works</a>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={280}>
              <p className="mt-6 text-xs text-white/40">
                PDF, DOCX or TXT · results in seconds · cleared automatically
              </p>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <ScorePreview />
          </Reveal>
        </div>
      </section>

      {/* ---------------- The deal, stated plainly ---------------- */}
      <section aria-labelledby="tiers-heading" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2 id="tiers-heading" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            The whole thing in one line
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Reveal delay={60}>
            <div className="h-full rounded-3xl border border-border bg-card p-8">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Without logging in
              </span>
              <p className="mt-4 text-xl font-semibold">Upload a CV, get the score</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Your Resume Health score plus the basic findings behind it — enough to know where
                you stand. Nothing is stored.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="relative h-full overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent p-8">
              <span className="text-xs font-medium uppercase tracking-wider text-primary">
                Once you log in
              </span>
              <p className="mt-4 text-xl font-semibold">Everything AI turns on</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {AI_FEATURES.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium"
                  >
                    <Icon className="size-3.5 text-primary" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Bento ---------------- */}
      <section aria-labelledby="bento-heading" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="max-w-2xl">
            <h2 id="bento-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Explainable, not just impressive
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Measurable mechanics run as deterministic code. AI handles judgement and rewriting,
              and everything it returns is validated before you ever see it.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {BENTO.map(({ icon: Icon, title, body, span, accent }, index) => (
            <Reveal key={title} delay={index * 70} className={span}>
              <article
                className={cn(
                  'group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-7',
                  'transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5',
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                    accent,
                  )}
                />
                <div className="relative">
                  <div className="mb-5 inline-flex rounded-2xl bg-primary/10 p-3">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Steps ---------------- */}
      <section id="how" aria-labelledby="how-heading" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 id="how-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
          </Reveal>

          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 90} as="li" className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-5xl font-semibold tabular-nums text-muted-foreground/15">
                    {index + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Closing CTA (dark) ---------------- */}
      <section className="px-4 py-20 sm:px-6">
        <Reveal>
          <div className="relative isolate mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[#0a0b14] px-6 py-16 text-center sm:px-12">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="aurora-a absolute -top-32 left-1/4 size-96 rounded-full bg-indigo-600/40 blur-[100px]" />
              <div className="aurora-b absolute -bottom-32 right-1/4 size-80 rounded-full bg-cyan-500/30 blur-[100px]" />
              <div className="grain-overlay absolute inset-0 opacity-[0.14] mix-blend-overlay" />
            </div>

            <h2 className="text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">
              Score your CV before you send it anywhere
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/55">
              Takes seconds and needs nothing from you but the file.
            </p>
            <Button
              asChild
              size="lg"
              className="group mt-8 h-12 bg-white px-7 text-[#0a0b14] hover:bg-white/90"
            >
              <Link to="/analyze">
                <FileUp />
                Upload my CV
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-white/35">
              <Lock className="size-3" aria-hidden="true" />
              Not stored, not shared, cleared automatically
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
