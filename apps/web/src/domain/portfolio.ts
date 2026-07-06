import type { Project } from '../data/types';
import { toNum } from './money';
import { indexStatus, type PerfStatus } from './evm';

export interface ProjectPerf {
  id: string;
  client: string;
  bac: number;
  plannedPct: number;
  actualPct: number;
  pv: number;
  ev: number;
  spi: number;
  status: PerfStatus;
  billed: number;
  received: number;
  coverage: number; // received / billed
}

export interface PortfolioEvm {
  bac: number;
  pv: number;
  ev: number;
  spi: number;
  plannedPct: number; // value-weighted
  actualPct: number;  // value-weighted
  billed: number;
  received: number;
  outstanding: number;
  count: number;
  behind: number;
  projects: ProjectPerf[];
}

/** Portfolio-level earned value across a set of projects. SPI = EV/PV = actual%/planned%.
 * Stage-aware: only ONGOING works are scored — physically-completed and closed
 * projects sit at 100/100 and would flatter the portfolio indices. */
export function portfolioEvm(projects: Project[]): PortfolioEvm {
  const scored = projects.filter((p) => (p.stage ?? 'ongoing') === 'ongoing');
  const rows: ProjectPerf[] = scored.map((p) => {
    const bac = toNum(p.contractValue);
    const pv = (p.plannedPct / 100) * bac;
    const ev = (p.actualPct / 100) * bac;
    const spi = pv > 0 ? ev / pv : 0;
    const billed = toNum(p.billedToDate);
    const received = toNum(p.receivedToDate);
    return {
      id: p.id, client: p.clientName,
      bac, plannedPct: p.plannedPct, actualPct: p.actualPct, pv, ev, spi,
      status: indexStatus(spi), billed, received,
      coverage: billed > 0 ? received / billed : 0,
    };
  });
  const bac = rows.reduce((s, r) => s + r.bac, 0);
  const pv = rows.reduce((s, r) => s + r.pv, 0);
  const ev = rows.reduce((s, r) => s + r.ev, 0);
  const billed = rows.reduce((s, r) => s + r.billed, 0);
  const received = rows.reduce((s, r) => s + r.received, 0);
  return {
    bac, pv, ev,
    spi: pv > 0 ? ev / pv : 0,
    plannedPct: bac > 0 ? (pv / bac) * 100 : 0,
    actualPct: bac > 0 ? (ev / bac) * 100 : 0,
    billed, received, outstanding: billed - received,
    count: rows.length,
    behind: rows.filter((r) => r.status === 'behind').length,
    projects: rows.sort((a, b) => a.spi - b.spi), // worst schedule first
  };
}
