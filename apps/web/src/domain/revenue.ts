import type { CommercialConfig } from '../data/types';

/**
 * Gross revenue chain for a project's client billing.
 *
 *   Gross revenue = Executed work (IPC) + Price escalation (EPC, certified separately)
 *                 − Retention − Income tax − GST/stamp
 *                 = Net certified
 *   Receipts (cash) are tracked separately; mobilisation advances are NOT executed
 *   revenue and are excluded from the chain.
 *   Slippage = Executed − Vetted (work done but not yet certified).
 */
export interface RevenueComposition {
  executed: number;
  escalation: number;
  gross: number;
  retention: number;
  incomeTax: number;
  gst: number;
  netCertified: number;
  receipts: number;   // cash received, excluding advances
  advances: number;   // mobilisation advances (excluded from revenue)
  vetted: number;
  billed: number;
  slippage: number;   // executed − vetted
}

export function revenueComposition(args: {
  executed: number;
  vetted: number;
  billed: number;
  escalation: number;
  receiptsTotal: number;
  advances: number;
  cfg: CommercialConfig;
}): RevenueComposition {
  const { executed, vetted, billed, escalation, receiptsTotal, advances, cfg } = args;
  const gross = executed + escalation;
  const retention = gross * cfg.ipcRetentionPct / 100;
  const incomeTax = gross * cfg.incomeTaxPct / 100;
  const gst = gross * cfg.gstPct / 100;
  const netCertified = gross - retention - incomeTax - gst;
  return {
    executed, escalation, gross, retention, incomeTax, gst, netCertified,
    receipts: Math.max(0, receiptsTotal - advances),
    advances, vetted, billed,
    slippage: executed - vetted,
  };
}

/** A receipt is an advance (not executed revenue) when its source mentions "advance". */
export function isAdvanceReceipt(source: string): boolean {
  return /advance/i.test(source);
}
