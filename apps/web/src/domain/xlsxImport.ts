import { HEADER_ALIASES, type ParsedRow } from './boq';

export type ColumnMap = Record<keyof ParsedRow, number>;
export const MAP_FIELDS: Array<{ key: keyof ParsedRow; label: string; required: boolean }> = [
  { key: 'billNo', label: 'Bill', required: false },
  { key: 'code', label: 'Code', required: false },
  { key: 'description', label: 'Description', required: true },
  { key: 'unit', label: 'Unit', required: false },
  { key: 'qty', label: 'Quantity', required: true },
  { key: 'rate', label: 'Rate', required: true },
];

export interface Workbook { sheetNames: string[]; grids: Record<string, string[][]> }

/** Read an .xlsx/.xls/.csv file into per-sheet grids of strings (SheetJS lazy-loaded). */
export async function readWorkbook(file: File): Promise<Workbook> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const grids: Record<string, string[][]> = {};
  for (const name of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' }) as unknown[][];
    grids[name] = raw.map((row) => row.map((c) => (c == null ? '' : String(c).trim())));
  }
  return { sheetNames: wb.SheetNames, grids };
}

function looksNumeric(v: string): boolean {
  if (!v) return false;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n);
}

/** Best-effort guess of which grid row holds the column headers. */
export function detectHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = grid[i].map((c) => c.toLowerCase());
    const hasDesc = cells.some((c) => HEADER_ALIASES.description.some((a) => c.includes(a)));
    const hasQty = cells.some((c) => HEADER_ALIASES.qty.some((a) => c === a || c.includes(a)));
    const hasRate = cells.some((c) => HEADER_ALIASES.rate.some((a) => c === a || c.includes(a)));
    if (hasDesc && hasQty && hasRate) return i;
  }
  return 0;
}

/** Map each ParsedRow field to a column index in the header row (or -1 if unmatched). */
export function autoMapColumns(headerCells: string[]): ColumnMap {
  const norm = headerCells.map((h) => h.toLowerCase().trim());
  const find = (field: keyof ParsedRow): number => {
    const aliases = HEADER_ALIASES[field];
    let i = norm.findIndex((h) => aliases.includes(h));
    if (i < 0) i = norm.findIndex((h) => aliases.some((a) => h.includes(a)));
    return i;
  };
  return { billNo: find('billNo'), code: find('code'), description: find('description'), unit: find('unit'), qty: find('qty'), rate: find('rate') };
}

export function mapIsValid(map: ColumnMap): boolean {
  return map.description >= 0 && map.qty >= 0 && map.rate >= 0;
}

/** Build BOQ rows from a grid using the chosen header row + column mapping. */
export function gridToRows(grid: string[][], headerRowIndex: number, map: ColumnMap): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let currentBill = '';
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const c = grid[i];
    if (!c || c.length === 0) continue;
    const cell = (j: number) => (j >= 0 ? (c[j] ?? '').trim() : '');
    // carry the most recent non-empty bill value down (BOQs group rows under a bill header)
    if (map.billNo >= 0 && cell(map.billNo)) currentBill = cell(map.billNo);
    const qtyRaw = cell(map.qty); const rateRaw = cell(map.rate);
    if (!looksNumeric(qtyRaw) || !looksNumeric(rateRaw)) continue;
    const qty = Number(qtyRaw.replace(/,/g, '')); const rate = Number(rateRaw.replace(/,/g, ''));
    if (qty === 0 && rate === 0) continue;
    const description = cell(map.description);
    if (!description) continue;
    rows.push({
      billNo: currentBill || '1',
      code: cell(map.code) || String(i),
      description,
      unit: cell(map.unit),
      qty,
      rate,
    });
  }
  return rows;
}
