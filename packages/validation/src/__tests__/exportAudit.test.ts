import { describe, expect, it } from 'vitest';
import type { Resume } from '@career-lens-ai/types';
import { auditForExport } from '../exportAudit.js';

function resume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
    summary: 'Backend engineer.',
    skills: [{ id: 's1', category: 'Languages', skills: ['Go'] }],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        startDate: 'Jan 2021',
        current: true,
        bullets: [{ id: 'b1', text: 'Led the ledger migration', verified: true, source: 'user' }],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
    ...overrides,
  };
}

const ids = (issues: { id: string }[]) => issues.map((issue) => issue.id);

describe('auditForExport', () => {
  it('passes a complete resume', () => {
    const audit = auditForExport(resume());

    expect(audit.ready).toBe(true);
    expect(audit.blocking).toEqual([]);
  });

  it('blocks a resume with no name', () => {
    const audit = auditForExport(resume({ personal: { fullName: ' ', email: 'jane@example.com' } }));

    expect(audit.ready).toBe(false);
    expect(ids(audit.blocking)).toContain('export.no-name');
  });

  it('blocks a resume nobody could reply to', () => {
    const audit = auditForExport(resume({ personal: { fullName: 'Jane Doe' } }));

    expect(ids(audit.blocking)).toContain('export.no-contact');
  });

  it('accepts a phone number in place of an email', () => {
    const audit = auditForExport(resume({ personal: { fullName: 'Jane Doe', phone: '+44 7700 900123' } }));

    expect(ids(audit.blocking)).not.toContain('export.no-contact');
  });

  it('blocks the placeholder the rewrite feature leaves on purpose', () => {
    // A stronger line that needs a missing number comes back as "[X]%". That is
    // right in the editor and must never reach an employer.
    const audit = auditForExport(
      resume({
        experience: [
          {
            id: 'e1',
            company: 'Monzo',
            title: 'Backend Engineer',
            startDate: 'Jan 2021',
            current: true,
            bullets: [{ id: 'b1', text: 'Cut failed payments by [X]%', verified: false, source: 'ai' }],
          },
        ],
      }),
    );

    expect(audit.ready).toBe(false);
    const issue = audit.blocking.find((i) => i.id === 'export.placeholder')!;
    expect(issue.message).toContain('[X]');
    expect(issue.where).toBe('Experience · Backend Engineer at Monzo');
  });

  it('blocks a leftover template placeholder in a project', () => {
    const audit = auditForExport(
      resume({
        projects: [
          {
            id: 'p1',
            name: 'Uploader',
            bullets: [
              { id: 'pb1', text: 'Stored files in [Google Cloud service name]', verified: true, source: 'user' },
            ],
          },
        ],
      }),
    );

    expect(audit.blocking.some((i) => i.message.includes('[Google Cloud service name]'))).toBe(true);
  });

  it('blocks obvious filler text', () => {
    const audit = auditForExport(resume({ summary: 'Lorem ipsum dolor sit amet.' }));

    expect(ids(audit.blocking)).toContain('export.placeholder');
  });

  it('blocks a resume with nothing in it to export', () => {
    const audit = auditForExport(resume({ experience: [], projects: [], education: [] }));

    expect(ids(audit.blocking)).toContain('export.empty');
  });

  it('warns, not blocks, on unchecked AI wording', () => {
    const audit = auditForExport(
      resume({
        experience: [
          {
            id: 'e1',
            company: 'Monzo',
            title: 'Backend Engineer',
            startDate: 'Jan 2021',
            current: true,
            bullets: [{ id: 'b1', text: 'Owned the ledger end to end', verified: false, source: 'ai' }],
          },
        ],
      }),
    );

    // The user may well stand behind it, so it does not stop the export — but
    // they are told exactly where to look.
    expect(audit.ready).toBe(true);
    const warning = audit.warnings.find((w) => w.id === 'export.unverified-ai')!;
    expect(warning.where).toBe('Experience · Backend Engineer at Monzo');
  });

  it('warns about a role with no start date', () => {
    const audit = auditForExport(
      resume({
        experience: [
          { id: 'e1', company: 'Monzo', title: 'Engineer', current: true, bullets: [] },
        ],
      }),
    );

    expect(ids(audit.warnings)).toContain('export.missing-dates');
  });

  it('keeps a location short enough to read', () => {
    // A mis-parsed project whose "name" is a whole sentence must not bury the
    // message attached to it — found on a real resume.
    const longName =
      'Implemented key features across these modules, including appointment and invoice payments';
    const audit = auditForExport(
      resume({
        projects: [
          { id: 'p1', name: longName, bullets: [{ id: 'b', text: 'Used [JWT]', verified: true, source: 'user' }] },
        ],
      }),
    );

    const where = audit.blocking.find((i) => i.id === 'export.placeholder')!.where!;
    expect(where.length).toBeLessThanOrEqual('Projects · '.length + 48);
    expect(where.endsWith('…')).toBe(true);
  });

  it('reports the same placeholder once per place, not once per occurrence', () => {
    const audit = auditForExport(resume({ summary: 'Grew revenue [X]% and cut cost [X]%.' }));

    expect(audit.blocking.filter((i) => i.id === 'export.placeholder')).toHaveLength(1);
  });
});
