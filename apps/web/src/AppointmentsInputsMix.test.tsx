import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { APPOINTMENTS, legacyRoleFor } from './domain/appointments';
import { DEFAULT_MIX_DESIGNS, runConsumption } from './domain/mixdesigns';
import { inputAckWorklist } from './domain/worklist';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('individual logins for all appointments (A1)', () => {
  it('seeds a user per appointment with a legacy acting role and scope', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const users = await p.listUsers();
    // every appointment is represented
    for (const a of APPOINTMENTS) {
      expect(users.some((u) => u.appointmentId === a.id), `missing login for ${a.id}`).toBe(true);
    }
    const sqs = users.find((u) => u.appointmentId === 'sqs')!;
    expect(sqs.role).toBe('qs');
    expect(sqs.nodeId).toBe('proj-f14f15');
    expect(legacyRoleFor('pre_audit')).toBe('fm');
    expect(legacyRoleFor('cfo')).toBe('fm');
  });
});

describe('mark-input minute with acknowledgement (A9)', () => {
  it('creates, routes to the superior appointment and acknowledges once', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const m = await p.createMarkInput({
      fromUser: 'Senior Quantity Surveyor', fromAppointmentId: 'sqs', toAppointmentId: 'dpm',
      nodeId: 'proj-f14f15', text: 'IPC-05 quantities ready for endorsement',
    });
    expect(m.status).toBe('sent');
    let all = await p.acknowledgeMarkInput(m.id, 'Deputy Project Manager');
    const acked = all.find((x) => x.id === m.id)!;
    expect(acked.status).toBe('acknowledged');
    expect(acked.ackBy).toBe('Deputy Project Manager');
    // second ack is a no-op (ackBy preserved)
    all = await p.acknowledgeMarkInput(m.id, 'Someone Else');
    expect(all.find((x) => x.id === m.id)?.ackBy).toBe('Deputy Project Manager');
  });

  it('routes pending acknowledgements to the recipient work-list only', () => {
    const inputs = [
      { id: 'a', fromUser: 'SQS', toAppointmentId: 'dpm', nodeId: 'n1', text: 'x', status: 'sent' },
      { id: 'b', fromUser: 'SQS', toAppointmentId: 'dpm', nodeId: 'n1', text: 'y', status: 'acknowledged' },
    ];
    expect(inputAckWorklist('dpm', inputs, (id) => id)).toHaveLength(1);
    expect(inputAckWorklist('spm', inputs, (id) => id)).toHaveLength(0);
    expect(inputAckWorklist(undefined, inputs, (id) => id)).toHaveLength(0);
  });

  it('signed-in user marks an input up the proper channel and superior acknowledges', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByText('Inputs to command (proper channel)');
    // sign in as SQS (project scope)
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Senior Quantity Surveyor');
    const box = await screen.findByLabelText('Input text');
    expect((box as HTMLInputElement).placeholder).toMatch(/Deputy Project Manager/);
    await user.type(box, 'RAR-03 recovery figures need review');
    await user.click(screen.getByRole('button', { name: 'Mark input ↑' }));
    await screen.findByRole('table', { name: 'My inputs' });
    // switch to DPM — the input awaits acknowledgement
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Deputy Project Manager');
    const pending = await screen.findByRole('table', { name: 'Inputs awaiting acknowledgement' });
    const row = within(pending).getByText(/RAR-03 recovery/).closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Acknowledge/ }));
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Inputs awaiting acknowledgement' })).not.toBeInTheDocument());
  });
});

describe('mix-design library (A6)', () => {
  it('ships standard grades and computes run consumption', () => {
    const c20 = DEFAULT_MIX_DESIGNS.find((m) => m.id === 'C20')!;
    const demand = runConsumption(c20, 100); // 100 m³ pour
    expect(demand.get('CEM')).toBe(720);
    expect(demand.get('ADMIX')).toBe(110);
    expect(DEFAULT_MIX_DESIGNS.map((m) => m.id)).toEqual(expect.arrayContaining(['C15', 'C20', 'C30', 'AC-BASE', 'AC-WEARING']));
  });

  it('persists per-project coefficient edits', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const all = await p.listMixDesigns('proj-f14f15');
    const c30 = all.find((m) => m.id === 'C30')!;
    const edited = { ...c30, constituents: c30.constituents.map((c) => (c.materialRef === 'CEM' ? { ...c, coeff: 8.8 } : c)) };
    const saved = await p.upsertMixDesign('proj-f14f15', edited);
    expect(saved.find((m) => m.id === 'C30')!.constituents.find((c) => c.materialRef === 'CEM')!.coeff).toBe(8.8);
  });
});
