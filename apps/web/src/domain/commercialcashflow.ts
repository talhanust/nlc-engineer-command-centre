import type { Ipc, Rar } from '../data/types';
import { periodToDate } from './aging';

export interface CashflowPoint {
  period: string;
  inflow: number;   // IPC net certified to client
  outflow: number;  // RAR net payable to subs
  net: number;
  cumNet: number;
}

/** Commercial cash position by period: IPC net inflow (FGEHA → NLC) minus RAR net
 *  outflow (NLC → S/C), with a running cumulative net (working capital). */
export function commercialCashflow(ipcs: Ipc[], rars: Rar[]): CashflowPoint[] {
  const byPeriod = new Map<string, { inflow: number; outflow: number }>();
  const bump = (period: string, key: 'inflow' | 'outflow', amt: number) => {
    const e = byPeriod.get(period) ?? { inflow: 0, outflow: 0 };
    e[key] += amt;
    byPeriod.set(period, e);
  };
  for (const i of ipcs) bump(i.period, 'inflow', i.netPayable);
  for (const r of rars) bump(r.period, 'outflow', r.netPayable);

  const periods = [...byPeriod.keys()].sort((a, b) => {
    const da = periodToDate(a)?.getTime() ?? 0;
    const db = periodToDate(b)?.getTime() ?? 0;
    return da - db || a.localeCompare(b);
  });

  let cum = 0;
  return periods.map((period) => {
    const e = byPeriod.get(period)!;
    const net = e.inflow - e.outflow;
    cum += net;
    return { period, inflow: e.inflow, outflow: e.outflow, net, cumNet: cum };
  });
}

export interface CashflowTotals { inflow: number; outflow: number; net: number }
export function cashflowTotals(points: CashflowPoint[]): CashflowTotals {
  return points.reduce<CashflowTotals>((a, p) => ({ inflow: a.inflow + p.inflow, outflow: a.outflow + p.outflow, net: a.net + p.net }),
    { inflow: 0, outflow: 0, net: 0 });
}
