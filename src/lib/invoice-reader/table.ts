/**
 * The item table: found by its header row (Description … Qty … Rate … Amount), columns placed by
 * the header words, rows anchored on the amount (or rate) column. Charge lines (freight, packing),
 * tax lines (IGST/CGST/SGST), subtotals and round-off are told apart from items.
 */
import { lineHeight, type Line, type Reread, type Word } from "./geometry";
import { parseNumber } from "./parse";
import { unitKey } from "@/lib/units";

type ColKey = "sno" | "desc" | "hsn" | "qty" | "unit" | "rate" | "disc" | "amount";

const HEADER_WORDS: [ColKey, RegExp][] = [
  ["sno", /^(s\.?no|sl|slno|sr|srno|sno|#)\.?$/i],
  ["desc", /^(description|descripti|particulars|item|items|goods|material|product|products|services)/i],
  ["hsn", /(hsn|sac)/i],
  ["qty", /^(qty|qnty|quantity|uantity|quantit|quan)/i],
  ["unit", /^(per|uom|unit|units)$/i],
  ["rate", /^(rate|price)/i],
  ["disc", /^(disc|discount)/i],
  ["amount", /^(amount|amour|amt|value)/i],
];

type Column = { key: ColKey; x0: number; x1: number };

export type TableHeader = { page: number; y0: number; y1: number; columns: Column[] };

export type RowKind = "item" | "charge" | "tax" | "subtotal" | "roundoff" | "other";

export type TableRow = {
  kind: RowKind;
  description: string;
  hsn: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  /** GST % written on the line ("Freight 18%"), for charges. */
  percent: number | null;
  page: number;
  y: number;
  /** The numbers as printed (or OCR read them), to judge which one to trust. */
  raw?: { qty?: string; rate?: string; amount?: string };
};

const clean = (t: string) => t.replace(/[^A-Za-z#/.]/g, "");

/** Description text without OCR specks: stray punctuation around words ("SYNTHETIC:", "|EPDM"). */
export function tidy(text: string) {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[|:;,.'"`~_\-—=©®»«{}[\]]+|[|:;,'"`~_\-—=©®»«{}[\]]+$/g, ""))
    .filter((w) => /[A-Za-z0-9]/.test(w))
    .join(" ");
}

/** The first band of up to three lines naming an amount column and a quantity or rate column. */
export function findTableHeader(lines: Line[], page: number): TableHeader | null {
  const onPage = lines.filter((l) => l.page === page);
  const h = lineHeight(onPage);
  for (let i = 0; i < onPage.length; i++) {
    const band = onPage.slice(i).filter((l) => l.y0 - onPage[i].y0 <= h * 2.6);
    const found = new Map<ColKey, Column>();
    let bottom = onPage[i].y1;
    for (const l of band) {
      for (const w of l.words) {
        const t = clean(w.text);
        if (!t) continue;
        const hit = HEADER_WORDS.find(([, re]) => re.test(t));
        if (!hit || found.has(hit[0])) continue;
        found.set(hit[0], { key: hit[0], x0: w.x0, x1: w.x1 });
        bottom = Math.max(bottom, l.y1);
      }
    }
    if (found.has("amount") && (found.has("qty") || found.has("rate"))) {
      const columns = [...found.values()].sort((a, b) => a.x0 - b.x0);
      // A word in a GST summary ("Rate" of tax) left of the description makes no sense: drop it.
      return { page, y0: onPage[i].y0, y1: bottom, columns };
    }
  }
  return null;
}

/** Where a column ends: the point in the gap between two header words that the fewest data words straddle. */
function boundary(left: Column, right: Column, words: Word[]) {
  const from = Math.min(left.x1, right.x0);
  const to = Math.max(left.x1, right.x0);
  if (to - from < 2) return (left.x1 + right.x0) / 2;
  const xs = Array.from({ length: Math.floor(to - from) + 1 }, (_, i) => from + i);
  const crossing = xs.map((x) => words.filter((w) => w.x0 < x && w.x1 > x).length);
  const least = Math.min(...crossing);
  // The middle of the longest stretch with the fewest straddling words.
  let best: [number, number] = [0, 0];
  for (let i = 0; i < xs.length; i++) {
    if (crossing[i] !== least) continue;
    let j = i;
    while (j + 1 < xs.length && crossing[j + 1] === least) j++;
    if (j - i > best[1] - best[0]) best = [i, j];
    i = j;
  }
  return (xs[best[0]] + xs[best[1]]) / 2;
}

const TABLE_END = /amount\s*chargeable|in\s*words|rupees\s.*only|declaration|terms\s*(&|and)\s*conditions|bank\s*details|e\s*\.?\s*&\s*o\s*\.?\s*e/i;
const TOTAL_LINE = /(^|\s)(grand\s*)?total\b/i;
const SUBTOTAL = /sub\s*-?\s*total/i;

const CHARGE = /freight|cartage|packing|forwarding|transport|loading|unloading|insurance|courier|handling|delivery\s*charge/i;
// IGST / CGST / SGST / UTGST, also as OCR reads them ("16ST", "C6ST").
const TAX = /\b(?:[i1l|]|[cs]|ut)\s*\.?\s*[g6]\s*[s5]\s*[t7]\b|\bgst\b|\btax\b/i;
const ROUND = /round(ed)?\s*-?\s*off|r\s*\/\s*off/i;
const UNITS = ["kg", "g", "ton", "ltr", "ml", "pcs", "nos", "bag", "bale", "drum", "box", "pkt", "mtr", "set", "pair", "each", "ea", "roll", "sqm", "sqft", "rmt", "can", "coil", "sheet", "dozen", "kl", "quintal"];

/** A unit word ("KGS", OCR'd "kes|" → kg), or null. One misread letter is allowed when that is unambiguous. */
export function unitOf(raw: string) {
  const t = raw.replace(/[^A-Za-z.]/g, "").replace(/\.$/, "");
  if (t.length < 1 || t.length > 6) return null;
  const k = unitKey(t);
  if (UNITS.includes(k)) return k;
  const spelled = ["kgs", "nos", "pcs", "mtr", "ltr", "bag", "set", "box"];
  const near = spelled.filter((u) => u.length === t.length && [...u].filter((c, i) => c !== t[i].toLowerCase()).length === 1);
  return near.length === 1 ? unitKey(near[0]) : null;
}

/** The table's lines and columns on a page: header, body (up to the total), column edges. */
function layout(lines: Line[], page: number) {
  const header = findTableHeader(lines, page);
  if (!header) return null;
  const onPage = lines.filter((l) => l.page === page);
  const h = lineHeight(onPage);

  // The table's lines: under the header, up to the total / amount-in-words.
  const body: Line[] = [];
  let end: Line | null = null;
  for (const l of onPage) {
    if (l.y0 <= header.y1 - h * 0.3) continue;
    if (TABLE_END.test(l.text) || (TOTAL_LINE.test(l.text) && !SUBTOTAL.test(l.text) && body.length > 0)) {
      end = l;
      break;
    }
    body.push(l);
  }
  // Where the table's numbers stop: through a "Total" line (its amount is the grand total), before the amount in words.
  const bottom = end ? (TABLE_END.test(end.text) ? end.y0 : end.y1 + h * 0.5) : (body[body.length - 1]?.y1 ?? header.y1) + h * 2;

  // Column edges.
  const words = body.flatMap((l) => l.words);
  const cols = header.columns;
  const edges: number[] = [];
  for (let k = 0; k + 1 < cols.length; k++) {
    // Description text is left-aligned and runs right up to the next column.
    edges.push(cols[k].key === "desc" ? cols[k + 1].x0 - h * 0.4 : boundary(cols[k], cols[k + 1], words));
  }
  // No (readable) description header: the text left of the first column is the description,
  // except a serial number at the far left.
  const hasDesc = cols.some((c) => c.key === "desc");
  const columnOf = (w: Word): ColKey => {
    const xc = (w.x0 + w.x1) / 2;
    if (!hasDesc && xc < cols[0].x0 - h * 0.4) return "desc";
    let k = 0;
    while (k < edges.length && xc > edges[k]) k++;
    return cols[k].key;
  };
  const right = Math.max(cols[cols.length - 1].x1, ...words.map((w) => w.x1));
  return { header, h, body, bottom, edges, columnOf, right };
}

export type Strip = { key: Reread["key"]; rect: { left: number; top: number; width: number; height: number } };

/**
 * Where to read the numbers again on an OCR'd page: each Qty / Rate / Amount column, from the
 * header down through the total line. Read digits-only, they come out much more reliably.
 */
export function numericStrips(lines: Line[], page: number): Strip[] {
  const L = layout(lines, page);
  if (!L || !L.body.length) return [];
  const { header, h, edges, bottom } = L;
  const cols = header.columns;
  const top = header.y1 + h * 0.2;
  return cols.flatMap((c, k): Strip[] => {
    if (c.key !== "qty" && c.key !== "rate" && c.key !== "amount") return [];
    const left = k > 0 ? edges[k - 1] : c.x0 - h * 3;
    const right = k < edges.length ? edges[k] : L.right + h;
    if (right - left < h) return [];
    return [{ key: c.key, rect: { left: Math.max(0, Math.floor(left)), top: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top) } }];
  });
}

const fits = (q: number, r: number, a: number) => Math.abs(q * r - a) <= Math.max(1, a * 0.002);
const wellFormed = (raw: string) => /\d\.\d{2,3}(?!\d)/.test(raw);

type Reading = { value: number; raw: string; votes: number; clean: boolean };

/** Readings of one cell (first pass and digits-only re-reads), the most agreed-on first. */
function tally(cells: { value: number | null; word: Word }[]): Reading[] {
  const out: Reading[] = [];
  for (const c of cells) {
    if (c.value === null) continue;
    const same = out.find((r) => Math.abs(r.value - c.value!) < 1e-9);
    if (same) {
      same.votes++;
      same.clean ||= wellFormed(c.word.text);
    } else out.push({ value: c.value, raw: c.word.text, votes: 1, clean: wellFormed(c.word.text) });
  }
  return out.sort((a, b) => b.votes - a.votes || Number(b.clean) - Number(a.clean));
}

export function readTable(lines: Line[], page: number, rereads: Reread[] = []): { header: TableHeader; rows: TableRow[]; below: number[] } | null {
  const L = layout(lines, page);
  if (!L) return null;
  const { header, h, body, bottom, columnOf } = L;
  if (!body.length) return { header, rows: [], below: [] };

  type Cell = { key: ColKey; word: Word; y: number; value: number | null };
  const bodyEnd = body[body.length - 1].y1 + h * 0.3;
  const cells: Cell[] = [
    ...body.flatMap((l) => l.words.map((w) => ({ key: columnOf(w), word: w, y: (w.y0 + w.y1) / 2, value: parseNumber(w.text) }))),
    ...rereads.map((r) => ({ key: r.key, word: r.word, y: (r.word.y0 + r.word.y1) / 2, value: parseNumber(r.word.text) })).filter((c) => c.y <= bodyEnd),
  ];
  // Amounts re-read below the table (the total line): candidates for the grand total.
  const below = rereads
    .filter((r) => r.key === "amount" && (r.word.y0 + r.word.y1) / 2 > bodyEnd && r.word.y0 < bottom + h)
    .map((r) => parseNumber(r.word.text))
    .filter((n): n is number => n !== null);

  // Anchors: one per row, at its amount (or, when the amount is unreadable, its rate). Readings of
  // the same amount (first pass, re-reads) close together are one row.
  const anchors: { y: number; amounts: Cell[] }[] = [];
  for (const c of cells.filter((c) => c.key === "amount" && c.value !== null).sort((a, b) => a.y - b.y)) {
    const last = anchors[anchors.length - 1];
    if (last && Math.abs(last.y - c.y) < h * 0.45) last.amounts.push(c);
    else anchors.push({ y: c.y, amounts: [c] });
  }
  for (const c of cells.filter((c) => c.key === "rate" && c.value !== null)) {
    if (!anchors.some((a) => Math.abs(a.y - c.y) < h * 0.9)) anchors.push({ y: c.y, amounts: [] });
  }
  anchors.sort((a, b) => a.y - b.y);

  const band = (i: number) => {
    const up = i > 0 ? (anchors[i].y - anchors[i - 1].y) / 2 : h * 1.2;
    const down = i + 1 < anchors.length ? (anchors[i + 1].y - anchors[i].y) / 2 : h * 1.2;
    return [anchors[i].y - Math.min(up, h * 1.2), anchors[i].y + Math.min(down, h * 1.2)] as const;
  };
  const nearest = (key: ColKey, i: number, numeric: boolean) => {
    const [lo, hi] = band(i);
    return cells
      .filter((c) => c.key === key && c.y >= lo && c.y <= hi && (numeric ? c.value !== null : true))
      .sort((a, b) => Math.abs(a.y - anchors[i].y) - Math.abs(b.y - anchors[i].y));
  };

  const rows: TableRow[] = anchors.map((a, i) => {
    const amounts = tally(a.amounts);
    const rates = tally(nearest("rate", i, true));
    const qtys = tally(nearest("qty", i, true));
    // The readings that agree (quantity × rate = amount), most votes first; else the most agreed-on of each.
    let pick: [Reading | undefined, Reading | undefined, Reading | undefined] = [qtys[0], rates[0], amounts[0]];
    let best = -1;
    for (const am of amounts)
      for (const r of rates)
        for (const q of qtys) {
          if (!fits(q.value, r.value, am.value)) continue;
          const score = q.votes + r.votes + am.votes + 0.5 * (Number(q.clean) + Number(r.clean) + Number(am.clean));
          if (score > best) {
            best = score;
            pick = [q, r, am];
          }
        }
    const [q, r, am] = pick;
    const unitWord = [...nearest("unit", i, false), ...nearest("qty", i, false)].map((c) => unitOf(c.word.text)).find(Boolean) ?? null;
    const hsnCell = nearest("hsn", i, false).find((c) => /^\D?\d{4,8}\D?$/.test(c.word.text.trim()));
    return {
      kind: "other",
      description: "",
      hsn: hsnCell ? hsnCell.word.text.replace(/\D/g, "") : null,
      qty: q?.value ?? null,
      unit: unitWord,
      rate: r?.value ?? null,
      amount: am?.value ?? null,
      raw: { qty: q?.raw, rate: r?.raw, amount: am?.raw },
      percent: null,
      page,
      y: a.y,
    };
  });

  // Description fragments: each line's words in the description column. Header words that spilled
  // into the first lines (a garbled "Description of Goods") sit above the first row: dropped.
  const firstY = anchors.length ? anchors[0].y : Infinity;
  type Fragment = { y: number; x0: number; x1: number; text: string; keyword: RowKind | null };
  const keywordOf = (text: string): RowKind | null => (ROUND.test(text) ? "roundoff" : CHARGE.test(text) ? "charge" : TAX.test(text) ? "tax" : null);
  let fragments = body
    .map((l): Fragment | null => {
      const all = l.words.filter((w) => columnOf(w) === "desc" && /[A-Za-z0-9]{2,}/.test(w.text));
      // Where the line starts, ignoring specks (1–2 letter OCR noise at the scan's edge), which are dropped.
      const solid = all.filter((w) => w.text.replace(/[^A-Za-z0-9]/g, "").length >= 3 || /\d/.test(w.text));
      if (!all.length) return null;
      const x0 = Math.min(...(solid.length ? solid : all).map((w) => w.x0));
      const ws = all.filter((w) => w.x0 >= x0);
      const text = ws.map((w) => w.text).join(" ");
      const x1 = Math.max(...ws.map((w) => w.x1));
      return { y: ws.reduce((s, w) => s + (w.y0 + w.y1) / 2, 0) / ws.length, x0, x1, text, keyword: keywordOf(text) };
    })
    // Header words that spilled into the first lines (a garbled "Description of Goods") sit above the first row.
    .filter((f): f is Fragment => f !== null && f.y >= firstY - h * 0.6);

  // Items: rows with a quantity or rate — above the first subtotal (an amount equal to the items so
  // far) or freight / tax label. Below those come only charges, taxes and totals: a garbled
  // "Total   3,018.000 KGS   11,01,530.00" line has numbers but is no item.
  const firstItem = rows.findIndex((r) => r.qty !== null || r.rate !== null);
  const firstLabel = Math.min(Infinity, ...fragments.filter((f) => f.keyword && firstItem >= 0 && f.y > rows[firstItem].y).map((f) => f.y));
  let running = 0;
  let cutoff = firstLabel - h * 1.2;
  rows.forEach((r) => {
    if (r.y >= cutoff) return;
    if (r.qty !== null || r.rate !== null) running += r.amount ?? 0;
    else if (running > 0 && r.amount !== null && Math.abs(r.amount - running) <= 1) cutoff = r.y;
  });
  const isItem = rows.map((r) => (r.qty !== null || r.rate !== null) && r.y < cutoff);
  const itemsTotal = rows.reduce((s, r, i) => s + (isItem[i] ? (r.amount ?? 0) : 0), 0);
  const lastItemY = Math.max(-Infinity, ...rows.filter((_, i) => isItem[i]).map((r) => r.y));

  // A charge label OCR split over two lines ("18% (INTER-STATE)" / "SALES FREIGHT"): one label.
  for (const f of fragments) {
    if (f.keyword || f.y <= lastItemY + h * 0.5) continue;
    const label = fragments.find((g) => g.keyword && Math.abs(g.y - f.y) <= h * 1.1);
    if (label) {
      label.text = f.y < label.y ? `${f.text} ${label.text}` : `${label.text} ${f.text}`;
      f.text = "";
    }
  }
  fragments = fragments.filter((f) => f.text);

  // Item text. A row's first line is level with its numbers (a scan may print the numbers half a
  // line higher); lines indented from the lines around them ("100 BAGS", batch notes) continue the
  // item above, even where they sit level with the next row's numbers. Indentation is compared with
  // the neighbouring lines, so a slightly rotated scan doesn't matter.
  const parts: string[][] = rows.map(() => []);
  const plain: Fragment[] = [];
  for (const f of fragments.filter((f) => !f.keyword && f.y <= lastItemY + h * 4)) {
    // One printed line that a skewed scan split in two ("… ROYALENE" and "580HT" a little higher):
    // side by side, never overlapping. Joined left to right.
    const prev = plain[plain.length - 1];
    if (prev && Math.abs(prev.y - f.y) <= h * 1.1 && (f.x0 > prev.x1 || f.x1 < prev.x0)) {
      const [left, right] = f.x0 > prev.x1 ? [prev, f] : [f, prev];
      plain[plain.length - 1] = { ...left, text: `${left.text} ${right.text}`, x0: Math.min(prev.x0, f.x0), x1: Math.max(prev.x1, f.x1), y: Math.max(prev.y, f.y) };
    } else plain.push(f);
  }
  let current = -1;
  plain.forEach((f, k) => {
    const around = [plain[k - 1], plain[k + 1]].filter(Boolean).map((g) => g!.x0);
    const indented = around.length > 0 && f.x0 > Math.min(...around) + h * 0.5;
    if (!indented || current < 0) {
      let at = -1;
      rows.forEach((r, i) => {
        if (isItem[i] && r.y <= f.y + h * 0.5) at = i;
      });
      current = at >= 0 ? at : isItem.indexOf(true);
    }
    if (current >= 0) parts[current].push(f.text);
  });

  // Charges, taxes and round-off after the items: their labels and amounts in the same order
  // (each label with the next unused amount below the items), however the scan shifted them.
  const extras = rows
    .map((r, i) => i)
    .filter((i) => !isItem[i] && rows[i].amount !== null && rows[i].y > lastItemY && rows[i].amount! < itemsTotal - 1);
  const labels = fragments.filter((f) => f.keyword && f.y > lastItemY - h * 0.5);
  labels.forEach((f, k) => {
    const i = extras[k];
    if (i === undefined) return;
    const r = rows[i];
    r.kind = f.keyword!;
    r.description = f.text;
    const pct = f.text.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
    if (r.kind === "charge") r.percent = pct ? Number(pct[1]) : null;
  });

  rows.forEach((r, i) => {
    if (isItem[i]) {
      r.kind = "item";
      r.description = tidy(parts[i].join(" "));
    } else if (r.kind === "other" && r.amount !== null && itemsTotal > 0 && Math.abs(r.amount - itemsTotal) <= 1) r.kind = "subtotal";
  });
  // Every reading of an unclaimed amount below the items (the total line, garbled): grand total
  // candidates. Freight, tax and subtotal amounts never are.
  rows.forEach((r, i) => {
    if (r.kind === "other" && r.y > lastItemY) below.push(...tally(anchors[i].amounts).map((x) => x.value));
  });

  // Unreadable units: the unit most rows show.
  const units = rows.filter((r) => r.kind === "item" && r.unit).map((r) => r.unit!);
  const common = units.length ? units.sort((a, b) => units.filter((u) => u === b).length - units.filter((u) => u === a).length)[0] : null;
  for (const r of rows) if (r.kind === "item" && !r.unit && common) r.unit = common;
  return { header, rows, below };
}
