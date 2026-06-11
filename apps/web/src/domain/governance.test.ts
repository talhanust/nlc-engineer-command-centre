import { describe, it, expect, beforeEach } from 'vitest';
import { can, getAccessMatrix, setAccessMatrix, DEFAULT_ACCESS_MATRIX } from './access';
import { LocalDataProvider } from '../data/LocalDataProvider';

describe('access matrix', () => {
  beforeEach(() => { localStorage.clear(); setAccessMatrix(structuredClone(DEFAULT_ACCESS_MATRIX)); });

  it('encodes sensible defaults', () => {
    expect(can('pd', 'approve_ipc')).toBe(true);
    expect(can('pm', 'approve_ipc')).toBe(false);
    expect(can('dg', 'edit_settings')).toBe(true);
  });

  it('persists edits', () => {
    const m = getAccessMatrix();
    m.pm = [...m.pm, 'approve_ipc'];
    setAccessMatrix(m);
    expect(can('pm', 'approve_ipc')).toBe(true);
  });
});

describe('audited IPC reverse', () => {
  beforeEach(() => localStorage.clear());

  it('steps the status back one stage and records an audit entry', async () => {
    const p = new LocalDataProvider();
    await p.transitionIpc('proj-f14f15', 'IPC-03', 'forward'); // vetted -> forwarded_to_client
    const reversed = await p.reverseIpc('proj-f14f15', 'IPC-03');
    expect(reversed.status).toBe('vetted');
    const log = await p.listAudit();
    expect(log[0].action).toBe('reverse');
    expect(log[0].ref).toBe('IPC-03');
  });

  it('refuses to reverse a draft IPC', async () => {
    const p = new LocalDataProvider();
    const ipc = await p.createIpc('proj-f14f15', { period: 'Jul-2026', gross: 1000 });
    await expect(p.reverseIpc('proj-f14f15', ipc.ipcNo)).rejects.toThrow();
  });
});
