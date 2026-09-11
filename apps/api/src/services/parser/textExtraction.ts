import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mammoth from 'mammoth';
import type { ResumeFileType } from '../upload/fileValidation.js';

const require = createRequire(import.meta.url);

/**
 * pdf.js ships its standard font data as files; without this it logs a warning
 * per document and can mis-measure text from PDFs that rely on the base 14 fonts.
 */
function standardFontDataUrl(): string {
  const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const root = path.resolve(path.dirname(entry), '..', '..');
  return pathToFileURL(path.join(root, 'standard_fonts') + path.sep).href;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // The legacy build is the one pdf.js supports in Node.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: standardFontDataUrl(),
    // We only read the text layer, so font substitution is wasted work here.
    useSystemFonts: false,
    // Font-substitution warnings fire on most real PDFs and are not actionable
    // when extracting text; genuine failures still reject the promise.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const document = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pageText += item.str;
        // pdf.js marks the end of a visual line, which is how we recover layout.
        if (item.hasEOL) pageText += '\n';
        else if (item.str && !item.str.endsWith(' ')) pageText += ' ';
      }

      pages.push(pageText);
      page.cleanup();
    }

    return pages.join('\n\n');
  } finally {
    // Releases the worker and buffers; leaking these across many uploads is a slow leak.
    await loadingTask.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractTxtText(buffer: Buffer): string {
  return buffer.toString('utf8');
}

/**
 * Character classes built from explicit codepoints so the source stays ASCII —
 * these characters are invisible or easily confused when pasted literally.
 */
function charClass(codepoints: number[], flags = 'g'): RegExp {
  const characters = codepoints.map((code) => String.fromCodePoint(code)).join('');
  return new RegExp(`[${characters}]`, flags);
}

/** Non-breaking, en/em and ideographic spaces that PDFs and Word documents use. */
const UNUSUAL_SPACES = charClass([
  0x00a0, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f,
  0x205f, 0x3000,
]);
/** Zero-width characters, which break keyword matching invisibly. */
const ZERO_WIDTH = charClass([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const BULLET_GLYPHS = charClass([0x2022, 0x25cf, 0x25aa, 0x00b7, 0x2043, 0x2219, 0x25e6, 0x2023]);
const SINGLE_QUOTES = charClass([0x2018, 0x2019, 0x201b]);
const DOUBLE_QUOTES = charClass([0x201c, 0x201d, 0x201f]);
const LONG_DASHES = charClass([0x2013, 0x2014, 0x2212]);

/**
 * Collapses the noise real documents carry: exotic spaces, bullet glyphs, smart
 * quotes, carriage returns and runs of blank lines, so section detection sees
 * plain predictable lines.
 */
export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(UNUSUAL_SPACES, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(BULLET_GLYPHS, '-')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(LONG_DASHES, '-')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractResumeText(
  buffer: Buffer,
  fileType: ResumeFileType,
): Promise<string> {
  const raw =
    fileType === 'pdf'
      ? await extractPdfText(buffer)
      : fileType === 'docx'
        ? await extractDocxText(buffer)
        : extractTxtText(buffer);

  return normalizeExtractedText(raw);
}
