/**
 * Turns an invoice file into text with positions, in the browser (no server, no AI):
 * - a PDF with text (most e-invoices, Tally / ERP PDFs): pdf.js reads each piece of text and where it is;
 * - a scanned PDF page (almost no text) or a photo: Tesseract OCR, on the page enlarged to about
 *   2,500 px wide (small print reads much better that way). Then the item table's Qty / Rate /
 *   Amount columns are read again, digits only, in two ways: second opinions the table reader
 *   weighs (the readings where quantity × rate = amount win).
 * Both libraries load only when an invoice is read. Their workers / OCR data come from jsDelivr.
 */
import { groupIntoLines, type DocText, type PageText, type Reread, type Word } from "./geometry";
import { numericStrips } from "./table";

export type Progress = (message: string, fraction?: number) => void;

const OCR_WIDTH = 2500;
const MAX_PAGES = 4;
/** Fewer letters and digits than this on a PDF page: it's a scan. */
const MIN_TEXT = 30;

type Tesseract = typeof import("tesseract.js");
type Ocr = { T: Tesseract; worker: Awaited<ReturnType<Tesseract["createWorker"]>>; stage: string };

async function ocrWorker(progress: Progress): Promise<Ocr> {
  const T = await import("tesseract.js");
  progress("Loading the text reader (first time takes a few seconds)…");
  const ocr: Ocr = { T, worker: null!, stage: "Reading (OCR)…" };
  ocr.worker = await T.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") progress(ocr.stage, m.progress);
    },
  });
  await ocr.worker.setParameters({ preserve_interword_spaces: "1" });
  return ocr;
}

function wordsOf(data: Awaited<ReturnType<Ocr["worker"]["recognize"]>>["data"]): Word[] {
  const words: Word[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 });
  return words;
}

/** OCR of a page, then the item table's numeric columns again, digits only (two layouts). */
async function ocr(o: Ocr, canvas: HTMLCanvasElement, label: string): Promise<PageText> {
  o.stage = `Reading ${label} (OCR)…`;
  const words = wordsOf((await o.worker.recognize(canvas, {}, { blocks: true })).data);
  const strips = numericStrips(groupIntoLines(words, 0), 0);
  const rereads: Reread[] = [];
  if (strips.length) {
    o.stage = `Checking the numbers on ${label}…`;
    try {
      for (const psm of [o.T.PSM.SINGLE_COLUMN, o.T.PSM.SPARSE_TEXT]) {
        await o.worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: "0123456789.," });
        for (const s of strips) {
          const { data } = await o.worker.recognize(canvas, { rectangle: s.rect }, { blocks: true });
          for (const word of wordsOf(data)) rereads.push({ key: s.key, word });
        }
      }
    } finally {
      await o.worker.setParameters({ tessedit_pageseg_mode: o.T.PSM.AUTO, tessedit_char_whitelist: "" });
    }
  }
  return { width: canvas.width, height: canvas.height, words, rereads };
}

/**
 * A picture drawn large and in grey (what OCR reads best). Enlarged by a whole number (2×, 3×):
 * in tests on a 150 dpi scan, 2× read far more numbers right than 1.96× (blurred in between).
 */
function toCanvas(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(3, Math.max(1, Math.round(OCR_WIDTH / width)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = "high";
  g.filter = "grayscale(1)";
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function readPdf(data: ArrayBuffer, progress: Progress): Promise<DocText> {
  const pdfjs = await import("pdfjs-dist");
  // The worker script of the same version, from the CDN (pdf.js wraps a cross-origin worker itself).
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(doc.numPages, MAX_PAGES);
  const pages: PageText[] = [];
  let reader: Ocr | null = null;
  let ocred = false;
  try {
    for (let n = 1; n <= count; n++) {
      progress(`Reading page ${n} of ${count}…`);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words: Word[] = [];
      let letters = 0;
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        letters += (item.str.match(/[A-Za-z0-9]/g) ?? []).length;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;
        // One word at a time ("2,500.000 KGS" is a quantity and a unit), each placed by its characters.
        const perChar = item.width / Math.max(1, item.str.length);
        for (const m of item.str.matchAll(/\S+/g)) {
          const x0 = x + (m.index ?? 0) * perChar;
          words.push({ text: m[0], x0, x1: x0 + m[0].length * perChar, y0: y - size, y1: y });
        }
      }
      if (letters >= MIN_TEXT) {
        pages.push({ width: viewport.width, height: viewport.height, words });
        continue;
      }
      // A scanned page: draw it large and read it with OCR. The scan inside is drawn at a whole
      // multiple of its own pixels (a 1,276 px scan at 2×), which OCR reads far better than an
      // in-between size.
      const ops = await page.getOperatorList();
      let scanWidth = 0;
      ops.fnArray.forEach((fn, i) => {
        const w = ops.argsArray[i]?.[1];
        if (fn === pdfjs.OPS.paintImageXObject && typeof w === "number") scanWidth = Math.max(scanWidth, w);
      });
      const width = scanWidth > 0 ? scanWidth * Math.min(3, Math.max(1, Math.round(OCR_WIDTH / scanWidth))) : OCR_WIDTH;
      const big = page.getViewport({ scale: Math.min(6, width / viewport.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(big.width);
      canvas.height = Math.round(big.height);
      await page.render({ canvas, viewport: big }).promise;
      reader ??= await ocrWorker(progress);
      pages.push(await ocr(reader, toCanvas(canvas, canvas.width, canvas.height), `page ${n} of ${count}`));
      ocred = true;
    }
  } finally {
    await reader?.worker.terminate();
    await doc.loadingTask.destroy();
  }
  return { pages, source: ocred ? "ocr" : "text" };
}

async function readImage(file: Blob, progress: Progress): Promise<DocText> {
  const bitmap = await createImageBitmap(file);
  const reader = await ocrWorker(progress);
  try {
    return { pages: [await ocr(reader, toCanvas(bitmap, bitmap.width, bitmap.height), "the photo")], source: "ocr" };
  } finally {
    bitmap.close();
    await reader.worker.terminate();
  }
}

export const isPdf = (file: { type: string; name?: string }) => file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");

/** Text with positions from a PDF or a photo of an invoice. */
export async function readFileText(file: Blob & { name?: string }, progress: Progress = () => {}): Promise<DocText> {
  if (isPdf(file)) return readPdf(await file.arrayBuffer(), progress);
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name ?? "")) return readImage(file, progress);
  throw new Error("Choose a PDF or a photo (JPG, PNG, WebP) of the invoice.");
}
