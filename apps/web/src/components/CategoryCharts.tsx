import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ChartCard, chartPalette } from './chartUtils';

const cr = (n: number) => `${(n / 1e7).toFixed(1)} Cr`;

export function DistributionDonut({ data }: { data: { name: string; value: number }[] }) {
  const c = chartPalette();
  const colors = [c.primary, c.signal, c.muted, c.amber, c.success];
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title="Distribution mix" subtitle={`${data.length} modes`} ariaLabel="Distribution mix">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {data.map((_, i) => (<Cell key={i} fill={colors[i % colors.length]} />))}
          </Pie>
          <Tooltip formatter={(v: number | string) => `${Number(v)} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryBar({
  title, data, money = false, ariaLabel,
}: { title: string; data: { name: string; value: number }[]; money?: boolean; ariaLabel?: string }) {
  const c = chartPalette();
  const fmt = (v: number | string) => (money ? cr(Number(v)) : String(v));
  return (
    <ChartCard title={title} ariaLabel={ariaLabel ?? title}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} />
          <Tooltip formatter={fmt} />
          <Bar dataKey="value" fill={c.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
