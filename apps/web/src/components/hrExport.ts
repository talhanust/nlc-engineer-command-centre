import type { HrUnit } from '../data/types';
import {
  buildOrganogram, commandSpine, rolledStrength, establishmentTotals, fillPct, type OrgoNode,
} from '../domain/organogram';

// ---- flat table <-> units (for xlsx/csv) ----
export const ESTAB_HEADERS = ['Title', 'Reports to', 'Scale', 'Category', 'Auth', 'Held'];

export function establishmentToAoa(units: HrUnit[]): Array<Array<string | number>> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const rows = units.map((u) => [
    u.title,
    u.parentId && byId.has(u.parentId) ? byId.get(u.parentId)!.title : '',
    u.scale ?? '', u.category ?? '', u.auth, u.held,
  ]);
  return [ESTAB_HEADERS, ...rows];
}

export interface ParsedUnit { title: string; parentTitle: string; scale?: string; category?: string; auth: number; held: number }

/** Parse arrays-of-arrays (with a header row) into establishment rows. */
export function parseEstablishmentRows(aoa: Array<Array<string | number>>): ParsedUnit[] {
  if (aoa.length === 0) return [];
  const header = aoa[0].map((c) => String(c).trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ti = idx(['title', 'post', 'designation']);
  const pi = idx(['reports', 'parent']);
  const si = idx(['scale']);
  const ci = idx(['category']);
  const ai = idx(['auth']);
  const hi = idx(['held']);
  const out: ParsedUnit[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    const title = String(row[ti] ?? '').trim();
    if (!title) continue;
    out.push({
      title,
      parentTitle: pi >= 0 ? String(row[pi] ?? '').trim() : '',
      scale: si >= 0 && row[si] ? String(row[si]).trim() : undefined,
      category: ci >= 0 && row[ci] ? String(row[ci]).trim() : undefined,
      auth: ai >= 0 ? Number(row[ai]) || 0 : 0,
      held: hi >= 0 ? Number(row[hi]) || 0 : 0,
    });
  }
  return out;
}

// ---- generic downloads ----
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(aoa: Array<Array<string | number>>): string {
  return aoa.map((row) => row.map((c) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// ---- standalone SVG organogram (for PNG / SVG / print export) ----
const C = {
  bg: '#ffffff', text: '#1a1a1a', muted: '#6b7280', border: '#d1d5db', command: '#2E2E2E',
  ok: '#2D5F3F', warn: '#B06820', crit: '#8B1A1A', track: '#e5e7eb',
};
const statusColor = (held: number, auth: number) => {
  if (auth <= 0) return C.ok;
  const r = held / auth;
  return r >= 0.9 ? C.ok : r >= 0.75 ? C.warn : C.crit;
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function organogramSvg(units: HrUnit[], title: string): string {
  const roots = buildOrganogram(units);
  const totals = establishmentTotals(roots);
  const { spine, fanout } = commandSpine(roots);
  const sections: OrgoNode[] = fanout ? fanout.children : roots;

  const PAD = 24, BW = 168, GAP = 16, SP_H = 40, SEC_H = 64;
  const cols = Math.max(1, sections.length);
  const width = Math.max(cols * BW + (cols - 1) * GAP, 360) + PAD * 2;
  const cx = width / 2;
  let y = PAD;

  const parts: string[] = [];
  parts.push(`<text x="${PAD}" y="${y + 14}" font-size="15" font-weight="700" fill="${C.text}">${esc(title)}</text>`);
  parts.push(`<text x="${PAD}" y="${y + 32}" font-size="11" fill="${C.muted}">AUTH ${totals.auth} · HELD ${totals.held} · ${fillPct(totals.held, totals.auth)}% filled · ${totals.auth - totals.held} vacant</text>`);
  y += 50;

  // spine
  for (const u of spine) {
    const s = rolledStrength(u);
    const x = cx - BW / 2;
    parts.push(`<rect x="${x}" y="${y}" width="${BW}" height="${SP_H}" rx="6" fill="${C.command}"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="4" height="${SP_H}" rx="2" fill="${statusColor(s.held, s.auth)}"/>`);
    parts.push(`<text x="${cx}" y="${y + 17}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${esc(u.title)}</text>`);
    parts.push(`<text x="${cx}" y="${y + 31}" font-size="10" fill="#cbd5e1" text-anchor="middle">${s.held}/${s.auth}${u.scale ? ' · ' + esc(u.scale) : ''}</text>`);
    y += SP_H;
    parts.push(`<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 16}" stroke="${C.border}" stroke-width="2"/>`);
    y += 16;
  }

  if (sections.length > 0) {
    const rowWidth = cols * BW + (cols - 1) * GAP;
    const startX = cx - rowWidth / 2;
    parts.push(`<line x1="${startX + BW / 2}" y1="${y}" x2="${startX + rowWidth - BW / 2}" y2="${y}" stroke="${C.border}" stroke-width="2"/>`);
    const barY = y;
    y += 12;
    sections.forEach((sec, i) => {
      const s = rolledStrength(sec);
      const x = startX + i * (BW + GAP);
      parts.push(`<line x1="${x + BW / 2}" y1="${barY}" x2="${x + BW / 2}" y2="${y}" stroke="${C.border}" stroke-width="2"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${BW}" height="${SEC_H}" rx="6" fill="#fff" stroke="${C.border}"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="4" height="${SEC_H}" rx="2" fill="${statusColor(s.held, s.auth)}"/>`);
      parts.push(`<text x="${x + 12}" y="${y + 20}" font-size="11.5" font-weight="700" fill="${C.text}">${esc(sec.title.slice(0, 24))}</text>`);
      // fill bar
      const bw = BW - 24;
      parts.push(`<rect x="${x + 12}" y="${y + 30}" width="${bw}" height="6" rx="3" fill="${C.track}"/>`);
      parts.push(`<rect x="${x + 12}" y="${y + 30}" width="${Math.round(bw * Math.min(1, fillPct(s.held, s.auth) / 100))}" height="6" rx="3" fill="${statusColor(s.held, s.auth)}"/>`);
      parts.push(`<text x="${x + 12}" y="${y + 52}" font-size="10" fill="${C.muted}">${s.held}/${s.auth} · ${fillPct(s.held, s.auth)}%</text>`);
    });
    y += SEC_H;
  }
  const height = y + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, sans-serif"><rect width="${width}" height="${height}" fill="${C.bg}"/>${parts.join('')}</svg>`;
}

/** Rasterise an SVG string to PNG and download (browser only). */
export function downloadSvgAsPng(svg: string, filename: string, scale = 2): void {
  const img = new Image();
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  img.onload = () => {
    const m = svg.match(/width="(\d+)" height="(\d+)"/);
    const w = m ? Number(m[1]) : img.width;
    const h = m ? Number(m[2]) : img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.src = svgUrl;
}
