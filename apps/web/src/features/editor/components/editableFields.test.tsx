import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  EducationSection,
  ExperienceSection,
  ProjectsSection,
} from './sections';
import type { RewriteController } from '@/features/editor/hooks/useRewrite';

/**
 * Phase 8's Definition of Done is "the user can fully edit the resume
 * in-browser". Several fields were parsed out of the CV and then had nowhere to
 * be edited — visible to the scorer, invisible to the person whose resume it is.
 *
 * These tests name each field, so the gap cannot quietly reopen when a section
 * is refactored.
 */

const rewrite: RewriteController = {
  activeKey: null,
  state: { kind: 'idle' },
  currentText: '',
  start: vi.fn(),
  accept: vi.fn(),
  dismiss: vi.fn(),
  retry: vi.fn(),
};

describe('every parsed field can be edited', () => {
  it('exposes all of an experience entry', () => {
    render(
      <ExperienceSection
        rewrite={rewrite}
        onChange={vi.fn()}
        experience={[
          {
            id: 'e1',
            company: 'Acme',
            title: 'Engineer',
            location: 'London, UK',
            startDate: 'Jan 2021',
            current: true,
            bullets: [],
          },
        ]}
      />,
    );

    expect(screen.getByLabelText('Job title')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Employer')).toHaveValue('Acme');
    expect(screen.getByLabelText('Location')).toHaveValue('London, UK');
    expect(screen.getByLabelText('Start')).toHaveValue('Jan 2021');
    expect(screen.getByLabelText('End')).toBeInTheDocument();
  });

  it('exposes all of an education entry', () => {
    render(
      <EducationSection
        onChange={vi.fn()}
        education={[
          {
            id: 'ed1',
            institution: 'University of Leeds',
            degree: 'BSc',
            fieldOfStudy: 'Computer Science',
            startDate: '2015',
            endDate: '2019',
            gpa: 'First class',
          },
        ]}
      />,
    );

    expect(screen.getByLabelText('Qualification')).toHaveValue('BSc');
    expect(screen.getByLabelText('Institution')).toHaveValue('University of Leeds');
    expect(screen.getByLabelText('Field of study')).toHaveValue('Computer Science');
    expect(screen.getByLabelText('Grade')).toHaveValue('First class');
    expect(screen.getByLabelText('From')).toHaveValue('2015');
    expect(screen.getByLabelText('To')).toHaveValue('2019');
  });

  it('exposes all of a project entry', () => {
    render(
      <ProjectsSection
        rewrite={rewrite}
        onChange={vi.fn()}
        projects={[
          {
            id: 'p1',
            name: 'StudyBuddy',
            description: 'A revision planner',
            link: 'github.com/me/studybuddy',
            technologies: ['React', 'Firebase'],
            bullets: [],
          },
        ]}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('StudyBuddy');
    expect(screen.getByLabelText('In one line')).toHaveValue('A revision planner');
    expect(screen.getByLabelText('Link')).toHaveValue('github.com/me/studybuddy');
    expect(screen.getByLabelText('Built with')).toHaveValue('React, Firebase');
  });

  it('offers the project rewrite, which the spec asks for and nothing used', () => {
    const start = vi.fn();

    render(
      <ProjectsSection
        rewrite={{ ...rewrite, start }}
        onChange={vi.fn()}
        projects={[{ id: 'p1', name: 'StudyBuddy', description: 'A planner', bullets: [] }]}
      />,
    );

    screen.getByRole('button', { name: /improve/i }).click();

    // 'project' was accepted by the API and sent by nothing, so the phase's own
    // "summary/bullet/project/skills" was one short.
    expect(start).toHaveBeenCalledWith(
      expect.any(String),
      'project',
      'A planner',
      expect.any(Function),
    );
  });
});
