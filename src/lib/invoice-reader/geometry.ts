/**
 * Text with its position on the page, as the PDF's own text or OCR gives it, grouped into lines.
 * Coordinates are page pixels, y downwards. Pure (no browser APIs), so it can be unit-tested.
 */

/** A piece of text: an OCR word, or a run of text from a PDF. */
export type Word = { text: string; x0: number; x1: number; y0: number; y1: number };

export type Line = {
  page: number;
  words: Word[];
  /** Words joined; a wide gap (another column) becomes two spaces or more. */
  text: string;
  /** Where each word starts in `text`. */
  starts: number[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Vertical centre. */
  cy: number;
};

/** A number read again from one numeric column of an OCR'd page (digits only), as a second opinion. */
export type Reread = { key: "qty" | "rate" | "amount"; word: Word };

export type PageText = { width: number; height: number; words: Word[]; rereads?: Reread[] };

/** How the text was obtained: the PDF's own text (exact) or OCR of a scan or photo (check it). */
export type DocText = { pages: PageText[]; source: "text" | "ocr" };

const centre = (w: Word) => (w.y0 + w.y1) / 2;
const height = (w: Word) => Math.max(1, w.y1 - w.y0);

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Words whose vertical centres are close (within half a text height) share a line; each line reads
 * left to right. Scans are rarely perfectly level, so a line follows its words' running centre.
 */
export function groupIntoLines(words: Word[], page = 0): Line[] {
  const clean = words.filter((w) => w.text.trim() !== "");
  const h = median(clean.map(height)) || 10;
  const sorted = [...clean].sort((a, b) => centre(a) - centre(b) || a.x0 - b.x0);
  const groups: { cy: number; words: Word[] }[] = [];
  for (const w of sorted) {
    const cy = centre(w);
    // Only the last few lines can still be open (words come in order of height on the page).
    let best: (typeof groups)[number] | null = null;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 4; i--) {
      const g = groups[i];
      const d = Math.abs(g.cy - cy);
      if (d <= h * 0.5 && (!best || d < Math.abs(best.cy - cy))) best = g;
    }
    if (best) {
      best.words.push(w);
      best.cy = best.words.reduce((s, x) => s + centre(x), 0) / best.words.length;
    } else groups.push({ cy, words: [w] });
  }
  return groups.map((g) => makeLine(g.words, page, h)).sort((a, b) => a.cy - b.cy);
}

function makeLine(words: Word[], page: number, h: number): Line {
  const ws = [...words].sort((a, b) => a.x0 - b.x0);
  let text = "";
  const starts: number[] = [];
  ws.forEach((w, i) => {
    if (i > 0) {
      const gap = w.x0 - ws[i - 1].x1;
      // A gap wider than about two characters separates columns.
      text += gap > h * 1.2 ? "   " : " ";
    }
    starts.push(text.length);
    text += w.text.trim();
  });
  return {
    page,
    words: ws,
    text,
    starts,
    x0: Math.min(...ws.map((w) => w.x0)),
    x1: Math.max(...ws.map((w) => w.x1)),
    y0: Math.min(...ws.map((w) => w.y0)),
    y1: Math.max(...ws.map((w) => w.y1)),
    cy: ws.reduce((s, w) => s + centre(w), 0) / ws.length,
  };
}

/** The words of `line` covering text[from, to). */
export function wordsInSpan(line: Line, from: number, to: number) {
  return line.words.filter((w, i) => {
    const s = line.starts[i];
    const e = s + w.text.trim().length;
    return e > from && s < to;
  });
}

/**
 * Typical text height (for distances such as "a few lines below"). Measured on words, not lines: on
 * a skewed scan a grouped line is taller than its text.
 */
export function lineHeight(lines: Line[]) {
  return median(lines.flatMap((l) => l.words.map(height))) || 10;
}
