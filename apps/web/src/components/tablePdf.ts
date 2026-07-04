export interface PdfColumn { label: string; align?: 'left' | 'right'; width?: number }

export interface TablePdfSpec {
  title: string;
  subtitle?: string;
  meta?: Array<[string, string]>;
  columns: PdfColumn[];
  rows: Array<Array<string | number>>;
  filename: string;
}

/** Render a register to a branded, paginated A4 (landscape) PDF via jsPDF (loaded on demand). */
export async function downloadTablePdf(spec: TablePdfSpec): Promise<void> {
  if (typeof window === 'undefined' || (window as unknown as { HEADLESS?: boolean }).HEADLESS) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const generatedAt = new Date().toLocaleString('en-PK');

  const header = (): number => {
    let y = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20);
    doc.text('NATIONAL LOGISTIC CORPORATION', M, y); y += 15;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
    doc.text('Engineer Command Centre', M, y); y += 16;
    doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(spec.title, M, y); y += 14;
    if (spec.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(spec.subtitle, M, y); y += 12; }
    if (spec.meta?.length) {
      doc.setFontSize(8); doc.setTextColor(90);
      doc.text(spec.meta.map(([k, v]) => `${k}: ${v}`).join('    '), M, y); y += 10;
    }
    doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 12;
    return y;
  };

  // Column geometry — explicit widths, else equal share of the page.
  const usable = W - 2 * M;
  const givenTotal = spec.columns.reduce((s, c) => s + (c.width ?? 0), 0);
  const autoCount = spec.columns.filter((c) => !c.width).length;
  const autoW = autoCount ? Math.max(40, (usable - givenTotal) / autoCount) : 0;
  const widths = spec.columns.map((c) => c.width ?? autoW);
  const xs: number[] = []; let acc = M; for (const w of widths) { xs.push(acc); acc += w; }

  const drawHeadRow = (y: number): number => {
    doc.setFillColor(245, 246, 248); doc.rect(M, y - 10, usable, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40);
    spec.columns.forEach((c, i) => {
      const tx = c.align === 'right' ? xs[i] + widths[i] - 4 : xs[i] + 4;
      doc.text(String(c.label), tx, y, { align: c.align === 'right' ? 'right' : 'left' });
    });
    return y + 12;
  };

  const footer = (page: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(`Generated ${generatedAt}`, M, H - 16);
    doc.text(`Page ${page}`, W - M, H - 16, { align: 'right' });
  };

  let page = 1;
  let y = header();
  y = drawHeadRow(y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30);

  for (const row of spec.rows) {
    if (y > H - 40) { footer(page); doc.addPage(); page += 1; y = header(); y = drawHeadRow(y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30); }
    spec.columns.forEach((c, i) => {
      const raw = row[i] == null ? '' : String(row[i]);
      const maxChars = Math.max(6, Math.floor(widths[i] / 4.2));
      const text = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw;
      const tx = c.align === 'right' ? xs[i] + widths[i] - 4 : xs[i] + 4;
      doc.text(text, tx, y, { align: c.align === 'right' ? 'right' : 'left' });
    });
    y += 13;
    doc.setDrawColor(238); doc.line(M, y - 4, W - M, y - 4);
  }
  footer(page);
  doc.save(spec.filename);
}
