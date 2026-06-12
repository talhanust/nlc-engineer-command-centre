import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { downloadWorkbook } from '../../components/xlsxExport';
import { groupByBill, boqTotal } from '../../domain/boq';
import { formatMoney } from '../../domain/money';
import type { BoqItem } from '../../data/types';
import { BoqImport } from './BoqImport';

export function BoqRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let alive = true;
    provider.listBoq(projectId).then((b) => alive && setItems(b));
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  const bills = groupByBill(items);

  return (
    <div>
      <div className="section-head">
        <h3>Bill of Quantities</h3>
        <div className="muted">
          {items.length} items · {formatMoney(boqTotal(items))}
          <button className="btn-ghost" style={{ marginLeft: 12 }} onClick={() => setImporting(true)}>
            Import
          </button>
          <button className="btn-ghost" style={{ marginLeft: 6 }} disabled={items.length === 0}
            onClick={() => void downloadWorkbook([{ name: 'BOQ', aoa: [
              ['Bill', 'Code', 'Description', 'Unit', 'Qty', 'Rate', 'Amount'],
              ...items.map((it) => [it.billNo, it.code, it.description, it.unit, it.qty, it.rate, Math.round(it.amount)]),
            ] }], `${projectId}-boq.xlsx`)}>
            Export Excel
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted">No BOQ yet. Use Import to paste a CSV/TSV bill of quantities.</p>
      ) : (
        bills.map((b) => (
          <div className="card" key={b.billNo}>
            <div className="section-head">
              <strong>Bill {b.billNo}</strong>
              <span className="muted">{formatMoney(b.total)}</span>
            </div>
            <table className="data-table" aria-label={`Bill ${b.billNo} items`}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.code}</td>
                    <td>{it.description}</td>
                    <td>{it.unit}</td>
                    <td className="num">{it.qty.toLocaleString('en-PK')}</td>
                    <td className="num">{it.rate.toLocaleString('en-PK')}</td>
                    <td className="num">{formatMoney(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {importing && (
        <BoqImport
          projectId={projectId}
          onClose={() => setImporting(false)}
          onImported={(rows) => {
            setItems(rows);
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}
