import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { dataUrlBytes, humanSize } from '../domain/files';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('attachments', () => {
  beforeEach(() => setKvStore(memKv()));

  it('adds, lists (scoped to entity+ref) and deletes', async () => {
    const p = new LocalDataProvider();
    const base = { dataUrl: 'data:image/jpeg;base64,AAAA', mime: 'image/jpeg', size: 3, dated: '2026-06-23' };
    await p.addAttachment('proj-f14f15', { entity: 'IPC', reference: 'IPC-01', name: 'sheet.jpg', ...base });
    await p.addAttachment('proj-f14f15', { entity: 'RAR', reference: 'RAR-01', name: 'cert.pdf', ...base, mime: 'application/pdf' });

    const ipc = await p.listAttachments('proj-f14f15', 'IPC', 'IPC-01');
    expect(ipc).toHaveLength(1);
    expect(ipc[0].name).toBe('sheet.jpg');
    expect(await p.listAttachments('proj-f14f15', 'IPC', 'IPC-02')).toHaveLength(0); // scoped by ref
    expect(await p.listAttachments('proj-f14f15', 'RAR', 'RAR-01')).toHaveLength(1); // scoped by entity

    await p.deleteAttachment('proj-f14f15', ipc[0].id);
    expect(await p.listAttachments('proj-f14f15', 'IPC', 'IPC-01')).toHaveLength(0);
  });
});

describe('file helpers', () => {
  it('estimates data-url byte size and formats it', () => {
    expect(dataUrlBytes('data:image/png;base64,AAAAAAAA')).toBe(6);
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
