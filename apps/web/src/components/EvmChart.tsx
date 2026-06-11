import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { MonthlySeriesPoint } from '../data/types';
import { ChartCard, chartPalette } from './chartUtils';

const cr = (n: number) => `${(n / 1e7).toFixed(1)} Cr`;

export interface EvmPoint { month: string; pv: number; ev: number; ac: number | null; }

/**
 * Earned Value: PV (planned value), EV (earned value), AC (actual cost).
 * Derived from the progress S-curve × contract value, and cost from payments.
 */
export function buildEvm(series: MonthlySeriesPoint[], contractValue: number, costToDate: number): EvmPoint[] {
  // Spread actual cost across months proportional to earned progress.
  const lastEv = series.reduce((m, p) => (p.actual != null ? p.actual : m), 0) || 1;
  return series.map((p) => ({
    month: p.month,
    pv: +(contractValue * (p.planned / 100)).toFixed(0),
    ev: p.actual == null ? (null as unknown as number) : +(contractValue * (p.actual / 100)).toFixed(0),
    ac: p.actual == null ? null : +(costToDate * (p.actual / lastEv)).toFixed(0),
  }));
}

export function EvmChart({ data }: { data: EvmPoint[] }) {
  const c = chartPalette();
  return (
    <ChartCard title="Earned value (EVM)" subtitle="PV · EV · AC" ariaLabel="Earned value">
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: c.grid }} interval={1} />
          <YAxis tickFormatter={cr} tickLine={false} axisLine={false} width={52} />
          <Tooltip formatter={(v: number | string) => cr(Number(v))} />
          <Legend iconType="plainline" />
          <Line type="monotone" dataKey="pv" name="Planned value" stroke={c.signal} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Line type="monotone" dataKey="ev" name="Earned value" stroke={c.primary} strokeWidth={2.6} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="ac" name="Actual cost" stroke={c.amber} strokeWidth={2.2} dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
