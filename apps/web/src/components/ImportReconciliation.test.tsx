import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ImportReconciliation } from './ImportReconciliation';
import type { SubletImportResult } from '../domain/subletImport';

const result = (over: Partial<SubletImportResult> = {}): SubletImportResult => ({
  matched: [], ambiguous: [], unmatched: [], skipped: [],
  fileValue: 0, matchedValue: 0, variance: 0, ...over,
});

describe('ImportReconciliation', () => {
  it('reports a clean import when nothing was lost', () => {
    render(<ImportReconciliation result={result({
      matched: [{ boqItemId: 'i1', qty: 1, rate: 100 }], fileValue: 100, matchedValue: 100, variance: 0,
    })} />);
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rows not imported')).toBeNull();
  });

  it('names a dropped provisional sum and its value — the Rs 176 Mn case', () => {
    render(<ImportReconciliation result={result({
      matched: [{ boqItemId: 'i1', qty: 1, rate: 2_342_703_598 }],
      skipped: [{ bill: '6A', code: '', description: 'Toll Plaza', qty: 1, rate: 176_000_000, amount: 176_000_000, reason: 'not-in-boq', detail: 'no item code — matched on description, which found nothing' }],
      fileValue: 2_518_703_598, matchedValue: 2_342_703_598, variance: 176_000_000,
    })} fileName="WKC_Contract.csv" />);

    expect(screen.getByText('Variance')).toBeInTheDocument();
    const table = screen.getByLabelText('Rows not imported');
    const row = within(table).getByText('Toll Plaza').closest('tr')!;
    expect(row.textContent).toContain('176'); // the money is on screen
    expect(row.textContent).toMatch(/No such item/);
    // The file name is shown so the user knows which upload this refers to.
    expect(screen.getByText(/WKC_Contract\.csv/)).toBeInTheDocument();
  });

  it('states the shortfall in words, not just as a number in a table', () => {
    render(<ImportReconciliation result={result({
      skipped: [{ bill: '1', code: 'X', description: 'thing', qty: 1, rate: 5_000_000, amount: 5_000_000, reason: 'no-rate' }],
      fileValue: 5_000_000, matchedValue: 0, variance: 5_000_000,
    })} />);
    expect(screen.getByText(/short of the sheet/)).toBeInTheDocument();
  });

  it('explains each skip reason', () => {
    render(<ImportReconciliation result={result({
      skipped: [
        { bill: '4a', code: '401f', description: 'Lean concrete', qty: 1, rate: 10, amount: 10, reason: 'ambiguous', detail: '6 BOQ items share this code' },
        { bill: '1', code: 'Z', description: 'no rate', qty: 2, rate: 10, amount: 20, reason: 'no-rate' },
        { bill: '1', code: 'Y', description: 'no qty', qty: 0, rate: 10, amount: 0, reason: 'no-quantity' },
      ],
      fileValue: 30, matchedValue: 0, variance: 30,
    })} />);
    const table = screen.getByLabelText('Rows not imported');
    expect(table.textContent).toMatch(/matches more than one/);
    expect(table.textContent).toMatch(/No sublet rate/);
    expect(table.textContent).toMatch(/No quantity/);
  });
});

// The real Toll Plaza case: the item IS in the BOQ, worded differently. The panel
// must offer it as a candidate and let the user commit the match — never guess.
describe('ImportReconciliation — resolving an unplaced row inline', () => {
  const items = [
    { id: 'i-109', projectId: 'p', billNo: '6a', billName: 'Bill 6a', section: '', code: '109',
      description: 'Remodeling of Toll Plaza', unit: 'PS', qty: 1, rate: 200_000_000, amount: 200_000_000 },
    { id: 'i-101', projectId: 'p', billNo: '1', billName: 'Bill 1', section: '', code: '101',
      description: 'Clearing & grubbing', unit: 'SM', qty: 100, rate: 37, amount: 3700 },
  ] as import('../data/types').BoqItem[];

  const skipped = {
    bill: '6A', code: '', description: 'Toll Plaza', qty: 1, rate: 176_000_000,
    amount: 176_000_000, reason: 'not-in-boq' as const,
  };

  it('offers the differently-worded BOQ item as the first candidate', () => {
    render(<ImportReconciliation
      result={result({ skipped: [skipped], fileValue: 176_000_000, matchedValue: 0, variance: 176_000_000 })}
      items={items} onResolve={() => {}} />);
    const select = screen.getByLabelText('Match Toll Plaza to a BOQ item') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map((o) => o.textContent ?? '');
    // First real option is the starred suggestion, and it is the right item.
    expect(options[1]).toMatch(/Remodeling of Toll Plaza/);
    expect(options[1]).toMatch(/^★/);
  });

  it('reports the chosen item back to the caller', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    render(<ImportReconciliation
      result={result({ skipped: [skipped], fileValue: 176_000_000, matchedValue: 0, variance: 176_000_000 })}
      items={items} onResolve={(_r, id) => picked.push(id)} />);
    await user.selectOptions(screen.getByLabelText('Match Toll Plaza to a BOQ item'), 'i-109');
    expect(picked).toEqual(['i-109']);
  });

  it('does not offer a picker when the row needs fixing in the sheet', () => {
    render(<ImportReconciliation
      result={result({
        skipped: [{ bill: '1', code: 'X', description: 'no rate', qty: 2, rate: 0, amount: 0, reason: 'no-rate' }],
        fileValue: 0, matchedValue: 0, variance: 0,
      })}
      items={items} onResolve={() => {}} />);
    expect(screen.queryByLabelText(/Match no rate/)).toBeNull();
    expect(screen.getByText('fix in the sheet')).toBeInTheDocument();
  });

  it('shows no picker at all when the caller cannot resolve', () => {
    render(<ImportReconciliation result={result({ skipped: [skipped], fileValue: 1, matchedValue: 0, variance: 1 })} />);
    expect(screen.queryByLabelText(/Match Toll Plaza/)).toBeNull();
  });
});
