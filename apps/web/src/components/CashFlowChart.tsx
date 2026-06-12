import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Brush,
} from 'recharts';
import type { CashFlowMonth } from '../domain/finance';
import { ChartCard, chartPalette } from './chartUtils';

const cr = (n: number) => `${(n / 1e7).toFixed(1)} Cr`;

/** Inflow/outflow bars + cumulative-net line. Forecast tail rendered lighter. */
export function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  const c = chartPalette();
  return (
    <ChartCard title="Cash flow & forecast" subtitle="inflow / outflow · cumulative net" ariaLabel="Cash flow">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: c.grid }} interval={1} />
          <YAxis tickFormatter={cr} tickLine={false} axisLine={false} width={52} />
          <Tooltip formatter={(v: number | string) => cr(Number(v))} />
          <Legend />
          <ReferenceLine y={0} stroke={c.muted} />
          <Bar dataKey="inflow" name="Inflow" fill={c.success} radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar dataKey="outflow" name="Outflow" fill={c.danger} radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Line type="monotone" dataKey="cumNet" name="Cumulative net" stroke={c.primary} strokeWidth={2.6} dot={false} />
          {months.length > 8 && <Brush dataKey="month" height={16} stroke={c.muted} travellerWidth={8} />}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
