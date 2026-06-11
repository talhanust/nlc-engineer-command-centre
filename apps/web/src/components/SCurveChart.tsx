import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { MonthlySeriesPoint } from '../data/types';
import type { WeightedPoint } from '../domain/scurve';
import { ChartCard, chartPalette } from './chartUtils';

type Point = MonthlySeriesPoint | WeightedPoint;

/** Twin S-curve: planned (filled area) vs actual (solid line), interactive. */
export function SCurveChart({ points, title }: { points: Point[]; title?: string }) {
  const c = chartPalette();
  return (
    <ChartCard title={title ?? 'Progress S-curve'} subtitle="planned vs actual · cumulative %" ariaLabel={title ?? 'S-curve'}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={points} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="plannedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.signal} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.signal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: c.grid }} interval={1} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={34} unit="%" />
          <Tooltip formatter={(v: number | string) => (v == null ? '—' : `${v}%`)} />
          <Legend iconType="plainline" />
          <Area type="monotone" dataKey="planned" name="Planned" stroke={c.signal} strokeWidth={2} strokeDasharray="5 4" fill="url(#plannedFill)" />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={c.primary} strokeWidth={2.6} dot={{ r: 2.5 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
