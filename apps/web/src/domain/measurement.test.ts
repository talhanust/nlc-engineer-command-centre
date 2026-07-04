import { describe, it, expect } from 'vitest';
import { measurementSheet } from './measurement';
import type { BoqItem } from '../data/types';

const item = (id: string, qty: number, rate: number): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'Road Work', section: 'Earthwork',
  code: id, description: id, unit: 'Cum', qty, rate, amount: qty * rate,
});

describe('measurement sheet', () => {
  const boq = [item('a', 100, 10), item('b', 50, 20)]; // BOQ total 1000 + 1000 = 2000
  const certs = [
    { seq: 1, lines: [{ boqItemId: 'a', qty: 30, amount: 300 }] },
    { seq: 2, lines: [{ boqItemId: 'a', qty: 20, amount: 200 }, { boqItemId: 'b', qty: 10, amount: 200 }] },
  ];

  it('computes previous / this / cumulative for the current certificate', () => {
    const sheet = measurementSheet(certs[1], certs, boq);
    const a = sheet.rows.find((r) => r.item.id === 'a')!;
    expect(a.prevQty).toBe(30); expect(a.prevAmount).toBe(300);
    expect(a.thisQty).toBe(20); expect(a.thisAmount).toBe(200);
    expect(a.cumQty).toBe(50); expect(a.cumAmount).toBe(500);
    expect(a.balanceAmount).toBe(500); // 1000 BOQ − 500 cumulative
    expect(sheet.prevGross).toBe(300);
    expect(sheet.thisGross).toBe(400);
    expect(sheet.cumGross).toBe(700);
    expect(sheet.boqTotal).toBe(2000);
  });

  it('lists every BOQ item by default and only billed items when asked', () => {
    expect(measurementSheet(certs[0], certs, boq).rows.length).toBe(2);
    const billed = measurementSheet(certs[0], certs, boq, { onlyBilled: true });
    expect(billed.rows.length).toBe(1); // only item 'a' has cumulative value at seq 1
    expect(billed.rows[0].item.id).toBe('a');
  });
});
