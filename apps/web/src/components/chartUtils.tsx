import { ReactNode } from 'react';

/** Resolve a CSS custom property to a concrete color (recharts needs real values). */
export function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartPalette() {
  return {
    primary: cssColor('--primary', '#15703A'),
    bright: cssColor('--primary-bright', '#1F9D54'),
    signal: cssColor('--signal', '#14739F'),
    amber: cssColor('--warning', '#B7791F'),
    danger: cssColor('--danger', '#B3261E'),
    success: cssColor('--success', '#1B8A4B'),
    muted: cssColor('--muted', '#5E6E64'),
    grid: cssColor('--chart-grid', '#E6ECE6'),
    text: cssColor('--text', '#14201A'),
    surface: cssColor('--surface', '#ffffff'),
  };
}

export function ChartCard({
  title, subtitle, ariaLabel, children,
}: { title: string; subtitle?: string; ariaLabel?: string; children: ReactNode }) {
  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </div>
      <div className="chart-body" role="img" aria-label={ariaLabel ?? title}>
        {children}
      </div>
    </div>
  );
}
