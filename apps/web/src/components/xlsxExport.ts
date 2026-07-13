export interface SheetSpec {
  name: string;
  /** null writes a genuinely empty cell (not an empty string). */
  aoa: Array<Array<string | number | null>>;
}

/**
 * Build a multi-sheet .xlsx from arrays-of-arrays and trigger a download.
 * xlsx is dynamically imported so it only loads when an export is requested.
 */
export async function downloadWorkbook(sheets: SheetSpec[], filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    // Readable columns rather than a wall of ####.
    ws['!cols'] = widthsFor(s.aoa);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

/** Column widths from the longest cell, clamped so one long name can't dominate. */
export function widthsFor(rows: Array<Array<string | number | null>>): Array<{ wch: number }> {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length;
      if (len > (widths[i] ?? 0)) widths[i] = len;
    });
  }
  return widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 10), 46) }));
}
