import { describe, it, expect } from 'vitest';
import { materialLedger } from './materialLedger';
import type { Crv, Demand, PurchaseOrder, MaterialIssue, DemandItem } from '../data/types';

function demand(id: string, items: DemandItem[]): Demand {
  return { id, projectId: 'p', demandNo: id, seq: 1, type: 'material', justification: '', totalEstimated: 0, chainType: 'proc_demand_material', currentStage: 0, items, history: [] };
}
function di(code: string, rate: number): DemandItem {
  return { code, description: code, unit: 'bag', qty: 0, estimatedRate: rate };
}
function po(id: string, demandId: string): PurchaseOrder {
  return { id, projectId: 'p', poNo: id, seq: 1, demandId, supplierId: 's', totalValue: 0, status: 'open' };
}
function crv(id: string, poId: string, code: string, qty: number): Crv {
  return { id, projectId: 'p', crvNo: id, seq: 1, poId, received: [{ code, qtyReceived: qty }], overReceipt: false };
}
function issue(code: string, qty: number, dated: string, opts: Partial<MaterialIssue> = {}): MaterialIssue {
  return { id: `i-${dated}-${qty}`, projectId: 'p', dated, materialCode: code, qty, issuedTo: 'work', ...opts };
}

describe('materialLedger', () => {
  const demands = [demand('D1', [di('CEM', 1200)])];
  const pos = [po('PO1', 'D1')];

  it('lists receipts valued at the demand rate', () => {
    const l = materialLedger('CEM', [crv('C1', 'PO1', 'CEM', 1000)], demands, pos, []);
    expect(l.receipts).toHaveLength(1);
    expect(l.receipts[0]).toMatchObject({ crvNo: 'C1', poNo: 'PO1', qty: 1000, rate: 1200, value: 1_200_000 });
    expect(l.receivedQty).toBe(1000);
    expect(l.avgRate).toBe(1200);
  });

  it('builds a running balance across receipts then issues', () => {
    const l = materialLedger('CEM', [crv('C1', 'PO1', 'CEM', 1000)], demands, pos, [
      issue('CEM', 600, '2026-06-05'),
      issue('CEM', 100, '2026-06-02'),
    ]);
    // issues sorted by date: 06-02 (100), 06-05 (600)
    expect(l.movements.map((m) => m.balance)).toEqual([1000, 900, 300]);
    expect(l.issuedQty).toBe(700);
    expect(l.balanceQty).toBe(300);
  });

  it('values issues at their own rate when set, else the store average', () => {
    const l = materialLedger('CEM', [crv('C1', 'PO1', 'CEM', 1000)], demands, pos, [
      issue('CEM', 100, '2026-06-02', { rate: 1500 }),
      issue('CEM', 100, '2026-06-03'),
    ]);
    expect(l.issues[0].value).toBe(150_000); // own rate
    expect(l.issues[1].value).toBe(120_000); // avg 1200
  });

  it('isolates the requested code', () => {
    const l = materialLedger('CEM', [crv('C1', 'PO1', 'CEM', 10)], demands, pos, [issue('STEEL', 5, '2026-06-01')]);
    expect(l.issues).toHaveLength(0);
    expect(l.receivedQty).toBe(10);
  });
});
