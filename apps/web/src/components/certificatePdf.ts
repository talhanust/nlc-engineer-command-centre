import type { Certificate } from '../domain/certificate';

const fmt = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 });

/** Render a certificate model to a downloadable A4 PDF via jsPDF (loaded on demand). */
export async function downloadCertificatePdf(cert: Certificate): Promise<void> {
  if (typeof window === 'undefined' || (window as unknown as { HEADLESS?: boolean }).HEADLESS) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48;
  let y = M;
  const W = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('NATIONAL LOGISTIC CORPORATION', M, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90);
  doc.text('Engineer Command Centre', M, y); y += 22;
  doc.setTextColor(20); doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 22;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(cert.docType.toUpperCase(), M, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70);
  const meta = [
    ['Reference', cert.refNo], ['Date', cert.date], ['Period', cert.period],
    ['Project', cert.projectName], ['Client', cert.client],
    ['From', cert.fromParty], ['To', cert.toParty], ['Status', cert.status],
  ];
  meta.forEach(([k, v], i) => {
    const col = i % 2; const x = M + col * ((W - 2 * M) / 2);
    if (col === 0 && i > 0) y += 15;
    doc.setTextColor(130); doc.text(`${k}:`, x, y);
    doc.setTextColor(30); doc.text(String(v), x + 64, y);
  });
  y += 26;

  // line items
  if (cert.lines.length) {
    doc.setFillColor(240, 240, 240); doc.rect(M, y - 11, W - 2 * M, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60);
    doc.text('DESCRIPTION', M + 4, y); doc.text('QTY', W - M - 200, y, { align: 'right' });
    doc.text('RATE', W - M - 110, y, { align: 'right' }); doc.text('AMOUNT', W - M - 4, y, { align: 'right' });
    y += 16;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
    for (const l of cert.lines) {
      doc.text(doc.splitTextToSize(l.description, W - 2 * M - 230)[0] ?? l.description, M + 4, y);
      doc.text(fmt(l.qty), W - M - 200, y, { align: 'right' });
      doc.text(fmt(l.rate), W - M - 110, y, { align: 'right' });
      doc.text(fmt(l.amount), W - M - 4, y, { align: 'right' });
      y += 15;
    }
    y += 6;
  }

  doc.setDrawColor(220); doc.line(W - M - 230, y, W - M, y); y += 16;
  const right = (label: string, val: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(bold ? 20 : 90);
    doc.text(label, W - M - 150, y, { align: 'right' });
    doc.text(`PKR ${fmt(val)}`, W - M - 4, y, { align: 'right' });
    y += 16;
  };
  right('Gross', cert.gross);
  for (const d of cert.deductions) right(`Less ${d.label}`, -d.amount);
  y += 2; doc.setDrawColor(120); doc.line(W - M - 230, y, W - M, y); y += 16;
  right('Net payable', cert.net, true);

  y += 50;
  doc.setDrawColor(160);
  doc.line(M, y, M + 160, y); doc.line(W - M - 160, y, W - M, y); y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
  doc.text('Prepared / Quantity Surveyor', M, y); doc.text('Approved / Resident Engineer', W - M - 160, y);

  doc.save(`${cert.refNo}-certificate.pdf`);
}
