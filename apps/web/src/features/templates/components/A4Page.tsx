import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A4 at 96 CSS pixels per inch: 210mm × 297mm. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
/** 18mm margins, the usual resume default. */
const MARGIN_PX = 68;

/**
 * An A4 sheet, scaled to fit, with page breaks shown where they will fall.
 *
 * The content is laid out at true A4 width and then scaled as a whole, so what
 * wraps on screen is what wraps on paper. Scaling the text instead would make
 * the preview lie about where every line ends.
 *
 * Where the content runs past one page, a dashed rule marks each break. A
 * resume that spills three lines onto page two is one of the most fixable
 * problems there is, and one of the least visible without this.
 */
export function A4Page({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(A4_HEIGHT_PX);

  useEffect(() => {
    const frameEl = frame.current;
    const contentEl = content.current;
    if (!frameEl || !contentEl || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      setScale(Math.min(1, frameEl.clientWidth / A4_WIDTH_PX));
      // Never shorter than one page, so a sparse resume still reads as a sheet.
      setHeight(Math.max(A4_HEIGHT_PX, contentEl.scrollHeight));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, []);

  const pages = Math.ceil(height / A4_HEIGHT_PX);

  return (
    <div className="space-y-2">
      <div ref={frame} className="w-full overflow-hidden" style={{ height: height * scale }}>
        <div
          className="relative origin-top-left bg-white shadow-lg ring-1 ring-black/10"
          style={{ width: A4_WIDTH_PX, height, transform: `scale(${scale})` }}
          data-testid="a4-page"
        >
          <div ref={content} style={{ padding: MARGIN_PX }}>
            {children}
          </div>

          {Array.from({ length: pages - 1 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-rose-400"
              style={{ top: A4_HEIGHT_PX * (index + 1) }}
            >
              <span className="absolute right-2 top-1 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">
                Page {index + 2} starts here
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="page-count">
        {pages === 1
          ? 'Fits on one page.'
          : `Runs to ${pages} pages. Two is fine for a long career; check nothing important sits just past a break.`}
      </p>
    </div>
  );
}
