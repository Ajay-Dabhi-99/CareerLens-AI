import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { EntryCard, Field } from '@/features/editor/components/EntryCard';
import { BulletListField, RichTextField } from '@/features/editor/components/RichTextField';
import { RewriteButton, RewritePanel } from '@/features/editor/components/RewritePanel';
import type { RewriteController } from '@/features/editor/hooks/useRewrite';
import { mergeBullets, newId, replaceBulletWithAi } from '@/features/editor/lib/bullets';
import type {
  Education,
  Experience,
  Project,
  ResumeBullet,
  SkillGroup,
} from '@/features/editor/api/editorApi';

/**
 * The bullets of one entry, each offering a rewrite.
 *
 * Separate from the rich-text editor above it because the editor holds all the
 * bullets as one document, and a rewrite applies to one line.
 */
function BulletRewriteRows({
  keyPrefix,
  bullets,
  rewrite,
  onAccept,
}: {
  keyPrefix: string;
  bullets: ResumeBullet[];
  rewrite: RewriteController;
  onAccept: (index: number, text: string) => void;
}) {
  if (bullets.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {bullets.map((bullet, index) => {
        const key = `${keyPrefix}-bullet-${bullet.id}`;

        return (
          <li key={bullet.id} className="space-y-1.5">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {bullet.text}
              </p>
              {bullet.source === 'ai' && !bullet.verified ? (
                <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                  AI · check this
                </span>
              ) : null}
              <RewriteButton
                label="Improve"
                disabled={rewrite.state.kind === 'loading' && rewrite.activeKey !== key}
                onClick={() =>
                  rewrite.start(key, 'bullet', bullet.text, (text) => onAccept(index, text))
                }
              />
            </div>

            {rewrite.activeKey === key ? (
              <RewritePanel
                state={rewrite.state}
                currentText={rewrite.currentText}
                onAccept={rewrite.accept}
                onDismiss={rewrite.dismiss}
                onRetry={rewrite.retry}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SummarySection({
  value,
  onChange,
  rewrite,
}: {
  value: string;
  onChange: (next: string) => void;
  rewrite: RewriteController;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="summary-field">Professional summary</Label>
        <RewriteButton
          onClick={() => rewrite.start('summary', 'summary', value, onChange)}
          disabled={rewrite.state.kind === 'loading' && rewrite.activeKey !== 'summary'}
        />
      </div>

      <RichTextField
        ariaLabel="Professional summary"
        value={value}
        onChange={onChange}
        placeholder="Two or three lines on what you do and the results you get."
      />

      {rewrite.activeKey === 'summary' ? (
        <RewritePanel
          state={rewrite.state}
          currentText={rewrite.currentText}
          onAccept={rewrite.accept}
          onDismiss={rewrite.dismiss}
          onRetry={rewrite.retry}
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        Lead with what you are, not what you want. Specifics beat adjectives.
      </p>
    </div>
  );
}

export function ExperienceSection({
  experience,
  onChange,
  rewrite,
}: {
  experience: Experience[];
  onChange: (next: Experience[]) => void;
  rewrite: RewriteController;
}) {
  function update(index: number, patch: Partial<Experience>) {
    onChange(experience.map((role, i) => (i === index ? { ...role, ...patch } : role)));
  }

  return (
    <div className="space-y-3">
      {experience.map((role, index) => (
        <EntryCard
          key={role.id}
          title={role.title || role.company || `Role ${index + 1}`}
          removeLabel={`Remove ${role.title || 'this role'}`}
          onRemove={() => onChange(experience.filter((_, i) => i !== index))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={`role-title-${role.id}`}
              label="Job title"
              value={role.title}
              onChange={(title) => update(index, { title })}
            />
            <Field
              id={`role-company-${role.id}`}
              label="Employer"
              value={role.company}
              onChange={(company) => update(index, { company })}
            />
            <Field
              id={`role-location-${role.id}`}
              label="Location"
              value={role.location ?? ''}
              placeholder="London, UK"
              onChange={(location) => update(index, { location })}
            />
            <Field
              id={`role-start-${role.id}`}
              label="Start"
              value={role.startDate ?? ''}
              placeholder="Jan 2021"
              onChange={(startDate) => update(index, { startDate })}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`role-end-${role.id}`}>End</Label>
              <Input
                id={`role-end-${role.id}`}
                value={role.current ? '' : (role.endDate ?? '')}
                placeholder={role.current ? 'Present' : 'Dec 2023'}
                disabled={role.current}
                onChange={(event) => update(index, { endDate: event.target.value })}
              />
              <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={role.current}
                  onChange={(event) =>
                    update(index, {
                      current: event.target.checked,
                      endDate: event.target.checked ? undefined : role.endDate,
                    })
                  }
                />
                I still work here
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>What you did</Label>
            <BulletListField
              ariaLabel={`Achievements for ${role.title || 'this role'}`}
              bullets={role.bullets.map((bullet) => bullet.text)}
              onChange={(texts) => update(index, { bullets: mergeBullets(role.bullets, texts) })}
            />
            <BulletRewriteRows
              keyPrefix={role.id}
              bullets={role.bullets}
              rewrite={rewrite}
              onAccept={(bulletIndex, text) =>
                update(index, { bullets: replaceBulletWithAi(role.bullets, bulletIndex, text) })
              }
            />
          </div>
        </EntryCard>
      ))}

      <Button
        variant="outline"
        onClick={() =>
          onChange([
            ...experience,
            { id: newId('e'), company: '', title: '', current: false, bullets: [] },
          ])
        }
      >
        <Plus />
        Add a role
      </Button>
    </div>
  );
}

export function ProjectsSection({
  projects,
  onChange,
  rewrite,
}: {
  projects: Project[];
  onChange: (next: Project[]) => void;
  rewrite: RewriteController;
}) {
  function update(index: number, patch: Partial<Project>) {
    onChange(projects.map((project, i) => (i === index ? { ...project, ...patch } : project)));
  }

  return (
    <div className="space-y-3">
      {projects.map((project, index) => (
        <EntryCard
          key={project.id}
          title={project.name || `Project ${index + 1}`}
          removeLabel={`Remove ${project.name || 'this project'}`}
          onRemove={() => onChange(projects.filter((_, i) => i !== index))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={`project-name-${project.id}`}
              label="Name"
              value={project.name}
              onChange={(name) => update(index, { name })}
            />
            <Field
              id={`project-link-${project.id}`}
              label="Link"
              value={project.link ?? ''}
              placeholder="github.com/you/project"
              onChange={(link) => update(index, { link })}
            />
            <Field
              id={`project-tech-${project.id}`}
              label="Built with"
              value={(project.technologies ?? []).join(', ')}
              placeholder="React, Firebase"
              onChange={(value) =>
                update(index, {
                  technologies: value
                    .split(',')
                    .map((tech) => tech.trim())
                    .filter((tech) => tech.length > 0),
                })
              }
            />
          </div>

          {/*
            The one-line pitch for the project, and the only place the 'project'
            rewrite target applies: bullets below are rewritten one at a time as
            bullets, but this sentence is what makes someone read them.
          */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`project-description-${project.id}`}>In one line</Label>
              <RewriteButton
                label="Improve"
                disabled={
                  rewrite.state.kind === 'loading' &&
                  rewrite.activeKey !== `${project.id}-description`
                }
                onClick={() =>
                  rewrite.start(
                    `${project.id}-description`,
                    'project',
                    project.description ?? '',
                    (description) => update(index, { description }),
                  )
                }
              />
            </div>
            <Input
              id={`project-description-${project.id}`}
              value={project.description ?? ''}
              placeholder="A revision planner used by 120 classmates"
              onChange={(event) => update(index, { description: event.target.value })}
            />
            {rewrite.activeKey === `${project.id}-description` ? (
              <RewritePanel
                state={rewrite.state}
                currentText={rewrite.currentText}
                onAccept={rewrite.accept}
                onDismiss={rewrite.dismiss}
                onRetry={rewrite.retry}
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>What it does and what you built</Label>
            <BulletListField
              ariaLabel={`Details for ${project.name || 'this project'}`}
              bullets={project.bullets.map((bullet) => bullet.text)}
              onChange={(texts) => update(index, { bullets: mergeBullets(project.bullets, texts) })}
            />
            <BulletRewriteRows
              keyPrefix={project.id}
              bullets={project.bullets}
              rewrite={rewrite}
              onAccept={(bulletIndex, text) =>
                update(index, {
                  bullets: replaceBulletWithAi(project.bullets, bulletIndex, text),
                })
              }
            />
          </div>
        </EntryCard>
      ))}

      <Button
        variant="outline"
        onClick={() => onChange([...projects, { id: newId('p'), name: '', bullets: [] }])}
      >
        <Plus />
        Add a project
      </Button>
    </div>
  );
}

/** One line per group, which is how the model is asked to read them back. */
function skillsAsText(skills: SkillGroup[]): string {
  return skills.map((group) => `${group.category}: ${group.skills.join(', ')}`).join('\n');
}

/**
 * Parses grouped skills back out of the model's reply.
 *
 * Anything that does not look like "Group: a, b, c" is skipped rather than
 * guessed at: a malformed line silently becoming a skill group would put words
 * on someone's resume that nobody chose.
 */
function skillsFromText(text: string, existing: SkillGroup[]): SkillGroup[] {
  const groups: SkillGroup[] = [];

  text.split('\n').forEach((line, index) => {
    const at = line.indexOf(':');
    if (at <= 0) return;

    const category = line.slice(0, at).trim().replace(/^[-*•]\s*/, '');
    const items = line
      .slice(at + 1)
      .split(',')
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);

    if (!category || items.length === 0) return;
    groups.push({ id: existing[index]?.id ?? newId('s'), category, skills: items });
  });

  return groups;
}

export function SkillsSection({
  skills,
  onChange,
  rewrite,
}: {
  skills: SkillGroup[];
  onChange: (next: SkillGroup[]) => void;
  rewrite: RewriteController;
}) {
  function update(index: number, patch: Partial<SkillGroup>) {
    onChange(skills.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  }

  function acceptSkills(text: string) {
    const parsed = skillsFromText(text, skills);
    // Refusing an unparseable reply is better than replacing a working skills
    // section with nothing.
    if (parsed.length > 0) onChange(parsed);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Grouping matters as much as coverage: filters read the words, people read the shape.
        </p>
        <RewriteButton
          label="Review grouping"
          onClick={() => rewrite.start('skills', 'skills', skillsAsText(skills), acceptSkills)}
          disabled={rewrite.state.kind === 'loading' && rewrite.activeKey !== 'skills'}
        />
      </div>

      {rewrite.activeKey === 'skills' ? (
        <RewritePanel
          state={rewrite.state}
          currentText={rewrite.currentText}
          onAccept={rewrite.accept}
          onDismiss={rewrite.dismiss}
          onRetry={rewrite.retry}
        />
      ) : null}

      {skills.map((group, index) => (
        <EntryCard
          key={group.id}
          title={group.category || `Group ${index + 1}`}
          removeLabel={`Remove ${group.category || 'this group'}`}
          onRemove={() => onChange(skills.filter((_, i) => i !== index))}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              id={`skill-category-${group.id}`}
              label="Group"
              value={group.category}
              placeholder="Languages"
              onChange={(category) => update(index, { category })}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`skill-list-${group.id}`}>Skills</Label>
              <Input
                id={`skill-list-${group.id}`}
                value={group.skills.join(', ')}
                placeholder="TypeScript, Go, Python"
                onChange={(event) =>
                  update(index, {
                    // Split on save rather than on every keystroke would strand a
                    // trailing comma mid-typing, so the raw string is split here
                    // and empties are dropped on the way out.
                    skills: event.target.value
                      .split(',')
                      .map((skill) => skill.trim())
                      .filter((skill) => skill.length > 0),
                  })
                }
              />
            </div>
          </div>
        </EntryCard>
      ))}

      <Button
        variant="outline"
        onClick={() => onChange([...skills, { id: newId('s'), category: '', skills: [] }])}
      >
        <Plus />
        Add a skill group
      </Button>
    </div>
  );
}

export function EducationSection({
  education,
  onChange,
}: {
  education: Education[];
  onChange: (next: Education[]) => void;
}) {
  function update(index: number, patch: Partial<Education>) {
    onChange(education.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  return (
    <div className="space-y-3">
      {education.map((entry, index) => (
        <EntryCard
          key={entry.id}
          title={entry.institution || `Qualification ${index + 1}`}
          removeLabel={`Remove ${entry.institution || 'this qualification'}`}
          onRemove={() => onChange(education.filter((_, i) => i !== index))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={`edu-degree-${entry.id}`}
              label="Qualification"
              value={entry.degree ?? ''}
              placeholder="BSc Computer Science"
              onChange={(degree) => update(index, { degree })}
            />
            <Field
              id={`edu-institution-${entry.id}`}
              label="Institution"
              value={entry.institution}
              onChange={(institution) => update(index, { institution })}
            />
            <Field
              id={`edu-field-${entry.id}`}
              label="Field of study"
              value={entry.fieldOfStudy ?? ''}
              placeholder="Computer Science"
              onChange={(fieldOfStudy) => update(index, { fieldOfStudy })}
            />
            <Field
              id={`edu-gpa-${entry.id}`}
              label="Grade"
              value={entry.gpa ?? ''}
              placeholder="First class"
              onChange={(gpa) => update(index, { gpa })}
            />
            <Field
              id={`edu-start-${entry.id}`}
              label="From"
              value={entry.startDate ?? ''}
              placeholder="2018"
              onChange={(startDate) => update(index, { startDate })}
            />
            <Field
              id={`edu-end-${entry.id}`}
              label="To"
              value={entry.endDate ?? ''}
              placeholder="2022"
              onChange={(endDate) => update(index, { endDate })}
            />
          </div>
        </EntryCard>
      ))}

      <Button
        variant="outline"
        onClick={() => onChange([...education, { id: newId('ed'), institution: '' }])}
      >
        <Plus />
        Add a qualification
      </Button>
    </div>
  );
}
