export interface SheetSpec {
  name: string;
  aoa: Array<Array<string | number>>;
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
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
