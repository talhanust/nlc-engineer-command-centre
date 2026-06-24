import type { RarRecovery, RarRecoveryKind, CommercialConfig, Subcontractor } from '../data/types';

export const RAR_RECOVERY_LABEL: Record<RarRecoveryKind, string> = {
  material: 'NLC material consumed',
  machinery: 'NLC machinery usage',
  other: 'Other recovery',
};

/** Total of all recoveries on a RAR. */
export function rarRecoveryTotal(recoveries?: RarRecovery[]): number {
  return (recoveries ?? []).reduce((s, r) => s + (r.amount || 0), 0);
}

export interface RarSettlement {
  gross: number;
  retention: number;
  incomeTax: number;
  gst: number;
  materialRecovery: number;
  machineryRecovery: number;
  otherRecovery: number;
  recoveryTotal: number;
  net: number;
  retentionPct: number;
  incomeTaxPct: number;
  gstPct: number;
}

/**
 * Full RAR settlement: gross less retention (per contract) and RAR taxes, then
 * less material / machinery / other recoveries. IPCs are never involved.
 */
export function rarSettlement(args: {
  gross: number;
  retentionPct: number;
  cfg: Pick<CommercialConfig, 'rarIncomeTaxPct' | 'rarGstPct'>;
  recoveries?: RarRecovery[];
}): RarSettlement {
  const { gross, retentionPct, cfg, recoveries } = args;
  const retention = +(gross * retentionPct / 100).toFixed(2);
  const incomeTax = +(gross * cfg.rarIncomeTaxPct / 100).toFixed(2);
  const gst = +(gross * cfg.rarGstPct / 100).toFixed(2);
  const by = (k: RarRecoveryKind) => (recoveries ?? []).filter((r) => r.kind === k).reduce((s, r) => s + (r.amount || 0), 0);
  const materialRecovery = by('material');
  const machineryRecovery = by('machinery');
  const otherRecovery = by('other');
  const recoveryTotal = materialRecovery + machineryRecovery + otherRecovery;
  const net = +(gross - retention - incomeTax - gst - recoveryTotal).toFixed(2);
  return {
    gross, retention, incomeTax, gst, materialRecovery, machineryRecovery, otherRecovery, recoveryTotal, net,
    retentionPct, incomeTaxPct: cfg.rarIncomeTaxPct, gstPct: cfg.rarGstPct,
  };
}

/** Labour-only contracts cannot carry material or machinery recoveries. */
export function isLabourContractor(sub?: Pick<Subcontractor, 'kind'>): boolean {
  return sub?.kind === 'labor';
}

/** Recovery kinds permitted for a contractor (labour → other only). */
export function allowedRecoveryKinds(sub?: Pick<Subcontractor, 'kind'>): RarRecoveryKind[] {
  return isLabourContractor(sub) ? ['other'] : ['material', 'machinery', 'other'];
}
