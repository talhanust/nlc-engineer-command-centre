// Cross-module data-quality signals for a project, surfaced as a compact
// "data health" banner. These are integrity checks the engineer can act on —
// BOQ value not yet mapped to the schedule (so it can't earn schedule progress),
// negative stock (issues exceeding receipts), unvalidated progress, and a missing
// schedule baseline — rather than commercial performance (which lives in alerts).
export type HealthLevel = 'ok' | 'warning' | 'critical';
export interface HealthCheck {
  id: string;
  level: HealthLevel;
  label: string;
  detail: string;
}
export interface DataHealth {
  checks: HealthCheck[];
  worst: HealthLevel;
  issues: number; // checks worse than ok
}

const RANK: Record<HealthLevel, number> = { ok: 0, warning: 1, critical: 2 };

export interface DataHealthInput {
  boqCount: number;
  boqValue: number;
  unmappedCount: number;
  unmappedValue: number;
  scheduleCount: number;
  negativeStockCodes: number;
  pendingProgress: number;
  fmtMoney?: (n: number) => string;
}

export function dataHealth(a: DataHealthInput): DataHealth {
  const money = a.fmtMoney ?? ((n: number) => n.toLocaleString('en-PK'));
  const checks: HealthCheck[] = [];

  // BOQ → schedule mapping coverage
  if (a.boqCount > 0) {
    if (a.scheduleCount === 0) {
      checks.push({ id: 'schedule', level: 'warning', label: 'No schedule baseline', detail: 'Import a Primavera .xer or baseline to enable mapping and schedule actuals.' });
    } else if (a.unmappedCount > 0) {
      const ratio = a.boqValue > 0 ? a.unmappedValue / a.boqValue : 0;
      checks.push({
        id: 'mapping',
        level: ratio > 0.5 ? 'critical' : 'warning',
        label: `${a.unmappedCount} BOQ items unmapped`,
        detail: `${money(a.unmappedValue)} of BOQ value (${Math.round(ratio * 100)}%) won't flow to schedule actuals until mapped.`,
      });
    } else {
      checks.push({ id: 'mapping', level: 'ok', label: 'BOQ fully mapped', detail: 'Every BOQ item is linked to a schedule activity.' });
    }
  }

  // Negative stock
  if (a.negativeStockCodes > 0) {
    checks.push({ id: 'stock', level: 'critical', label: `${a.negativeStockCodes} material${a.negativeStockCodes > 1 ? 's' : ''} oversold`, detail: 'Issues exceed recorded receipts — reconcile the stores ledger.' });
  }

  // Unvalidated progress
  if (a.pendingProgress > 0) {
    checks.push({ id: 'progress', level: 'warning', label: `${a.pendingProgress} progress update${a.pendingProgress > 1 ? 's' : ''} pending`, detail: 'Draft executed quantities await PM validation before they count.' });
  }

  const worst = checks.reduce<HealthLevel>((w, c) => (RANK[c.level] > RANK[w] ? c.level : w), 'ok');
  return { checks, worst, issues: checks.filter((c) => c.level !== 'ok').length };
}
