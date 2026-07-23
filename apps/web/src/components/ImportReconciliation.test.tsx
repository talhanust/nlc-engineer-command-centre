import { render, screen, within } from '@testing-library/react';
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
      skipped: [{ bill: '6A', code: '', description: 'Toll Plaza', amount: 176_000_000, reason: 'not-in-boq', detail: 'no item code — matched on description, which found nothing' }],
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
      skipped: [{ bill: '1', code: 'X', description: 'thing', amount: 5_000_000, reason: 'no-rate' }],
      fileValue: 5_000_000, matchedValue: 0, variance: 5_000_000,
    })} />);
    expect(screen.getByText(/short of the sheet/)).toBeInTheDocument();
  });

  it('explains each skip reason', () => {
    render(<ImportReconciliation result={result({
      skipped: [
        { bill: '4a', code: '401f', description: 'Lean concrete', amount: 10, reason: 'ambiguous', detail: '6 BOQ items share this code' },
        { bill: '1', code: 'Z', description: 'no rate', amount: 20, reason: 'no-rate' },
        { bill: '1', code: 'Y', description: 'no qty', amount: 0, reason: 'no-quantity' },
      ],
      fileValue: 30, matchedValue: 0, variance: 30,
    })} />);
    const table = screen.getByLabelText('Rows not imported');
    expect(table.textContent).toMatch(/matches more than one/);
    expect(table.textContent).toMatch(/No sublet rate/);
    expect(table.textContent).toMatch(/No quantity/);
  });
});
