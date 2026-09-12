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

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rebuilds page text from item positions rather than the order the PDF happens
 * to draw them in.
 *
 * Draw order is not reading order. Real resumes place a section heading in its
 * own text block, and the producer may emit it *after* the content it labels —
 * which made a skills heading arrive below its own bullet list, so the section
 * parsed as empty.
 *
 * Doing this positionally also fixes word splitting: PDFs break words across
 * items for kerning, so inserting a space after every item produced text like
 * "Frontend-f ocused". A space is now added only where there is a real
 * horizontal gap.
 */
function layoutToText(items: PositionedItem[]): string {
  if (items.length === 0) return '';

  // Group items onto visual lines. y is compared with a tolerance because
  // glyphs on one line rarely share an exact baseline.
  const lines: PositionedItem[][] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    const tolerance = Math.max(2, item.height * 0.5);
    const line = lines.find((candidate) => Math.abs((candidate[0]?.y ?? 0) - item.y) <= tolerance);
    if (line) line.push(item);
    else lines.push([item]);
  }

  return lines
    .map((line) => {
      const ordered = [...line].sort((a, b) => a.x - b.x);
      let text = '';

      for (let index = 0; index < ordered.length; index += 1) {
        const item = ordered[index]!;
        if (index === 0) {
          text = item.str;
          continue;
        }

        const previous = ordered[index - 1]!;
        const gap = item.x - (previous.x + previous.width);
        // Roughly a quarter of the glyph height is a reliable word separator;
        // anything tighter is the same word split across items.
        const spaceThreshold = Math.max(1, previous.height * 0.25);
        const needsSpace = gap > spaceThreshold && !text.endsWith(' ') && !item.str.startsWith(' ');

        text += needsSpace ? ` ${item.str}` : item.str;
      }

      return text;
    })
    .join('\n');
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

      const positioned: PositionedItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str === '') continue;
        const transform = item.transform as number[];
        positioned.push({
          str: item.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width: item.width ?? 0,
          height: Math.abs(transform[3] ?? item.height ?? 10) || 10,
        });
      }

      pages.push(layoutToText(positioned));
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
 * Removes blank lines when a document is uniformly double-spaced.
 *
 * Mammoth emits a blank line between every DOCX paragraph, so in that format a
 * blank line carries no meaning. In PDFs and text files blank lines do separate
 * entries, and dropping them would merge unrelated roles together.
 *
 * The two cases are distinguished structurally: a document with real structure
 * has at least one pair of adjacent non-empty lines (a job title followed by its
 * dates, say). A uniformly double-spaced one never does.
 */
function collapseUniformDoubleSpacing(lines: string[]): string[] {
  const hasAdjacentContent = lines.some(
    (line, index) => index > 0 && line !== '' && lines[index - 1] !== '',
  );
  const hasBlankLines = lines.some((line) => line === '');

  if (hasAdjacentContent || !hasBlankLines) return lines;

  return lines.filter((line) => line !== '');
}

/**
 * Collapses the noise real documents carry: exotic spaces, bullet glyphs, smart
 * quotes, carriage returns and runs of blank lines, so section detection sees
 * plain predictable lines regardless of which format the resume arrived in.
 */
export function normalizeExtractedText(raw: string): string {
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(UNUSUAL_SPACES, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(BULLET_GLYPHS, '-')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(LONG_DASHES, '-')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());

  return collapseUniformDoubleSpacing(cleaned).join('\n').trim();
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
