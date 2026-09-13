import { describe, expect, it } from 'vitest';
import { contactItems, dateRange, hasContent, printableBullets, visibleSections } from './format';
import type { ResumeData } from '@/features/editor/api/editorApi';

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '', location: 'London' },
    summary: 'Backend engineer.',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

describe('dateRange', () => {
  it('joins a start and an end', () => {
    expect(dateRange('2018', '2022')).toBe('2018 – 2022');
  });

  it('says Present for a current role, whatever end date is stored', () => {
    expect(dateRange('Jan 2021', 'Dec 2020', true)).toBe('Jan 2021 – Present');
  });

  it('prints a lone date rather than a dangling dash', () => {
    expect(dateRange('2019', undefined)).toBe('2019');
    expect(dateRange(undefined, '2019')).toBe('2019');
  });

  it('prints nothing when there are no dates', () => {
    expect(dateRange('  ', '')).toBe('');
  });
});

describe('contactItems', () => {
  it('skips blank fields instead of printing empty separators', () => {
    expect(contactItems(resume())).toEqual(['jane@example.com', 'London']);
  });
});

describe('hasContent', () => {
  it('treats a role with only empty fields as no experience', () => {
    // A heading over an empty row reads as a gap the candidate forgot to fill.
    const blankRole = resume({
      experience: [{ id: 'e1', company: '', title: ' ', current: false, bullets: [] }],
    });

    expect(hasContent(blankRole, 'experience')).toBe(false);
  });

  it('treats a skills group with no skills as empty', () => {
    const emptyGroup = resume({ skills: [{ id: 's1', category: 'Languages', skills: [] }] });
    expect(hasContent(emptyGroup, 'skills')).toBe(false);
  });

  it('recognises real content', () => {
    expect(hasContent(resume(), 'summary')).toBe(true);
  });
});

describe('visibleSections', () => {
  it('keeps the template order and drops empty sections', () => {
    const withSkills = resume({
      skills: [{ id: 's1', category: 'Languages', skills: ['Go'] }],
    });

    expect(visibleSections(withSkills, ['skills', 'experience', 'summary'])).toEqual([
      'skills',
      'summary',
    ]);
  });
});

describe('printableBullets', () => {
  it('drops the empty bullet the editor leaves behind', () => {
    expect(printableBullets([{ text: 'Real' }, { text: '   ' }])).toEqual([{ text: 'Real' }]);
  });
});
