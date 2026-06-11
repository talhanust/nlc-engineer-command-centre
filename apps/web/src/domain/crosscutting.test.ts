import { describe, it, expect, beforeEach } from 'vitest';
import { toCsv, nodeBreakdownCsv, nodeBreakdownAoa } from './exporters';
import { formatMoney, setMoneyFormat } from './money';
import { computeNodeRollup } from './rollup';
import { LocalDataProvider } from '../data/LocalDataProvider';

describe('currency formats', () => {
  const v = 19284461163;
  it('formats the same value in each selected unit', () => {
    expect(formatMoney(v, 'cr')).toMatch(/Cr$/);
    expect(formatMoney(v, 'cr')).toContain('1,928');
    expect(formatMoney(v, 'mn')).toMatch(/^Rs .*Mn$/);
    expect(formatMoney(v, 'bn')).toBe('Rs 19.28 Bn');
    expect(formatMoney(v, 'rs')).toBe('Rs 19,284,461,163');
  });
  it('honours the persisted setting as the default', () => {
    setMoneyFormat('bn');
    expect(formatMoney(v)).toBe('Rs 19.28 Bn');
    setMoneyFormat('cr'); // restore default for other tests
  });
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'he said "hi"']]);
    expect(csv).toBe('a,b\n"x,y","he said ""hi"""');
  });

  it('builds a node breakdown with a TOTAL row', async () => {
    const p = new LocalDataProvider();
    const nodes = await p.listNodes();
    const projects = await p.listProjects();
    const rollup = computeNodeRollup(nodes, projects, 'pd-north')!;
    const csv = nodeBreakdownCsv(rollup);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Name');
    expect(lines[lines.length - 1]).toMatch(/^TOTAL,/);
    // AoA used for the Excel export shares the same shape
    const aoa = nodeBreakdownAoa(rollup);
    expect(aoa[0][0]).toBe('Name');
    expect(aoa[aoa.length - 1][0]).toBe('TOTAL');
  });
});

describe('audit trail', () => {
  beforeEach(() => localStorage.clear());
  it('records workflow events append-only', async () => {
    const p = new LocalDataProvider();
    expect(await p.listAudit()).toHaveLength(0);
    await p.transitionIpc('proj-f14f15', 'IPC-03', 'forward'); // vetted -> forwarded
    const log = await p.listAudit();
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].entity).toBe('IPC');
    expect(log[0].ref).toBe('IPC-03');
  });
});
