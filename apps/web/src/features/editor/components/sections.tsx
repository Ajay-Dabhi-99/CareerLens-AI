import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { EntryCard, Field } from '@/features/editor/components/EntryCard';
import { BulletListField, RichTextField } from '@/features/editor/components/RichTextField';
import type {
  Education,
  Experience,
  Project,
  ResumeBullet,
  SkillGroup,
} from '@/features/editor/api/editorApi';

/** Ids are generated client-side; the server treats them as opaque strings. */
function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Bullets carry provenance (`source`, `verified`) that plain strings cannot.
 * Editing goes through strings for the rich-text bridge, so this maps back,
 * keeping the flags of bullets that survived and marking new lines as the
 * user's own words.
 */
function mergeBullets(existing: ResumeBullet[], texts: string[]): ResumeBullet[] {
  return texts.map((text, index) => {
    const previous = existing[index];
    if (previous && previous.text === text) return previous;
    return { id: previous?.id ?? newId('b'), text, verified: true, source: 'user' };
  });
}

export function SummarySection({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="summary-field">Professional summary</Label>
      <RichTextField
        ariaLabel="Professional summary"
        value={value}
        onChange={onChange}
        placeholder="Two or three lines on what you do and the results you get."
      />
      <p className="text-xs text-muted-foreground">
        Lead with what you are, not what you want. Specifics beat adjectives.
      </p>
    </div>
  );
}

export function ExperienceSection({
  experience,
  onChange,
}: {
  experience: Experience[];
  onChange: (next: Experience[]) => void;
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

          <div className="space-y-1.5">
            <Label>What you did</Label>
            <BulletListField
              ariaLabel={`Achievements for ${role.title || 'this role'}`}
              bullets={role.bullets.map((bullet) => bullet.text)}
              onChange={(texts) => update(index, { bullets: mergeBullets(role.bullets, texts) })}
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
}: {
  projects: Project[];
  onChange: (next: Project[]) => void;
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
          </div>

          <div className="space-y-1.5">
            <Label>What it does and what you built</Label>
            <BulletListField
              ariaLabel={`Details for ${project.name || 'this project'}`}
              bullets={project.bullets.map((bullet) => bullet.text)}
              onChange={(texts) => update(index, { bullets: mergeBullets(project.bullets, texts) })}
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

export function SkillsSection({
  skills,
  onChange,
}: {
  skills: SkillGroup[];
  onChange: (next: SkillGroup[]) => void;
}) {
  function update(index: number, patch: Partial<SkillGroup>) {
    onChange(skills.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  }

  return (
    <div className="space-y-3">
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
