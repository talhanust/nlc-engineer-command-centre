import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import App from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear(); // comments + rag thresholds persist here in local mode
});

describe('shell & branding', () => {
  it('shows the NLC global brand in the header', async () => {
    renderAt('/');
    expect(await screen.findByText('NATIONAL LOGISTIC CORPORATION')).toBeInTheDocument();
    expect(screen.getByText(/Command Centre/)).toBeInTheDocument();
  });

  it('does not use FGEHA as global branding', async () => {
    renderAt('/');
    await screen.findByText('NATIONAL LOGISTIC CORPORATION');
    expect(document.querySelector('.app-header')!.textContent).not.toMatch(/FGEHA/i);
  });
});

describe('navigation & command dashboards', () => {
  it('root redirects to the HQ NLC command dashboard with a roll-up', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'HQ NLC' })).toBeInTheDocument();
    expect(screen.getByText('Projects').closest('.kpi')).toHaveTextContent('8');
  });

  it('shows a PD-HQ breakdown with its child projects', async () => {
    renderAt('/node/pd-north');
    await screen.findByRole('heading', { name: 'HQ PD North' });
    const table = screen.getByRole('table', { name: 'Breakdown' });
    expect(within(table).getByText('F-14/F-15 Islamabad')).toBeInTheDocument();
    expect(within(table).getByText('Bahria Enclave Roads')).toBeInTheDocument();
  });

  it('renders a project leaf with its client (FGEHA as client, not brand)', async () => {
    renderAt('/node/proj-f14f15');
    expect(await screen.findByRole('heading', { name: 'F-14/F-15 Islamabad' })).toBeInTheDocument();
    expect(screen.getByText(/Client: FGEHA/)).toBeInTheDocument();
  });

  it('drills down when a breakdown row is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-kpk');
    await screen.findByRole('heading', { name: 'HQ PD KPK' });
    const table = screen.getByRole('table', { name: 'Breakdown' });
    await user.click(within(table).getByText('M-2 Rehabilitation'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'M-2 Rehabilitation' })).toBeInTheDocument(),
    );
  });
});

describe('Phase 2 #6–#8 — panels, filter, comments', () => {
  it('shows league table, exceptions, and billing pipeline panels', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getByRole('table', { name: 'League table' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exceptions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Billing pipeline' })).toBeInTheDocument();
  });

  it('lists a behind project in the exceptions feed', async () => {
    renderAt('/node/pd-bln'); // Gwadar: planned 20 / actual 11 -> behind
    await screen.findByRole('heading', { name: 'HQ PD Bln' });
    const exceptions = screen.getByRole('heading', { name: 'Exceptions' }).closest('.panel')!;
    expect(within(exceptions as HTMLElement).getByText('Gwadar Free Zone Works')).toBeInTheDocument();
  });

  it('re-aggregates when the global filter is applied', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getByText('Projects').closest('.kpi')).toHaveTextContent('8');
    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'Karachi');
    await waitFor(() =>
      expect(screen.getByText('Projects').closest('.kpi')).toHaveTextContent('1'),
    );
  });

  it('accepts a comment and shows it', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'Notes & comments' });
    await user.type(screen.getByRole('textbox', { name: /add a comment/i }), 'Review billing for K-IV');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('Review billing for K-IV')).toBeInTheDocument();
  });
});
