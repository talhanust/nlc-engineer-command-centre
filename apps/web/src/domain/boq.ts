import type { BoqItem } from '../data/types';

/** Line amount. unitDivisor (1/100/1000 in the schema) defaults to 1 here. */
export function itemAmount(qty: number, rate: number, unitDivisor = 1): number {
  return (qty * rate) / (unitDivisor || 1);
}

export function boqTotal(items: BoqItem[]): number {
  return items.reduce((a, i) => a + i.amount, 0);
}

export interface BillGroup {
  billNo: string;
  items: BoqItem[];
  total: number;
}

export function groupByBill(items: BoqItem[]): BillGroup[] {
  const map = new Map<string, BoqItem[]>();
  for (const it of items) {
    const arr = map.get(it.billNo) ?? [];
    arr.push(it);
    map.set(it.billNo, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([billNo, list]) => ({ billNo, items: list, total: boqTotal(list) }));
}

/** Parse pasted CSV/TSV with a header row, fuzzy-matching the columns we need. */
export interface ParsedRow {
  billNo: string;
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
}

export const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  billNo: ['bill', 'billno', 'bill no', 'bill_no'],
  code: ['code', 'item', 'itemcode', 'item code', 'sr', 'srno', 'sr no'],
  description: ['description', 'desc', 'particulars', 'work'],
  unit: ['unit', 'uom'],
  qty: ['qty', 'quantity', 'quantum'],
  rate: ['rate', 'unit rate', 'price'],
};

export function parseBoqPaste(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'Need a header row and at least one data row.' };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());

  const idx = (field: keyof ParsedRow): number =>
    headers.findIndex((h) => HEADER_ALIASES[field].includes(h));
  const ci = {
    billNo: idx('billNo'), code: idx('code'), description: idx('description'),
    unit: idx('unit'), qty: idx('qty'), rate: idx('rate'),
  };
  if (ci.description < 0 || ci.qty < 0 || ci.rate < 0) {
    return { rows: [], error: 'Could not find description, qty and rate columns.' };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim).map((x) => x.trim());
    const qtyRaw = c[ci.qty] ?? '';
    const rateRaw = c[ci.rate] ?? '';
    if (qtyRaw === '' || rateRaw === '') continue;
    const qty = Number(qtyRaw.replace(/,/g, ''));
    const rate = Number(rateRaw.replace(/,/g, ''));
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) continue;
    rows.push({
      billNo: ci.billNo >= 0 ? c[ci.billNo] || '1' : '1',
      code: ci.code >= 0 ? c[ci.code] || String(i) : String(i),
      description: c[ci.description] || '',
      unit: ci.unit >= 0 ? c[ci.unit] || '' : '',
      qty,
      rate,
    });
  }
  return { rows };
}
