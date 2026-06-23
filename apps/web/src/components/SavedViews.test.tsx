import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadViews, saveView, deleteView } from '../state/savedViews';
import { SavedViews } from './SavedViews';

describe('saved views store', () => {
  beforeEach(() => localStorage.clear());

  it('saves, lists and deletes named filter snapshots per scope', () => {
    saveView('rar:p1', 'Overdue', { stage: 'submitted' });
    saveView('rar:p1', 'Paid', { stage: 'paid' });
    expect(loadViews('rar:p1').map((v) => v.name)).toEqual(['Overdue', 'Paid']);
    expect(loadViews('rar:p2')).toEqual([]); // scoped
    deleteView('rar:p1', 'Overdue');
    expect(loadViews('rar:p1').map((v) => v.name)).toEqual(['Paid']);
  });

  it('overwrites a view saved under the same name', () => {
    saveView('s', 'V', { a: '1' });
    saveView('s', 'V', { a: '2' });
    const views = loadViews('s');
    expect(views).toHaveLength(1);
    expect(views[0].filters.a).toBe('2');
  });
});

describe('SavedViews component', () => {
  beforeEach(() => localStorage.clear());

  it('saves the current filters and applies them back on click', async () => {
    const user = userEvent.setup();
    const applied: Record<string, string>[] = [];
    render(<SavedViews scope="rar:test" current={{ stage: 'approved' }} onApply={(f) => applied.push(f)} />);
    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.type(screen.getByLabelText('View name'), 'Approved');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Apply view Approved' }));
    expect(applied).toEqual([{ stage: 'approved' }]);
  });
});
