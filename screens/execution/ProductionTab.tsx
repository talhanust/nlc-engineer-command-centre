import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useData } from '../../data/DataContext';
import { reconcileMaterials } from '../../domain/material';
import { ChartCard, chartPalette } from '../../components/chartUtils';
import type { ProductionRun, MaterialIssue, Crv } from '../../data/types';
import { PlantProductionPanel } from './PlantProductionPanel';

export function ProductionTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [crvs, setCrvs] = useState<Crv[]>([]);

  // production form
  const [pDate, setPDate] = useState('2026-06-09');
  const [product, setProduct] = useState('');
  const [unit, setUnit] = useState('tonne');
  const [planned, setPlanned] = useState('');
  const [actual, setActual] = useState('');
  // issue form
  const [iDate, setIDate] = useState('2026-06-09');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [to, setTo] = useState('');

  async function reload() {
    const [r, i, c] = await Promise.all([
      provider.listProductionRuns(projectId), provider.listMaterialIssues(projectId), provider.listCrvs(projectId),
    ]);
    setRuns(r); setIssues(i); setCrvs(c);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function addRun() {
    const p = Number(planned), a = Number(actual);
    if (!product.trim() || !Number.isFinite(p) || !Number.isFinite(a)) return;
    await provider.createProductionRun(projectId, { dated: pDate, product: product.trim(), unit, plannedQty: p, actualQty: a });
    setProduct(''); setPlanned(''); setActual(''); await reload();
  }
  async function addIssue() {
    const q = Number(qty);
    if (!code.trim() || !Number.isFinite(q) || !to.trim()) return;
    await provider.createMaterialIssue(projectId, { dated: iDate, materialCode: code.trim(), qty: q, issuedTo: to.trim() });
    setCode(''); setQty(''); setTo(''); await reload();
  }

  const recon = reconcileMaterials(crvs, issues);
  const c = chartPalette();
  const chartData = runs.map((r) => ({ name: `${r.product.slice(0, 10)} ${r.dated.slice(5)}`, Planned: r.plannedQty, Actual: r.actualQty }));

  return (
    <div>
      <PlantProductionPanel projectId={projectId} />
      <div className="section-head" style={{ marginTop: 16 }}><h3>Production runs</h3><span className="muted">{runs.length} runs</span></div>
      <div className="card create-row">
        <input aria-label="Run date" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
        <input aria-label="Product" placeholder="Product" value={product} onChange={(e) => setProduct(e.target.value)} />
        <input aria-label="Run unit" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 80 }} />
        <input aria-label="Planned qty" placeholder="Planned" value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ width: 90 }} />
        <input aria-label="Actual qty" placeholder="Actual" value={actual} onChange={(e) => setActual(e.target.value)} style={{ width: 90 }} />
        <button className="btn" onClick={addRun}>Add run</button>
      </div>

      {runs.length > 0 && (
        <ChartCard title="Production: planned vs actual" ariaLabel="Production planned vs actual">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: c.grid }} fontSize={10} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Planned" fill={c.signal} radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Actual" fill={c.primary} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {runs.length > 0 && (
        <div className="card">
          <table className="data-table" aria-label="Production runs">
            <thead><tr><th>Date</th><th>Product</th><th>Unit</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Variance</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const v = r.actualQty - r.plannedQty;
                return (
                  <tr key={r.id}>
                    <td>{r.dated}</td><td>{r.product}</td><td>{r.unit}</td>
                    <td className="num">{r.plannedQty.toLocaleString()}</td>
                    <td className="num">{r.actualQty.toLocaleString()}</td>
                    <td className={`num ${v < 0 ? 'neg' : 'pos'}`}>{v >= 0 ? '+' : ''}{v.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 20 }}><h3>Material issues</h3><span className="muted">{issues.length} issues</span></div>
      <div className="card create-row">
        <input aria-label="Issue date" type="date" value={iDate} onChange={(e) => setIDate(e.target.value)} />
        <input aria-label="Material code" placeholder="Material code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input aria-label="Issue qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 90 }} />
        <input aria-label="Issued to" placeholder="Issued to (activity)" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <button className="btn" onClick={addIssue}>Issue</button>
      </div>
      {issues.length > 0 && (
        <div className="card">
          <table className="data-table" aria-label="Material issues">
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th>Issued to</th></tr></thead>
            <tbody>
              {issues.map((i) => (<tr key={i.id}><td>{i.dated}</td><td>{i.materialCode}</td><td className="num">{i.qty.toLocaleString()}</td><td>{i.issuedTo}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 20 }}><h3>Material reconciliation</h3><span className="muted">received vs issued</span></div>
      {recon.length === 0 ? (
        <p className="muted">No materials received or issued yet. Receipts come from procurement CRVs.</p>
      ) : (
        <table className="data-table" aria-label="Material reconciliation">
          <thead><tr><th>Material</th><th className="num">Received (CRV)</th><th className="num">Issued</th><th className="num">Balance on hand</th></tr></thead>
          <tbody>
            {recon.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td>
                <td className="num">{r.received.toLocaleString()}</td>
                <td className="num">{r.issued.toLocaleString()}</td>
                <td className={`num ${r.balance < 0 ? 'neg' : ''}`}>{r.balance.toLocaleString()}{r.balance < 0 ? ' ⚠' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">A negative balance means issues exceed recorded CRV receipts — investigate stock records.</p>
    </div>
  );
}
