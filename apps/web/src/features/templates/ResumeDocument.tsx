import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ResumeBullet, ResumeData } from '@/features/editor/api/editorApi';
import {
  contactItems,
  dateRange,
  printableBullets,
  visibleSections,
  type SectionKey,
} from '@/features/templates/lib/format';

/**
 * How a template looks. Everything a template may vary lives here, and nothing
 * about what the resume says does.
 *
 * Five templates are five of these objects rendered by one component, rather
 * than five components. Five copies of the rendering logic would be five places
 * to forget an empty-section check or print a date differently, and the
 * templates would drift into disagreeing about the content itself.
 */
export interface TemplateStyle {
  /** Section order. Changing emphasis is the main thing a template is for. */
  order: SectionKey[];
  fontClass: string;
  nameClass: string;
  headingClass: string;
  /** Wraps the header, for templates that set it apart. */
  headerClass: string;
  /** Vertical rhythm between sections. */
  sectionGapClass: string;
  bodyClass: string;
  skillsLayout: 'inline' | 'grouped';
}

export type RenderMode = 'preview' | 'print';

const SECTION_TITLES: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
};

/**
 * A bullet, with its provenance shown only while previewing.
 *
 * In preview an unchecked AI-written line is marked, because preview is the
 * last point at which the user reads the resume before it leaves. In print it is
 * plain text: a marker on the exported document would be meaningless to the
 * reader and embarrassing to the candidate.
 */
function Bullet({ bullet, mode }: { bullet: ResumeBullet; mode: RenderMode }) {
  const flagged = mode === 'preview' && bullet.source === 'ai' && !bullet.verified;

  return (
    <li className={cn(flagged && 'rounded-sm bg-amber-100 outline outline-1 outline-amber-300')}>
      {bullet.text}
      {flagged ? (
        <span className="ml-1.5 align-middle text-[0.65em] font-semibold uppercase tracking-wide text-amber-700">
          AI · unchecked
        </span>
      ) : null}
    </li>
  );
}

function EntryHeading({ left, right }: { left: ReactNode; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">{left}</div>
      {right ? <div className="shrink-0 text-[0.9em] text-neutral-600">{right}</div> : null}
    </div>
  );
}

/**
 * Renders a resume through one template style.
 *
 * Every template is a single column whose document order is its reading order.
 * Multi-column resumes look good and parse badly — filters read text in the
 * order it appears, and a sidebar interleaves with the main column. A template
 * that looks better and costs the candidate interviews is a bad template.
 *
 * Colours are fixed rather than taken from the app theme: a resume is printed
 * on white paper whether or not the person designing it prefers dark mode.
 */
export function ResumeDocument({
  resume,
  style,
  mode = 'preview',
}: {
  resume: ResumeData;
  style: TemplateStyle;
  mode?: RenderMode;
}) {
  const sections = visibleSections(resume, style.order);
  const contact = contactItems(resume);

  function render(section: SectionKey): ReactNode {
    switch (section) {
      case 'summary':
        return <p className="whitespace-pre-line">{resume.summary.trim()}</p>;

      case 'experience':
        return resume.experience
          .filter((role) => role.title.trim() || role.company.trim() || printableBullets(role.bullets).length)
          .map((role) => (
            <div key={role.id} className="break-inside-avoid space-y-1">
              <EntryHeading
                left={
                  <p>
                    <span className="font-semibold">{role.title}</span>
                    {role.company ? <span>{role.title ? ', ' : ''}{role.company}</span> : null}
                    {role.location ? <span className="text-neutral-600"> · {role.location}</span> : null}
                  </p>
                }
                right={dateRange(role.startDate, role.endDate, role.current)}
              />
              {printableBullets(role.bullets).length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {printableBullets(role.bullets).map((bullet) => (
                    <Bullet key={bullet.id} bullet={bullet} mode={mode} />
                  ))}
                </ul>
              ) : null}
            </div>
          ));

      case 'projects':
        return resume.projects
          .filter((project) => project.name.trim() || project.description?.trim() || printableBullets(project.bullets).length)
          .map((project) => (
            <div key={project.id} className="break-inside-avoid space-y-1">
              <EntryHeading
                left={
                  <p>
                    <span className="font-semibold">{project.name}</span>
                    {project.description ? <span> — {project.description}</span> : null}
                  </p>
                }
                right={project.link}
              />
              {project.technologies?.length ? (
                <p className="text-[0.9em] text-neutral-600">{project.technologies.join(', ')}</p>
              ) : null}
              {printableBullets(project.bullets).length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {printableBullets(project.bullets).map((bullet) => (
                    <Bullet key={bullet.id} bullet={bullet} mode={mode} />
                  ))}
                </ul>
              ) : null}
            </div>
          ));

      case 'skills': {
        const groups = resume.skills.filter((group) => group.skills.some((skill) => skill.trim()));

        return style.skillsLayout === 'grouped' ? (
          <dl className="space-y-0.5">
            {groups.map((group) => (
              <div key={group.id} className="flex gap-2">
                <dt className="shrink-0 font-semibold">{group.category}:</dt>
                <dd>{group.skills.filter((skill) => skill.trim()).join(', ')}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>
            {groups
              .flatMap((group) => group.skills)
              .filter((skill) => skill.trim())
              .join(' · ')}
          </p>
        );
      }

      case 'education':
        return resume.education
          .filter((entry) => entry.institution.trim() || entry.degree?.trim())
          .map((entry) => (
            <div key={entry.id} className="break-inside-avoid">
              <EntryHeading
                left={
                  <p>
                    <span className="font-semibold">
                      {[entry.degree, entry.fieldOfStudy].filter(Boolean).join(', ')}
                    </span>
                    {entry.institution ? (
                      <span>{entry.degree || entry.fieldOfStudy ? ', ' : ''}{entry.institution}</span>
                    ) : null}
                    {entry.gpa ? <span className="text-neutral-600"> · {entry.gpa}</span> : null}
                  </p>
                }
                right={dateRange(entry.startDate, entry.endDate)}
              />
            </div>
          ));

      case 'certifications':
        return (
          <ul className="space-y-0.5">
            {resume.certifications
              .filter((certification) => certification.name.trim())
              .map((certification) => (
                <li key={certification.id}>
                  <span className="font-semibold">{certification.name}</span>
                  {certification.issuer ? <span>, {certification.issuer}</span> : null}
                  {certification.issueDate ? (
                    <span className="text-neutral-600"> · {certification.issueDate}</span>
                  ) : null}
                </li>
              ))}
          </ul>
        );
    }
  }

  return (
    <article
      className={cn('bg-white text-neutral-900', style.fontClass, style.bodyClass)}
      data-testid="resume-document"
    >
      <header className={style.headerClass}>
        <h1 className={style.nameClass}>{resume.personal.fullName || 'Your name'}</h1>
        {contact.length > 0 ? (
          <p className="mt-1 text-[0.9em] opacity-80">{contact.join('  ·  ')}</p>
        ) : null}
      </header>

      <div className={style.sectionGapClass}>
        {sections.map((section) => (
          <section key={section} aria-labelledby={`section-${section}`}>
            <h2 id={`section-${section}`} className={style.headingClass}>
              {SECTION_TITLES[section]}
            </h2>
            <div className="space-y-2.5">{render(section)}</div>
          </section>
        ))}
      </div>
    </article>
  );
}
