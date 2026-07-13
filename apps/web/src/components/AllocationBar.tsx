import type { BoqItem, BoqWbsLink } from '../data/types';
import { itemAllocation, effectiveWeight } from '../domain/mapping';

// Only variables that actually exist in theme.css — a missing var renders an
// invisible segment, which silently understates how much of an item is mapped.
const SEGMENT_COLORS = ['var(--primary)', 'var(--info)', 'var(--warning)', 'var(--rag-green)'];

/**
 * A BOQ item as a stacked bar of its activity allocations, with whatever is not
 * yet allocated shown in grey. Scanning a column of these finds the unmapped
 * value in a second; scanning the rows themselves takes minutes.
 *
 * Over-allocation is drawn as a full red bar rather than a segment overflowing
 * the track — a bar that runs past its own end reads as a rendering bug, not as
 * the accounting error it is.
 */
export function AllocationBar({ item, links }: { item: BoqItem; links: BoqWbsLink[] }) {
  const alloc = itemAllocation(item, links);

  if (links.length === 0) {
    return <div className="alloc-track" title="Not mapped to any activity" aria-label={`${item.code} unmapped`}>
      <div className="alloc-seg alloc-unmapped" style={{ width: '100%' }} />
    </div>;
  }
  if (alloc.overAllocated) {
    const over = alloc.allocatedQty - item.qty;
    return <div className="alloc-track" aria-label={`${item.code} over-allocated`}
      title={`Over-allocated by ${over.toLocaleString('en-PK')} ${item.unit}`}>
      <div className="alloc-seg alloc-over" style={{ width: '100%' }} />
    </div>;
  }

  const segments = links.map((l, i) => ({
    activityId: l.activityId,
    pct: effectiveWeight(l, links, item) * 100,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }));
  const allocatedPct = segments.reduce((s, x) => s + x.pct, 0);
  const remainingPct = Math.max(0, 100 - allocatedPct);

  const label = alloc.usesQty
    ? `${alloc.allocatedQty.toLocaleString('en-PK')} of ${item.qty.toLocaleString('en-PK')} ${item.unit} allocated`
    : `${segments.length} activity(ies), split by weight`;

  return (
    <div className="alloc-track" aria-label={`${item.code} allocation`} title={`${label}\n${segments.map((s) => `${s.activityId}: ${Math.round(s.pct)}%`).join('\n')}`}>
      {segments.map((s) => (
        <div key={s.activityId} className="alloc-seg" style={{ width: `${s.pct}%`, background: s.color }} />
      ))}
      {remainingPct > 0.5 && <div className="alloc-seg alloc-remaining" style={{ width: `${remainingPct}%` }} />}
    </div>
  );
}
