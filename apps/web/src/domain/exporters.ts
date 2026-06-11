import type { Rollup } from './rollup';

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

/** A node command-dashboard breakdown as a 2D array (header + rows + total). */
export function nodeBreakdownAoa(rollup: Rollup): Array<Array<string | number>> {
  const headers = ['Name', 'Contract', 'Billed', 'Received', 'Planned%', 'Actual%', 'Slippage%', 'Health'];
  const rows: Array<Array<string | number>> = rollup.children.map((c) => [
    c.name, Math.round(c.contractValue), Math.round(c.billed), Math.round(c.received),
    +c.plannedPct.toFixed(1), +c.actualPct.toFixed(1), +c.slippage.toFixed(1), c.rag,
  ]);
  rows.push([
    'TOTAL', Math.round(rollup.totals.contractValue), Math.round(rollup.totals.billed),
    Math.round(rollup.totals.received), +rollup.totals.plannedPct.toFixed(1),
    +rollup.totals.actualPct.toFixed(1), +rollup.totals.slippage.toFixed(1), rollup.totals.rag,
  ]);
  return [headers, ...rows];
}

/** A node command-dashboard breakdown as CSV (for Excel). */
export function nodeBreakdownCsv(rollup: Rollup): string {
  const aoa = nodeBreakdownAoa(rollup);
  return toCsv(aoa[0] as string[], aoa.slice(1));
}
