import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import { DataContextProvider } from './data/DataContext';
import { PoDetailModal } from './components/PoDetailModal';
import { PaymentDetailModal } from './components/PaymentDetailModal';
import type { PurchaseOrder, ProcPayment } from './data/types';

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter><DataContextProvider>{ui}</DataContextProvider></MemoryRouter>);
}
beforeEach(() => localStorage.clear());

const po: PurchaseOrder = {
  id: 'po-test', projectId: 'proj-f14f15', poNo: 'PO-09', seq: 9,
  demandId: 'dmd-x', supplierId: 'sup-x', totalValue: 1_000_000, status: 'open',
};
const payment: ProcPayment = {
  id: 'pay-test', projectId: 'proj-f14f15', paymentNo: 'PAY-09', seq: 9,
  refType: 'po', refId: 'po-test', amount: 500_000,
  chainType: 'proc_payment_material', currentStage: 0, history: [],
};

describe('detail modals (PO + payment)', () => {
  it('renders the PO detail modal with an audit trail', async () => {
    wrap(<PoDetailModal projectId="proj-f14f15" po={po} onClose={() => {}} />);
    expect(await screen.findByRole('dialog', { name: 'PO PO-09 detail' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit trail' })).toBeInTheDocument();
  });

  it('renders the payment detail modal with the approval chain', async () => {
    wrap(<PaymentDetailModal payment={payment} onClose={() => {}} />);
    expect(await screen.findByRole('dialog', { name: 'Payment PAY-09 detail' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approval chain' })).toBeInTheDocument();
  });
});
