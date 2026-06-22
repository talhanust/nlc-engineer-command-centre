import type { Ipc, Rar, Epc, BoqItem } from '../data/types';
import { ipcDeductionBreakdown, IPC_STATUS_LABEL } from './ipc';
import { RAR_STATUS_LABEL } from './rar';

export interface CertLine { description: string; unit?: string; qty: number; rate: number; amount: number }
export interface CertDeduction { label: string; amount: number }
export interface Certificate {
  docType: string;
  refNo: string;
  date: string;
  period: string;
  projectName: string;
  client: string;
  fromParty: string;
  toParty: string;
  lines: CertLine[];
  gross: number;
  deductions: CertDeduction[];
  net: number;
  status: string;
}

const NLC = 'National Logistic Corporation';

function linesFrom(items: Array<{ boqItemId: string; qty: number; rate: number; amount: number }> | undefined, boqById: Map<string, BoqItem>): CertLine[] {
  return (items ?? []).map((l) => {
    const b = boqById.get(l.boqItemId);
    return { description: b?.description ?? l.boqItemId, unit: b?.unit, qty: l.qty, rate: l.rate, amount: l.amount };
  });
}

export function ipcCertificate(ipc: Ipc, ctx: { projectName: string; client: string; boqById: Map<string, BoqItem> }): Certificate {
  const d = ipcDeductionBreakdown(ipc.gross);
  return {
    docType: 'Interim Payment Certificate', refNo: ipc.ipcNo, date: ipc.date ?? ipc.period, period: ipc.period,
    projectName: ctx.projectName, client: ctx.client, fromParty: NLC, toParty: ctx.client,
    lines: linesFrom(ipc.lines, ctx.boqById), gross: ipc.gross,
    deductions: [
      { label: `Retention @ ${d.retentionPct}%`, amount: d.retention },
      { label: `Income tax @ ${d.incomeTaxPct}%`, amount: d.incomeTax },
    ],
    net: d.net, status: IPC_STATUS_LABEL[ipc.status],
  };
}

export function rarCertificate(rar: Rar, ctx: { projectName: string; client: string; subName: string; boqById: Map<string, BoqItem> }): Certificate {
  const d = ipcDeductionBreakdown(rar.gross);
  return {
    docType: 'Running Account Receipt', refNo: rar.rarNo, date: rar.date ?? rar.period, period: rar.period,
    projectName: ctx.projectName, client: ctx.client, fromParty: NLC, toParty: ctx.subName,
    lines: linesFrom(rar.lines, ctx.boqById), gross: rar.gross,
    deductions: [
      { label: `Retention @ ${d.retentionPct}%`, amount: d.retention },
      { label: `Income tax @ ${d.incomeTaxPct}%`, amount: d.incomeTax },
    ],
    net: rar.netPayable, status: RAR_STATUS_LABEL[rar.status],
  };
}

export function epcCertificate(epc: Epc, ctx: { projectName: string; client: string }): Certificate {
  return {
    docType: 'Escalation Payment Certificate', refNo: epc.epcNo, date: epc.period, period: epc.period,
    projectName: ctx.projectName, client: ctx.client, fromParty: NLC, toParty: ctx.client,
    lines: [{ description: `Price adjustment (Pₙ − 1)${epc.ipcNo ? ` for ${epc.ipcNo}` : ''}`, qty: 1, rate: epc.amount, amount: epc.amount }],
    gross: epc.amount, deductions: [], net: epc.amount, status: IPC_STATUS_LABEL[epc.status],
  };
}
