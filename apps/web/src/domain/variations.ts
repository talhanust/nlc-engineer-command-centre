import type { Variation, VariationStatus, VariationType, VariationLine, BoqItem } from '../data/types';

export const VO_PIPELINE: VariationStatus[] = ['draft', 'submitted', 'recommended', 'approved'];

export const VO_STATUS_LABEL: Record<VariationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  recommended: 'Recommended',
  approved: 'Approved (client)',
  rejected: 'Rejected',
};

export const VO_TYPE_LABEL: Record<VariationType, string> = {
  addition: 'Addition',
  omission: 'Omission',
  substitution: 'Substitution',
  rate_change: 'Rate change',
};

interface VoTransition { action: string; label: string; to: VariationStatus; role: string }

const TRANSITIONS: Partial<Record<VariationStatus, VoTransition>> = {
  draft: { action: 'submit', label: 'Submit', to: 'submitted', role: 'qs' },
  submitted: { action: 'recommend', label: 'Recommend', to: 'recommended', role: 'pm' },
  recommended: { action: 'approve', label: 'Approve', to: 'approved', role: 'pd' },
};

export function nextVoTransition(status: VariationStatus): VoTransition | null {
  return TRANSITIONS[status] ?? null;
}

export function applyVoAction(status: VariationStatus, action: string): VariationStatus | null {
  if (action === 'reject' && status !== 'approved') return 'rejected';
  const t = TRANSITIONS[status];
  return t && t.action === action ? t.to : null;
}

export interface VariationSummary {
  approvedTotal: number;   // signed
  pendingTotal: number;    // signed, not-yet-approved (excl. rejected)
  additions: number;
  omissions: number;
  count: number;
  revisedContractValue: number;
}

export function variationSummary(variations: Variation[], originalContractValue: number): VariationSummary {
  let approvedTotal = 0; let pendingTotal = 0; let additions = 0; let omissions = 0;
  for (const v of variations) {
    if (v.status === 'rejected') continue;
    if (v.status === 'approved') approvedTotal += v.amount; else pendingTotal += v.amount;
    if (v.amount >= 0) additions += v.amount; else omissions += v.amount;
  }
  return {
    approvedTotal, pendingTotal, additions, omissions,
    count: variations.filter((v) => v.status !== 'rejected').length,
    revisedContractValue: originalContractValue + approvedTotal,
  };
}

/** Revised contract value = original + approved variations. */
export function revisedContractValue(originalContractValue: number, variations: Variation[]): number {
  return originalContractValue + variations.filter((v) => v.status === 'approved').reduce((s, v) => s + v.amount, 0);
}

// ---- BOQ-level variations (qty / rate / add / omit) ----------------------

export const VO_LINE_KIND_LABEL: Record<VariationLine['kind'], string> = {
  qty: 'Quantity variation', rate: 'Rate change', add: 'Add item', omit: 'Omit item',
};

const round = (n: number) => Math.round(n);

/** Signed contract delta for one VO line, given the current BOQ item it targets. */
export function variationLineAmount(line: VariationLine, item?: BoqItem): number {
  switch (line.kind) {
    case 'qty':  return item ? round((Number(line.newQty) - item.qty) * item.rate) : 0;
    case 'rate': return item ? round(item.qty * (Number(line.newRate) - item.rate)) : 0;
    case 'add':  return round(Number(line.newQty || 0) * Number(line.newRate || 0));
    case 'omit': return item ? -round(item.qty * item.rate) : 0;
    default: return 0;
  }
}

/** Total signed amount of a set of VO lines against the given BOQ. */
export function variationLinesAmount(lines: VariationLine[], boq: BoqItem[]): number {
  const byId = new Map(boq.map((b) => [b.id, b]));
  return lines.reduce((s, l) => s + variationLineAmount(l, l.boqItemId ? byId.get(l.boqItemId) : undefined), 0);
}

/** Derive a representative VariationType from a set of lines. */
export function dominantVariationType(lines: VariationLine[]): VariationType {
  if (lines.length === 0) return 'addition';
  if (lines.every((l) => l.kind === 'add')) return 'addition';
  if (lines.every((l) => l.kind === 'omit')) return 'omission';
  if (lines.every((l) => l.kind === 'rate')) return 'rate_change';
  return 'substitution';
}

/**
 * Apply an (approved) variation's lines to the BOQ, returning a NEW revised BOQ.
 * qty/rate edit the item in place; add appends; omit zeroes the item (refs preserved).
 */
export function applyVariationToBoq(boq: BoqItem[], variation: Variation): BoqItem[] {
  if (!variation.lines || variation.lines.length === 0) return boq;
  const next = boq.map((b) => ({ ...b }));
  const byId = new Map(next.map((b) => [b.id, b]));
  let addSeq = 0;
  for (const line of variation.lines) {
    if (line.kind === 'add') {
      addSeq++;
      const qty = Number(line.newQty || 0); const rate = Number(line.newRate || 0);
      next.push({
        id: `boq-${variation.projectId}-vo-${variation.voNo}-${addSeq}`, projectId: variation.projectId,
        billNo: line.billNo || '—', billName: undefined, section: `VO ${variation.voNo}`,
        code: line.code || `${variation.voNo}-${addSeq}`, description: line.description || 'Added item (variation)',
        unit: line.unit || 'No', qty, rate, amount: round(qty * rate),
      });
      continue;
    }
    const item = line.boqItemId ? byId.get(line.boqItemId) : undefined;
    if (!item) continue;
    if (line.kind === 'qty') { item.qty = Number(line.newQty); item.amount = round(item.qty * item.rate); item.revisedByVo = variation.voNo; }
    else if (line.kind === 'rate') { item.rate = Number(line.newRate); item.amount = round(item.qty * item.rate); item.revisedByVo = variation.voNo; }
    else if (line.kind === 'omit') { item.qty = 0; item.amount = 0; item.revisedByVo = variation.voNo; }
  }
  return next;
}


/**
 * Revised BOQ items after applying every APPROVED variation (spec: an approved
 * VO revises the bill of quantities). Line-based VOs edit/add/omit specific
 * items; amount-based VOs (no lines) append a single summary line carrying the
 * net amount so the BOQ total still reflects the variation.
 */
export function revisedBoqItems(boq: BoqItem[], variations: Variation[]): BoqItem[] {
  let items = boq.map((b) => ({ ...b }));
  for (const v of variations) {
    if (v.status !== 'approved') continue;
    if (v.lines && v.lines.length > 0) {
      items = applyVariationToBoq(items, v);
    } else {
      // Amount-based VO: represent as one summary BOQ line so totals reconcile.
      items.push({
        id: `boq-${v.projectId}-vo-${v.voNo}`, projectId: v.projectId,
        billNo: '—', billName: undefined, section: `VO ${v.voNo}`,
        code: v.voNo, description: v.title || `Variation ${v.voNo}`,
        unit: 'LS', qty: 1, rate: v.amount, amount: v.amount, revisedByVo: v.voNo,
      });
    }
  }
  return items;
}

/**
 * The single authoritative contract figure: base BOQ total plus the net effect
 * of all APPROVED variations. CA Value == Revised BOQ Value — one number.
 */
export function revisedBoqValue(boq: BoqItem[], variations: Variation[]): number {
  return revisedBoqItems(boq, variations).reduce((s, b) => s + b.amount, 0);
}
