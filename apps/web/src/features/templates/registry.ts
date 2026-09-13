import type { TemplateStyle } from '@/features/templates/ResumeDocument';

export type TemplateId = 'modern' | 'minimal' | 'professional' | 'technical' | 'executive';

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  /** Who it suits, which is the question a person choosing one is asking. */
  bestFor: string;
  style: TemplateStyle;
}

/**
 * The five templates from the spec.
 *
 * They differ in typography, spacing and above all section order — Technical
 * puts skills and projects ahead of employment history, Executive leads with
 * the summary and a long career. None of them changes what the resume says,
 * and all are single-column so a filter reads them in the order a person does.
 */
export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'modern',
    name: 'Modern',
    bestFor: 'Most roles. Clean, with a coloured header that stays readable in black and white.',
    style: {
      order: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'],
      fontClass: 'font-sans',
      nameClass: 'text-[26px] font-bold tracking-tight',
      headingClass:
        'mb-2 border-b-2 border-teal-700 pb-0.5 text-[13px] font-bold uppercase tracking-wider text-teal-800',
      headerClass: 'mb-5 border-l-4 border-teal-700 pl-3',
      sectionGapClass: 'space-y-5',
      bodyClass: 'text-[11.5px] leading-relaxed',
      skillsLayout: 'grouped',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    bestFor: 'Long histories that need to fit on fewer pages. Dense and quiet.',
    style: {
      order: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'],
      fontClass: 'font-sans',
      nameClass: 'text-[22px] font-semibold',
      headingClass: 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500',
      headerClass: 'mb-4',
      sectionGapClass: 'space-y-3.5',
      bodyClass: 'text-[11px] leading-snug',
      skillsLayout: 'inline',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    bestFor: 'Traditional sectors — finance, law, public sector — where convention is expected.',
    style: {
      order: ['summary', 'experience', 'education', 'certifications', 'skills', 'projects'],
      fontClass: 'font-serif',
      nameClass: 'text-center text-[26px] font-semibold',
      headingClass:
        'mb-2 border-b border-neutral-800 pb-0.5 text-[13px] font-semibold uppercase tracking-wide',
      headerClass: 'mb-5 text-center',
      sectionGapClass: 'space-y-4',
      bodyClass: 'text-[11.5px] leading-relaxed',
      skillsLayout: 'grouped',
    },
  },
  {
    id: 'technical',
    name: 'Technical',
    bestFor: 'Engineering and data roles, where the stack is read before the employer.',
    style: {
      order: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
      fontClass: 'font-sans',
      nameClass: 'font-mono text-[24px] font-bold',
      headingClass:
        'mb-2 font-mono text-[12px] font-bold uppercase tracking-wider text-neutral-800 before:mr-1.5 before:text-teal-700 before:content-["//"]',
      headerClass: 'mb-5 border-b border-neutral-300 pb-3',
      sectionGapClass: 'space-y-4',
      bodyClass: 'text-[11.5px] leading-relaxed',
      skillsLayout: 'grouped',
    },
  },
  {
    id: 'executive',
    name: 'Executive',
    bestFor: 'Senior leadership, where the summary and the scope of each role carry the page.',
    style: {
      order: ['summary', 'experience', 'education', 'certifications', 'skills', 'projects'],
      fontClass: 'font-serif',
      nameClass: 'text-[30px] font-bold tracking-tight',
      headingClass:
        'mb-2.5 text-[14px] font-bold uppercase tracking-[0.12em] text-neutral-900 after:mt-1 after:block after:h-px after:w-12 after:bg-neutral-900',
      headerClass: 'mb-6',
      sectionGapClass: 'space-y-6',
      bodyClass: 'text-[12px] leading-relaxed',
      skillsLayout: 'inline',
    },
  },
];

export const DEFAULT_TEMPLATE: TemplateId = 'modern';

/**
 * Resolves a stored template id.
 *
 * An unknown value — a template removed later, or a hand-edited record — falls
 * back to the default rather than rendering nothing, because a resume that
 * cannot be displayed is worse than one in a different style.
 */
export function templateById(id: unknown): TemplateDefinition {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]!;
}
