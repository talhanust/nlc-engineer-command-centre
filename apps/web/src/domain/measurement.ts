import type { BoqItem } from '../data/types';

export interface MeasureLine { boqItemId: string; qty: number; amount: number }
export interface MeasureCert { seq: number; lines?: MeasureLine[] }

export interface MeasureRow {
  item: BoqItem;
  prevQty: number; prevAmount: number;
  thisQty: number; thisAmount: number;
  cumQty: number; cumAmount: number;
  boqQty: number; boqAmount: number;
  balanceAmount: number; // BOQ − cumulative
  pct: number;           // cumQty / boqQty, 0..1
  billedThis: boolean;   // appears in the current certificate
}

export interface MeasurementSheet {
  rows: MeasureRow[];
  prevGross: number;
  thisGross: number;
  cumGross: number;
  boqTotal: number;
}

/**
 * Build a Previous / This / Cumulative measurement sheet for a certificate
 * (IPC or RAR) across the supplied BOQ scope.
 *
 * - "This" = the current certificate's lines.
 * - "Previous" = all certificates with a lower seq.
 * - "Cumulative" = previous + this.
 * Every BOQ item in `boq` is listed (so the certificate is complete), unless
 * `onlyBilled` is set, in which case only items with cumulative value show.
 */
export function measurementSheet(
  current: MeasureCert,
  all: MeasureCert[],
  boq: BoqItem[],
  opts?: { onlyBilled?: boolean },
): MeasurementSheet {
  const sum = (cert: MeasureCert) => {
    const q = new Map<string, number>();
    const a = new Map<string, number>();
    for (const l of cert.lines ?? []) {
      q.set(l.boqItemId, (q.get(l.boqItemId) ?? 0) + l.qty);
      a.set(l.boqItemId, (a.get(l.boqItemId) ?? 0) + l.amount);
    }
    return { q, a };
  };

  const thisAgg = sum(current);
  const prevAgg = { q: new Map<string, number>(), a: new Map<string, number>() };
  for (const cert of all) {
    if (cert.seq >= current.seq) continue;
    for (const l of cert.lines ?? []) {
      prevAgg.q.set(l.boqItemId, (prevAgg.q.get(l.boqItemId) ?? 0) + l.qty);
      prevAgg.a.set(l.boqItemId, (prevAgg.a.get(l.boqItemId) ?? 0) + l.amount);
    }
  }

  let prevGross = 0, thisGross = 0, cumGross = 0, boqTotal = 0;
  const rows: MeasureRow[] = [];
  for (const item of boq) {
    const prevQty = prevAgg.q.get(item.id) ?? 0;
    const prevAmount = prevAgg.a.get(item.id) ?? 0;
    const thisQty = thisAgg.q.get(item.id) ?? 0;
    const thisAmount = thisAgg.a.get(item.id) ?? 0;
    const cumQty = prevQty + thisQty;
    const cumAmount = prevAmount + thisAmount;
    const boqQty = item.qty;
    const boqAmount = item.amount;
    prevGross += prevAmount; thisGross += thisAmount; cumGross += cumAmount; boqTotal += boqAmount;
    if (opts?.onlyBilled && cumAmount <= 0) continue;
    rows.push({
      item, prevQty, prevAmount, thisQty, thisAmount, cumQty, cumAmount,
      boqQty, boqAmount, balanceAmount: boqAmount - cumAmount,
      pct: boqQty > 0 ? Math.min(1, cumQty / boqQty) : 0,
      billedThis: thisAmount > 0,
    });
  }
  return { rows, prevGross, thisGross, cumGross, boqTotal };
}
