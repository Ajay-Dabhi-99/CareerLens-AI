import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { Resume, TemplateId } from '@career-lens-ai/types';
import { buildResumeDocx, docxFileName } from '../services/exporter/docxExporter.js';

function resume(overrides: Partial<Resume> = {}): Resume {
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

/** The document body as plain text, in document order. */
async function documentText(templateId: TemplateId, subject = resume()): Promise<string> {
  const buffer = await buildResumeDocx(subject, templateId);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
}

describe('buildResumeDocx', () => {
  it('produces a real Word document', async () => {
    const buffer = await buildResumeDocx(resume(), 'modern');
    const zip = await JSZip.loadAsync(buffer);

    expect(zip.file('word/document.xml')).not.toBeNull();
    // A .docx is a zip; the magic bytes are "PK".
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('contains the resume as editable text, not an image of it', async () => {
    const text = await documentText('modern');

    expect(text).toContain('Jane Doe');
    expect(text).toContain('Led the ledger migration');
    expect(text).toContain('University of Leeds');
    expect(text).toContain('Jan 2021 – Present');
  });

  it('follows the section order of the chosen template, as the preview does', async () => {
    // Technical puts skills ahead of experience; Modern does the reverse. The
    // downloaded file must list them the way the approved preview did.
    const technical = await documentText('technical');
    const modern = await documentText('modern');

    expect(technical.indexOf('SKILLS')).toBeLessThan(technical.indexOf('EXPERIENCE'));
    expect(modern.indexOf('EXPERIENCE')).toBeLessThan(modern.indexOf('SKILLS'));
  });

  it('prints no heading over an empty section', async () => {
    const text = await documentText('modern');

    expect(text).not.toContain('PROJECTS');
    expect(text).not.toContain('CERTIFICATIONS');
  });

  it('never carries the preview-only AI marker into the file', async () => {
    const text = await documentText('modern');

    expect(text).toContain('Cut p99 latency by 80%');
    expect(text).not.toMatch(/unchecked/i);
  });

  it('uses real list numbering rather than typed bullet characters', async () => {
    const buffer = await buildResumeDocx(resume(), 'modern');
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');

    // Typed "•" characters break when a recruiter edits the list.
    expect(xml).toContain('<w:numPr>');
    expect(await documentText('modern')).not.toContain('•');
  });

  it.each(['modern', 'minimal', 'professional', 'technical', 'executive'] as const)(
    'builds the %s template',
    async (templateId) => {
      const text = await documentText(templateId);
      expect(text).toContain('Jane Doe');
    },
  );

  it('lays skills out inline for templates that ask for it', async () => {
    expect(await documentText('minimal')).toContain('Go · Python');
    expect(await documentText('modern')).toContain('Languages:');
  });
});

describe('docxFileName', () => {
  it('names the file after the person and the template', () => {
    expect(docxFileName(resume(), 'technical')).toBe('Jane Doe - Technical.docx');
  });

  it('strips characters a filesystem would reject', () => {
    const odd = resume({ personal: { fullName: 'Jane "J" Doe / Smith', email: 'j@x.com' } });
    expect(docxFileName(odd, 'modern')).toBe('Jane J Doe Smith - Modern.docx');
  });

  it('falls back to a generic name when there is no name', () => {
    const unnamed = resume({ personal: { fullName: ' ', email: 'j@x.com' } });
    expect(docxFileName(unnamed, 'modern')).toBe('Resume - Modern.docx');
  });
});
