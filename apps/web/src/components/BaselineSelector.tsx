import type { ScheduleBaseline } from '../data/types';
import { baselineLabel } from '../domain/baselines';

export { baselineLabel };

/**
 * Choose which frozen programme variance is measured against. A delay claim is
 * argued against the ORIGINAL contract baseline; day-to-day slip is usually read
 * against the latest approved revision — so both must be one click apart.
 */
export function BaselineSelector({
  baselines, selectedId, onSelect,
}: { baselines: ScheduleBaseline[]; selectedId: string; onSelect: (id: string) => void }) {
  if (baselines.length <= 1) return null;
  return (
    <label className="small muted">
      Compare against{' '}
      <select aria-label="Compare against baseline" value={selectedId} onChange={(e) => onSelect(e.target.value)}>
        {baselines.map((b) => (
          <option key={b.id} value={b.id}>{baselineLabel(b)}</option>
        ))}
      </select>
    </label>
  );
}
