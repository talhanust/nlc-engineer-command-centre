import { describe, it, expect } from 'vitest';
import { materialRegister } from './materialRegister';
import type { Crv, Demand, PurchaseOrder, MaterialIssue, DemandItem } from '../data/types';

function demand(id: string, items: DemandItem[]): Demand {
  return { id, projectId: 'p', demandNo: id, seq: 1, type: 'material', justification: '', totalEstimated: 0, chainType: 'proc_demand_material', currentStage: 0, items, history: [] };
}
function di(code: string, description: string, unit: string, rate: number, boqItemId?: string): DemandItem {
  return { code, description, unit, qty: 0, estimatedRate: rate, boqItemId };
}
function po(id: string, demandId: string): PurchaseOrder {
  return { id, projectId: 'p', poNo: id, seq: 1, demandId, supplierId: 's', totalValue: 0, status: 'open' };
}
function crv(id: string, poId: string, lines: Array<[string, number]>): Crv {
  return { id, projectId: 'p', crvNo: id, seq: 1, poId, received: lines.map(([code, qtyReceived]) => ({ code, qtyReceived })), overReceipt: false };
}
function issue(code: string, qty: number): MaterialIssue {
  return { id: `i-${code}-${qty}`, projectId: 'p', dated: '2026-06-01', materialCode: code, qty, issuedTo: 'work' };
}

describe('materialRegister', () => {
  const demands = [demand('D1', [di('CEM', 'OPC Cement', 'bag', 1200, 'boq-1'), di('STEEL', 'Deformed bar', 'kg', 250, 'boq-2')])];
  const pos = [po('PO1', 'D1')];

  it('values receipts at the demand rate and links to BOQ', () => {
    const reg = materialRegister([crv('C1', 'PO1', [['CEM', 1000]])], demands, pos, []);
    const cem = reg.rows.find((r) => r.code === 'CEM')!;
    expect(cem.description).toBe('OPC Cement');
    expect(cem.unit).toBe('bag');
    expect(cem.receivedQty).toBe(1000);
    expect(cem.receivedValue).toBe(1_200_000);
    expect(cem.avgRate).toBe(1200);
    expect(cem.boqItemIds).toEqual(['boq-1']);
    expect(reg.totalReceivedValue).toBe(1_200_000);
  });

  it('computes balance on hand and values issues at average rate', () => {
    const reg = materialRegister([crv('C1', 'PO1', [['CEM', 1000]])], demands, pos, [issue('CEM', 600)]);
    const cem = reg.rows.find((r) => r.code === 'CEM')!;
    expect(cem.issuedQty).toBe(600);
    expect(cem.issuedValue).toBe(720_000); // 600 × 1200
    expect(cem.balanceQty).toBe(400);
    expect(cem.balanceValue).toBe(480_000);
    expect(cem.negative).toBe(false);
  });

  it('flags negative balances (issues exceed receipts)', () => {
    const reg = materialRegister([crv('C1', 'PO1', [['STEEL', 100]])], demands, pos, [issue('STEEL', 250)]);
    const steel = reg.rows.find((r) => r.code === 'STEEL')!;
    expect(steel.balanceQty).toBe(-150);
    expect(steel.negative).toBe(true);
    expect(reg.negativeCodes).toBe(1);
  });

  it('averages the rate across CRVs and merges quantities', () => {
    const d = [demand('D1', [di('CEM', 'OPC Cement', 'bag', 1000)]), demand('D2', [di('CEM', 'OPC Cement', 'bag', 1400)])];
    const p = [po('PO1', 'D1'), po('PO2', 'D2')];
    const reg = materialRegister(
      [crv('C1', 'PO1', [['CEM', 1000]]), crv('C2', 'PO2', [['CEM', 1000]])],
      d, p, [],
    );
    const cem = reg.rows.find((r) => r.code === 'CEM')!;
    expect(cem.receivedQty).toBe(2000);
    expect(cem.receivedValue).toBe(2_400_000);
    expect(cem.avgRate).toBe(1200); // (1000*1000 + 1000*1400)/2000
  });
});
