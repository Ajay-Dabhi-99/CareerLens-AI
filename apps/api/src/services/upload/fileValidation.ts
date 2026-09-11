export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type ResumeFileType = 'pdf' | 'docx' | 'txt';

export interface FileValidationSuccess {
  ok: true;
  fileType: ResumeFileType;
}

export interface FileValidationFailure {
  ok: false;
  reason: string;
}

export type FileValidationResult = FileValidationSuccess | FileValidationFailure;

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
/** DOCX is a ZIP container, so it starts with the local file header signature. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FIRST_PRINTABLE = 0x20;
const DELETE_CHAR = 0x7f;

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

/**
 * Plain text has no magic number, so accept it only if the bytes decode as UTF-8
 * and contain no control characters beyond ordinary whitespace. This keeps binary
 * payloads from slipping through with a .txt extension.
 */
function looksLikePlainText(buffer: Buffer): boolean {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (decoded.includes('�')) return false;

  for (const char of decoded) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) continue;
    if (code < FIRST_PRINTABLE || code === DELETE_CHAR) return false;
  }

  return true;
}

/**
 * Validates an uploaded resume by inspecting its actual bytes.
 *
 * The declared filename and MIME type are attacker-controlled, so they are only
 * used to pick which signature to expect — never as proof of the file's type.
 */
export function validateResumeFile(
  buffer: Buffer,
  declaredName: string,
  declaredMimeType: string,
): FileValidationResult {
  if (buffer.length === 0) {
    return { ok: false, reason: 'The file is empty.' };
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `The file is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const extension = declaredName.toLowerCase().split('.').pop() ?? '';

  if (startsWith(buffer, PDF_MAGIC)) {
    return { ok: true, fileType: 'pdf' };
  }

  if (startsWith(buffer, ZIP_MAGIC)) {
    // A .zip renamed to .docx would also land here, so require the extension to agree.
    if (extension === 'docx') {
      return { ok: true, fileType: 'docx' };
    }
    return { ok: false, reason: 'That looks like a zip archive rather than a DOCX resume.' };
  }

  if (looksLikePlainText(buffer)) {
    if (extension === 'txt' || declaredMimeType.startsWith('text/')) {
      return { ok: true, fileType: 'txt' };
    }
    return { ok: false, reason: 'That file is plain text but is not named .txt.' };
  }

  return { ok: false, reason: 'Only PDF, DOCX and TXT resumes are supported.' };
}
