import type { Ipc, Rar, RarIpcLink } from '../data/types';

export interface IpcRecon {
  ipcNo: string;
  gross: number;
  recovered: number; // sub-recoveries applied against this IPC
  net: number; // gross net of recoveries
}

export interface RarRecon {
  rarNo: string;
  subcontractorId: string;
  gross: number;
  recovered: number; // amount recovered against client IPCs
  outstanding: number;
}

export interface Reconciliation {
  ipcRows: IpcRecon[];
  rarRows: RarRecon[];
  totals: { ipcGross: number; recovered: number; rarGross: number; outstanding: number };
}

/**
 * Reconcile subcontractor RARs against client IPCs through recovery links.
 * Each link applies `amount` from a RAR against an IPC; per IPC we sum applied
 * recoveries, per RAR we sum what's been recovered and what remains outstanding.
 */
export function reconcileRarIpc(ipcs: Ipc[], rars: Rar[], links: RarIpcLink[]): Reconciliation {
  const byIpc = new Map<string, number>();
  const byRar = new Map<string, number>();
  for (const l of links) {
    byIpc.set(l.ipcId, (byIpc.get(l.ipcId) ?? 0) + l.amount);
    byRar.set(l.rarId, (byRar.get(l.rarId) ?? 0) + l.amount);
  }

  const ipcRows: IpcRecon[] = ipcs
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const recovered = byIpc.get(i.id) ?? 0;
      return { ipcNo: i.ipcNo, gross: i.gross, recovered, net: i.gross - recovered };
    });

  const rarRows: RarRecon[] = rars
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const recovered = byRar.get(r.id) ?? 0;
      return { rarNo: r.rarNo, subcontractorId: r.subcontractorId, gross: r.gross, recovered, outstanding: r.gross - recovered };
    });

  return {
    ipcRows,
    rarRows,
    totals: {
      ipcGross: ipcRows.reduce((a, r) => a + r.gross, 0),
      recovered: ipcRows.reduce((a, r) => a + r.recovered, 0),
      rarGross: rarRows.reduce((a, r) => a + r.gross, 0),
      outstanding: rarRows.reduce((a, r) => a + r.outstanding, 0),
    },
  };
}
