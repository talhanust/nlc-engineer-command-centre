import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportMenu } from './ExportMenu';

describe('ExportMenu', () => {
  const props = {
    filename: 'demo', title: 'Demo Register',
    columns: [{ label: 'A' }, { label: 'B', align: 'right' as const }],
    rows: [['x', 1], ['y', 2]],
  };

  it('is disabled with no rows', () => {
    render(<ExportMenu {...props} rows={[]} />);
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  it('opens to reveal Excel and PDF options', async () => {
    const user = userEvent.setup();
    render(<ExportMenu {...props} />);
    await user.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: 'Excel (.xlsx)' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'PDF (.pdf)' })).toBeInTheDocument();
  });
});
