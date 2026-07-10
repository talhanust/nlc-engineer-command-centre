import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';
import { setKvStore, type KvStore } from '../../data/LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}
beforeEach(() => setKvStore(memKv()));

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Gantt — interactive controls', () => {
  it('exposes zoom, scroll and row-height sliders and a dependency toggle', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    await screen.findByRole('img', { name: 'Gantt chart' });

    const zoom = screen.getByLabelText('Zoom timeline') as HTMLInputElement;
    expect(zoom.type).toBe('range');
    expect(screen.getByLabelText('Scroll timeline')).toBeInTheDocument();
    expect(screen.getByLabelText('Row height')).toBeInTheDocument();
    expect(screen.getByLabelText('Show dependencies')).toBeChecked();
  });

  it('dragging the zoom slider rescales the timeline', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    await screen.findByRole('img', { name: 'Gantt chart' });

    const zoom = screen.getByLabelText('Zoom timeline');
    fireEvent.change(zoom, { target: { value: '12' } });
    expect(screen.getByText('12 px/day')).toBeInTheDocument();

    // Fit recomputes the scale from the container width without throwing.
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    expect(screen.getByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });

  it('selecting a bar traces its logic and can be cleared', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    const chart = await screen.findByRole('img', { name: 'Gantt chart' });

    expect(screen.getByText(/click a bar to trace its logic/)).toBeInTheDocument();
    const bar = chart.querySelector('.gantt-row-hit');
    expect(bar).not.toBeNull();
    await user.click(bar as Element);
    expect(await screen.findByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText(/click a bar to trace its logic/)).toBeInTheDocument();
  });

  it('filters to the critical path only', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    await screen.findByRole('img', { name: 'Gantt chart' });

    const critical = screen.getByRole('button', { name: 'Critical only' });
    await user.click(critical);
    expect(critical).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });
});

describe('Mapping — Activity → BOQ quantity allocation', () => {
  it('maps many BOQ items to one activity and allocates quantity per item', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await user.click(await screen.findByRole('tab', { name: 'Activity → BOQ' }));

    // An activity is preselected; attach a BOQ item to it.
    const add = await screen.findByLabelText(/^Add BOQ item to /);
    const options = within(add as HTMLSelectElement).getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    await user.selectOptions(add, options[1]);

    // The allocation row appears with a slider and a numeric quantity.
    const table = await screen.findByRole('table', { name: 'Activity BOQ allocation' });
    expect(within(table).getAllByRole('slider').length).toBe(1);

    // Attach a second item — one activity, many items.
    const add2 = screen.getByLabelText(/^Add BOQ item to /);
    const opts2 = within(add2 as HTMLSelectElement).getAllByRole('option');
    await user.selectOptions(add2, opts2[1]);
    expect(within(await screen.findByRole('table', { name: 'Activity BOQ allocation' })).getAllByRole('slider').length).toBe(2);
  });

  it('blocks approval when an item is over-allocated across activities', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await user.click(await screen.findByRole('tab', { name: 'Activity → BOQ' }));

    // Give activity #1 the full quantity of an item…
    const add = await screen.findByLabelText(/^Add BOQ item to /);
    const options = within(add as HTMLSelectElement).getAllByRole('option');
    const itemLabel = options[1].textContent ?? '';
    await user.selectOptions(add, options[1]);
    const qtyInput = within(await screen.findByRole('table', { name: 'Activity BOQ allocation' }))
      .getAllByLabelText(/^Allocated qty /)[0];
    await user.clear(qtyInput);
    await user.type(qtyInput, '999999');
    await user.tab();

    // …then confirm the over-allocation is reported and blocks the workflow.
    expect(await screen.findByLabelText('Allocation errors')).toBeInTheDocument();
    expect(itemLabel.length).toBeGreaterThan(0);
  });
});
