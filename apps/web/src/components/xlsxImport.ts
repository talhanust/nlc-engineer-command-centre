import type { Row } from '../domain/importers';

/** Read the first sheet of an .xlsx/.csv File into arrays-of-arrays. */
export async function readSheetRows(file: File): Promise<Row[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: false, defval: '' });
}
