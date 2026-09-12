import { describe, expect, it } from 'vitest';
import { extractResumeText } from '../services/parser/textExtraction.js';

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a small but structurally valid PDF so the extractor is exercised against
 * a real document rather than a mock. Generated rather than committed as a binary
 * fixture, so the input stays readable in the test.
 */
/**
 * Draws lines at explicit positions, in a deliberately scrambled draw order.
 *
 * Real PDF producers emit headings in separate text blocks, so draw order does
 * not match reading order. `positions` is [x, y, text] in PDF user space.
 */
function buildPositionedPdf(positions: Array<[number, number, string]>): Buffer {
  const body = positions
    .map(([x, y, text]) => `BT /F1 12 Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`)
    .join('\n');
  return assemblePdf(body);
}

function buildPdf(lines: string[]): Buffer {
  const body = lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join('\n');
  const content = `BT /F1 12 Tf 72 720 Td 14 TL\n${body}\nET`;
  return assemblePdf(content);
}

function assemblePdf(content: string): Buffer {

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefPosition = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

describe('extractResumeText', () => {
  it('extracts text from a real PDF', async () => {
    const pdf = buildPdf([
      'JANE DOE',
      'Senior Software Engineer',
      'jane.doe@example.com',
      'EXPERIENCE',
      'Staff Engineer, Monzo',
    ]);

    const text = await extractResumeText(pdf, 'pdf');

    expect(text).toContain('JANE DOE');
    expect(text).toContain('jane.doe@example.com');
    expect(text).toContain('Staff Engineer');
  }, 30_000);

  it('reads by position, not draw order, so a heading cannot land below its content', async () => {
    // A real CV did exactly this: the producer drew "TECHNICAL SKILLS" after the
    // skill lines it labels, so the section parsed as empty.
    const pdf = buildPositionedPdf([
      [72, 600, 'Languages: JavaScript, TypeScript'],
      [72, 580, 'Frontend: React, Redux'],
      [72, 620, 'TECHNICAL SKILLS'],
      [72, 700, 'AJAY DABHI'],
    ]);

    const text = await extractResumeText(pdf, 'pdf');
    const lines = text.split('\n');

    expect(lines[0]).toContain('AJAY DABHI');
    expect(lines.indexOf('TECHNICAL SKILLS')).toBeLessThan(
      lines.findIndex((line) => line.startsWith('Languages:')),
    );
  }, 30_000);

  it('does not insert spaces inside words split across text items', async () => {
    // PDFs break words apart for kerning. Adding a space after every item
    // produced "Frontend-f ocused" and "React R outer".
    const pdf = buildPositionedPdf([
      [72, 700, 'Frontend-f'],
      [107, 700, 'ocused engineer'],
    ]);

    const text = await extractResumeText(pdf, 'pdf');

    expect(text).toContain('Frontend-focused');
    expect(text).not.toContain('Frontend-f ocused');
  }, 30_000);

  it('still separates words that have a real gap between them', async () => {
    const pdf = buildPositionedPdf([
      [72, 700, 'React'],
      [140, 700, 'Router'],
    ]);

    const text = await extractResumeText(pdf, 'pdf');

    expect(text).toContain('React Router');
  }, 30_000);

  it('reads plain text verbatim', async () => {
    const text = await extractResumeText(Buffer.from('Bob Smith\nEngineer\n'), 'txt');
    expect(text).toBe('Bob Smith\nEngineer');
  });

  it('collapses the blank line DOCX puts between every paragraph', async () => {
    // Mammoth separates every paragraph with a blank line. Left in place, each line
    // would look like a separate entry and roles would be split apart.
    const docxShaped = Buffer.from(
      ['EXPERIENCE', '', 'Engineer, Acme', '', 'Jan 2020 - Present', '', '- Did a thing'].join(
        '\n',
      ),
    );

    const text = await extractResumeText(docxShaped, 'txt');

    expect(text).toBe('EXPERIENCE\nEngineer, Acme\nJan 2020 - Present\n- Did a thing');
  });

  it('keeps blank lines that genuinely separate entries', async () => {
    // Here adjacent non-empty lines exist, so the blank line is real structure
    // between two roles and must survive.
    const structured = Buffer.from(
      [
        'EXPERIENCE',
        'Engineer, Acme',
        'Jan 2020 - Present',
        '',
        'Analyst, Globex',
        'Jan 2018 - Dec 2019',
      ].join('\n'),
    );

    const text = await extractResumeText(structured, 'txt');

    expect(text.split('\n')).toContain('');
  });

  it('normalizes messy whitespace and bullet glyphs from source documents', async () => {
    const messy = Buffer.from('Name\r\n\r\n\r\n•  Did a thing here\n');
    const text = await extractResumeText(messy, 'txt');

    expect(text).toContain('- Did a thing here');
    expect(text).not.toMatch(/\r/);
  });
});
