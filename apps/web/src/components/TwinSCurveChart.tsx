import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartCard, cssColor } from './chartUtils';

export function TwinSCurveChart({ data }: { data: Array<{ month: string; physical: number | null; financial: number }> }) {
  const c = { primary: cssColor('--primary', '#e87722'), info: cssColor('--info', '#1e3a5f'), grid: cssColor('--chart-grid', '#e8e8de'), muted: cssColor('--muted', '#6b6b5e') };
  return (
    <ChartCard focusable title="Twin S-curve — physical vs financial" subtitle="Actual progress % vs cumulative billed % of contract" ariaLabel="Twin S-curve">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.muted }} />
          <YAxis tick={{ fontSize: 11, fill: c.muted }} domain={[0, 100]} unit="%" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="physical" name="Physical actual" stroke={c.primary} strokeWidth={2.6} dot={{ r: 2.4 }} connectNulls={false} />
          <Line type="monotone" dataKey="financial" name="Financial billed" stroke={c.info} strokeWidth={2.2} strokeDasharray="5 3" dot={{ r: 2.2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
