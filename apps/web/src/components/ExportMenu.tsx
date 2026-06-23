import { useRef, useState, useEffect } from 'react';
import { downloadWorkbook } from './xlsxExport';
import { downloadTablePdf, type PdfColumn } from './tablePdf';

export interface ExportColumn { label: string; align?: 'left' | 'right'; width?: number }

export interface ExportMenuProps {
  /** Base filename (no extension), e.g. "F14F15-contracts". */
  filename: string;
  /** Document title shown on the PDF and used as the sheet name. */
  title: string;
  subtitle?: string;
  meta?: Array<[string, string]>;
  columns: ExportColumn[];
  /** Body rows, aligned to columns. */
  rows: Array<Array<string | number>>;
}

/** A small dropdown that exports the given table to branded .xlsx or .pdf. */
export function ExportMenu({ filename, title, subtitle, meta, columns, rows }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const headerRow = columns.map((c) => c.label);

  async function toExcel() {
    setOpen(false);
    await downloadWorkbook([{ name: title.slice(0, 31), aoa: [headerRow, ...rows] }], `${filename}.xlsx`);
  }
  async function toPdf() {
    setOpen(false);
    const cols: PdfColumn[] = columns.map((c) => ({ label: c.label, align: c.align, width: c.width }));
    await downloadTablePdf({ title, subtitle, meta, columns: cols, rows, filename: `${filename}.pdf` });
  }

  return (
    <div className="export-menu" ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-ghost" aria-haspopup="menu" aria-expanded={open} disabled={rows.length === 0} onClick={() => setOpen((v) => !v)}>
        ⭳ Export
      </button>
      {open && (
        <div role="menu" className="export-pop card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 30, padding: 4, minWidth: 150 }}>
          <button role="menuitem" className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={toExcel}>Excel (.xlsx)</button>
          <button role="menuitem" className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={toPdf}>PDF (.pdf)</button>
        </div>
      )}
    </div>
  );
}
