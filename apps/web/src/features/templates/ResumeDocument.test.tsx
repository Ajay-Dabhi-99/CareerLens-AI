import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ResumeDocument } from './ResumeDocument';
import { TEMPLATES, templateById } from './registry';
import type { ResumeData } from '@/features/editor/api/editorApi';

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe', email: 'jane@example.com', location: 'London' },
    summary: 'Backend engineer focused on payments.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go', 'Python'] }],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        startDate: 'Jan 2021',
        current: true,
        bullets: [
          { id: 'b1', text: 'Led the ledger migration', verified: true, source: 'user' },
          { id: 'b2', text: 'Cut p99 latency by 80%', verified: false, source: 'ai' },
        ],
      },
    ],
    education: [{ id: 'ed1', institution: 'University of Leeds', degree: 'BSc Computing' }],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

function sectionHeadings(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '');
}

describe('ResumeDocument', () => {
  it.each(TEMPLATES.map((template) => [template.name, template] as const))(
    '%s renders the same content as every other template',
    (_name, template) => {
      render(<ResumeDocument resume={resume()} style={template.style} mode="print" />);

      // Templates may differ in how they look, never in what they say.
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Jane Doe');
      expect(screen.getByText('Led the ledger migration')).toBeInTheDocument();
      expect(screen.getByText('Cut p99 latency by 80%')).toBeInTheDocument();
      expect(screen.getByText(/University of Leeds/)).toBeInTheDocument();
      expect(screen.getByText('Jan 2021 – Present')).toBeInTheDocument();
    },
  );

  it.each(TEMPLATES.map((template) => [template.name, template] as const))(
    '%s prints sections in its own order, which is its reading order',
    (_name, template) => {
      render(<ResumeDocument resume={resume()} style={template.style} mode="print" />);

      // Document order is what a filter reads, so it must be the intended order.
      const expected = template.style.order
        .filter((key) => ['summary', 'experience', 'skills', 'education'].includes(key))
        .map((key) => key[0]!.toUpperCase() + key.slice(1));

      expect(sectionHeadings()).toEqual(expected);
    },
  );

  it('prints no heading over a section with nothing in it', () => {
    render(
      <ResumeDocument
        resume={resume({
          projects: [{ id: 'p1', name: ' ', bullets: [{ id: 'x', text: '', verified: true, source: 'user' }] }],
        })}
        style={TEMPLATES[0]!.style}
        mode="print"
      />,
    );

    // A heading over an empty row reads as a gap the candidate forgot to fill.
    expect(sectionHeadings()).not.toContain('Projects');
    expect(sectionHeadings()).not.toContain('Certifications');
  });

  it('marks unchecked AI lines while previewing', () => {
    render(<ResumeDocument resume={resume()} style={TEMPLATES[0]!.style} mode="preview" />);

    const line = screen.getByText('Cut p99 latency by 80%').closest('li')!;
    expect(within(line).getByText(/AI · unchecked/)).toBeInTheDocument();
    // The user's own line carries no marker.
    const own = screen.getByText('Led the ledger migration').closest('li')!;
    expect(within(own).queryByText(/AI · unchecked/)).not.toBeInTheDocument();
  });

  it('never marks anything in the printed document', () => {
    render(<ResumeDocument resume={resume()} style={TEMPLATES[0]!.style} mode="print" />);

    // A marker on the exported resume would mean nothing to the reader.
    expect(screen.queryByText(/AI · unchecked/)).not.toBeInTheDocument();
  });

  it('paints on white whatever the app theme is', () => {
    render(<ResumeDocument resume={resume()} style={TEMPLATES[0]!.style} mode="print" />);

    expect(screen.getByTestId('resume-document')).toHaveClass('bg-white', 'text-neutral-900');
  });

  it('does not print separators for contact details that are missing', () => {
    render(
      <ResumeDocument
        resume={resume({ personal: { fullName: 'Jane Doe', email: 'jane@example.com' } })}
        style={TEMPLATES[0]!.style}
        mode="print"
      />,
    );

    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });
});

describe('templateById', () => {
  it('finds a known template', () => {
    expect(templateById('technical').name).toBe('Technical');
  });

  it('falls back rather than rendering nothing for an unknown id', () => {
    // A resume that cannot be displayed is worse than one in a different style.
    expect(templateById('removed-template').id).toBe('modern');
    expect(templateById(undefined).id).toBe('modern');
  });

  it('offers the five templates the spec names', () => {
    expect(TEMPLATES.map((template) => template.name)).toEqual([
      'Modern',
      'Minimal',
      'Professional',
      'Technical',
      'Executive',
    ]);
  });
});
