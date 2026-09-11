import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  validateResumeFile,
} from '../services/upload/fileValidation.js';

const pdf = (extra = 'fake pdf body') => Buffer.from(`%PDF-1.7\n${extra}`, 'utf8');
const docx = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('zipbody')]);

describe('validateResumeFile', () => {
  it('accepts a PDF by its signature', () => {
    expect(validateResumeFile(pdf(), 'cv.pdf', 'application/pdf')).toEqual({
      ok: true,
      fileType: 'pdf',
    });
  });

  it('accepts a DOCX when the zip signature and extension agree', () => {
    expect(
      validateResumeFile(
        docx(),
        'cv.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toEqual({ ok: true, fileType: 'docx' });
  });

  it('accepts plain text', () => {
    const result = validateResumeFile(Buffer.from('Jane Doe\nEngineer\n'), 'cv.txt', 'text/plain');
    expect(result).toEqual({ ok: true, fileType: 'txt' });
  });

  it('trusts the bytes over a lying MIME type', () => {
    // Claims to be a PDF, but the bytes are a zip without a .docx extension.
    const result = validateResumeFile(docx(), 'payload.zip', 'application/pdf');
    expect(result.ok).toBe(false);
  });

  it('rejects a renamed executable', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ header
    const result = validateResumeFile(exe, 'cv.pdf', 'application/pdf');
    expect(result.ok).toBe(false);
  });

  it('rejects a zip masquerading as a DOCX by extension alone', () => {
    const result = validateResumeFile(docx(), 'cv.zip', 'application/zip');
    expect(result).toEqual({
      ok: false,
      reason: 'That looks like a zip archive rather than a DOCX resume.',
    });
  });

  it('rejects an empty file', () => {
    expect(validateResumeFile(Buffer.alloc(0), 'cv.pdf', 'application/pdf')).toEqual({
      ok: false,
      reason: 'The file is empty.',
    });
  });

  it('rejects a file over the size limit', () => {
    const tooBig = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41),
    ]);
    const result = validateResumeFile(tooBig, 'cv.pdf', 'application/pdf');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/larger than/i);
  });

  it('rejects binary content pretending to be text', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = validateResumeFile(binary, 'cv.txt', 'text/plain');
    expect(result.ok).toBe(false);
  });
});
