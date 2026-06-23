import { describe, it, expect } from 'vitest';
import { detectHeaderRow, autoMapColumns, gridToRows, mapIsValid } from './xlsxImport';

// A messy-but-realistic BOQ grid: two preamble rows, a header, a bill sub-header,
// data rows, a sub-total row (non-numeric qty) that must be skipped, and a second bill.
const grid: string[][] = [
  ['Federal Government', '', '', '', '', ''],
  ['Bill of Quantities — MRS 2nd Bi-Annual', '', '', '', '', ''],
  ['Bill', 'Item Code', 'Description', 'Unit', 'Qty', 'Rate'],
  ['1', '', 'ROAD WORK', '', '', ''],
  ['1', 'I-101', 'Clearing and grubbing', '1000 Sft', '4,500', '5564.11'],
  ['1', 'I-102', 'Regular excavation', '1000 Cft', '12000', '9559.70'],
  ['', '', 'Sub-total Bill 1', '', 'TOTAL', ''],
  ['2', 'I-201', 'PCC 1:4:8', '100 Cft', '800', '40613.98'],
];

describe('xlsx BOQ import pipeline', () => {
  it('detects the header row past the preamble', () => {
    expect(detectHeaderRow(grid)).toBe(2);
  });

  it('auto-maps the columns by header name', () => {
    const map = autoMapColumns(grid[2]);
    expect(mapIsValid(map)).toBe(true);
    expect(map.description).toBe(2);
    expect(map.qty).toBe(4);
    expect(map.rate).toBe(5);
  });

  it('builds rows, carries the bill down, and skips non-numeric/total rows', () => {
    const map = autoMapColumns(grid[2]);
    const rows = gridToRows(grid, 2, map);
    expect(rows.length).toBe(3); // 2 in bill 1 + 1 in bill 2; sub-total + bill-header skipped
    expect(rows[0]).toMatchObject({ billNo: '1', description: 'Clearing and grubbing', qty: 4500, rate: 5564.11 });
    expect(rows[2].billNo).toBe('2'); // bill carried/updated correctly
  });

  it('reports an invalid map when required fields are unmapped', () => {
    expect(mapIsValid({ billNo: 0, code: 1, description: -1, unit: 3, qty: 4, rate: 5 })).toBe(false);
  });
});
