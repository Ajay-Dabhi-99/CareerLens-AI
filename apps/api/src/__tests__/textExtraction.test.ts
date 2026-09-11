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
function buildPdf(lines: string[]): Buffer {
  const body = lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join('\n');
  const content = `BT /F1 12 Tf 72 720 Td 14 TL\n${body}\nET`;

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

  it('reads plain text verbatim', async () => {
    const text = await extractResumeText(Buffer.from('Bob Smith\nEngineer\n'), 'txt');
    expect(text).toBe('Bob Smith\nEngineer');
  });

  it('normalizes messy whitespace and bullet glyphs from source documents', async () => {
    const messy = Buffer.from('Name\r\n\r\n\r\n•  Did a thing here\n');
    const text = await extractResumeText(messy, 'txt');

    expect(text).toContain('- Did a thing here');
    expect(text).not.toMatch(/\r/);
  });
});
