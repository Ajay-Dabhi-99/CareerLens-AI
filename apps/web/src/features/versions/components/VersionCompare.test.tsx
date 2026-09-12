import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionCompare, sectionsOf } from './VersionCompare';
import type { ResumeData } from '@/features/editor/api/editorApi';

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
    summary: 'Responsible for billing.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go'] }],
    experience: [
      {
        id: 'e1',
        company: 'Acme',
        title: 'Engineer',
        current: true,
        bullets: [{ id: 'b1', text: 'Led the migration', verified: true, source: 'user' }],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

describe('sectionsOf', () => {
  it('names each section after the thing it describes', () => {
    const labels = sectionsOf(resume()).map((section) => section.label);

    // "Engineer at Acme" tells the user where to look; "experience-0" does not.
    expect(labels).toContain('Engineer at Acme');
    expect(labels).toContain('Summary');
    expect(labels).toContain('Skills');
  });

  it('flattens bullets into comparable text', () => {
    const experience = sectionsOf(resume()).find((s) => s.key === 'experience-0');
    expect(experience?.text).toBe('• Led the migration');
  });
});

describe('VersionCompare', () => {
  it('says plainly when two versions are the same', () => {
    render(
      <VersionCompare
        leftName="Original"
        rightName="Working copy"
        leftScore={60}
        rightScore={60}
        left={resume()}
        right={resume()}
      />,
    );

    expect(screen.getByText(/these two versions are identical/i)).toBeVisible();
  });

  it('shows only the sections that actually differ', () => {
    render(
      <VersionCompare
        leftName="Original"
        rightName="Working copy"
        leftScore={60}
        rightScore={72}
        left={resume()}
        right={resume({ summary: 'Owned billing end to end.' })}
      />,
    );

    // Unchanged sections would be noise between the user and the change.
    expect(screen.getByText('Summary')).toBeVisible();
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
  });

  it('shows the score movement, with its direction', () => {
    render(
      <VersionCompare
        leftName="Original"
        rightName="Working copy"
        leftScore={60}
        rightScore={72}
        left={resume()}
        right={resume({ summary: 'Owned billing end to end.' })}
      />,
    );

    expect(screen.getByText(/60 → 72 \(\+12\)/)).toBeVisible();
  });

  it('does not dress up a drop as an improvement', () => {
    render(
      <VersionCompare
        leftName="Working copy"
        rightName="Original"
        leftScore={72}
        rightScore={60}
        left={resume({ summary: 'Owned billing end to end.' })}
        right={resume()}
      />,
    );

    expect(screen.getByText(/72 → 60 \(-12\)/)).toBeVisible();
  });

  it('describes a section that only exists on one side', () => {
    render(
      <VersionCompare
        leftName="Original"
        rightName="Working copy"
        leftScore={60}
        rightScore={64}
        left={resume({ summary: '' })}
        right={resume()}
      />,
    );

    expect(screen.getByText(/added in this version/i)).toBeVisible();
  });
});
