import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function gotoSub(name: string) {
  const user = userEvent.setup();
  renderAt('/node/proj-f14f15/commercial');
  await screen.findByText('BOQ lifecycle');
  await user.click(screen.getByRole('tab', { name }));
  return user;
}

describe('contract & RAR detail views', () => {
  beforeEach(() => localStorage.clear());

  it('opens a contract and shows the contractor BOQ with executed and RAR-billed', async () => {
    const user = await gotoSub('Contracts');
    const reg = await screen.findByRole('table', { name: 'Contracts register' });
    await user.click(within(reg).getAllByRole('button', { name: /View NLC\// })[0]);
    const dialog = await screen.findByRole('dialog');
    const boq = within(dialog).getByRole('table', { name: 'Contractor BOQ' });
    expect(boq).toBeInTheDocument();
    expect(within(boq).getByText('RAR-billed')).toBeInTheDocument();
    expect(within(boq).getByText('Executed')).toBeInTheDocument();
    // contractor scope shows multiple BOQ lines
    expect(within(boq).getAllByText(/Bill \d+ ·/).length).toBeGreaterThan(1);
  });

  it('opens a RAR and shows the previous/this/cumulative measurement sheet', async () => {
    const user = await gotoSub('RAR Register');
    const reg = await screen.findByRole('table', { name: 'RAR register' });
    await user.click(within(reg).getAllByRole('button', { name: /Details for RAR-|Open RAR-|RAR-0/ })[0]);
    const dialog = await screen.findByRole('dialog');
    const sheet = within(dialog).getByRole('table', { name: 'RAR measurement sheet' });
    expect(within(sheet).getByText('Previous')).toBeInTheDocument();
    expect(within(sheet).getByText('This RAR')).toBeInTheDocument();
    expect(within(sheet).getByText('Cumulative')).toBeInTheDocument();
  });
});
