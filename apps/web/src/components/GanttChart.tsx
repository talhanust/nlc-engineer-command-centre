import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import type { ScheduleActivity } from '../data/types';
import { ChartCard, chartPalette } from './chartUtils';

const DAY = 86400000;

/** Horizontal Gantt: offset (transparent) + duration bar, per activity. */
export function GanttChart({ activities }: { activities: ScheduleActivity[] }) {
  const c = chartPalette();
  if (activities.length === 0) return null;
  const starts = activities.map((a) => new Date(a.plannedStart).getTime());
  const t0 = Math.min(...starts);

  const data = activities.map((a) => {
    const start = new Date(a.plannedStart).getTime();
    const finish = new Date(a.plannedFinish).getTime();
    const offset = Math.round((start - t0) / DAY);
    const duration = Math.max(a.isMilestone ? 2 : 1, Math.round((finish - start) / DAY));
    return { name: a.activityId, label: a.name, offset, duration, milestone: a.isMilestone, start: a.plannedStart, finish: a.plannedFinish };
  });

  return (
    <ChartCard title="Schedule (Gantt)" subtitle="planned activity windows" ariaLabel="Gantt chart">
      <ResponsiveContainer width="100%" height={Math.max(200, activities.length * 42 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={c.grid} horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(d) => `D${d}`} />
          <YAxis type="category" dataKey="name" width={70} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!p) return null;
              return (
                <div className="recharts-default-tooltip" style={{ padding: 8 }}>
                  <div style={{ fontWeight: 700 }}>{p.label}</div>
                  <div className="muted small">{p.start} → {p.finish}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="offset" stackId="g" fill="transparent" />
          <Bar dataKey="duration" stackId="g" radius={[3, 3, 3, 3]} maxBarSize={18}>
            {data.map((d, i) => (<Cell key={i} fill={d.milestone ? c.amber : c.primary} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
