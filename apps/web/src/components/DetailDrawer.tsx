import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerTab {
  id: string;
  label: string;
  /** Optional count/badge shown next to the label (e.g. number of RARs). */
  badge?: number | string;
  content: ReactNode;
}

/**
 * A right-hand detail drawer — the professional pattern for inspecting one record
 * from a list without navigating away.
 *
 * Why a drawer, not a centred dialog: a construction contract, an IPC or a demand
 * carries far more than fits a box, and the user is usually working THROUGH a list
 * — open one, read it, close it, open the next. A full-height panel that slides in
 * over the list (still visible behind it) keeps that rhythm and gives the content
 * real vertical space. The header and tab strip stay pinned while the body
 * scrolls, so the record's identity and the way back are always in view.
 *
 * Two shapes, one component:
 *  - the original simple form (title + subtitle + children), unchanged, so the
 *    person/project drawers keep working;
 *  - a richer form (pill, header actions, a hero band of stats, tabbed sections)
 *    for dense records like a subcontract. Pass `tabs` to get the tabbed shell.
 */
export function DetailDrawer({
  open = true, title, subtitle, badge, pill, onClose, actions, hero, tabs, initialTab, width = 'wide', children,
}: {
  open?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  pill?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  hero?: ReactNode;
  tabs?: DrawerTab[];
  initialTab?: string;
  /**
   * Starting size:
   *  - 'full'   fills the window — a record workspace, no dead scrim (best for a
   *             dense record like a contract, which is a thing you work INSIDE);
   *  - 'wide'   a broad right-hand panel with the list dimmed but visible behind;
   *  - 'narrow' a slim peek for light records (a person, an org node).
   * The user can expand/collapse between full and wide from the header, so the
   * choice is theirs per moment, not fixed.
   */
  width?: 'full' | 'wide' | 'narrow';
  children?: ReactNode;
}) {
  const [active, setActive] = useState(initialTab ?? tabs?.[0]?.id);
  // A narrow (person/org) drawer stays a peek; records open full and can shrink.
  const [size, setSize] = useState<'full' | 'wide' | 'narrow'>(width);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = tabs?.find((t) => t.id === active) ?? tabs?.[0];
  const canResize = size !== 'narrow';
  const isFull = size === 'full';

  return createPortal(
    <div className={`drawer-backdrop ${isFull ? 'drawer-backdrop-full' : ''}`} onClick={onClose}>
      <aside className={`drawer drawer-${size}`} role="dialog"
        aria-label={typeof title === 'string' ? title : 'Detail'} aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-head-text">
            <div className="drawer-title-row">
              <h2 className="drawer-title">{title}</h2>
              {pill}
            </div>
            {subtitle && <p className="muted small drawer-sub">{subtitle}</p>}
          </div>
          {badge}
          {canResize && (
            <button className="drawer-resize" onClick={() => setSize(isFull ? 'wide' : 'full')}
              aria-label={isFull ? 'Collapse to side panel' : 'Expand to full window'}
              title={isFull ? 'Collapse to side panel' : 'Expand to full window'}>
              {isFull ? '⇥' : '⤢'}
            </button>
          )}
          <button className="drawer-close" onClick={onClose} aria-label="Close details">✕</button>
        </header>

        {actions && <div className="drawer-toolbar">{actions}</div>}
        {hero && <div className="drawer-hero">{hero}</div>}

        {tabs && tabs.length > 1 && (
          <div className="drawer-tabs" role="tablist" aria-label="Detail sections">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === current?.id}
                className={`drawer-tab ${t.id === current?.id ? 'active' : ''}`}
                onClick={() => setActive(t.id)}>
                {t.label}
                {t.badge !== undefined && t.badge !== '' && <span className="drawer-tab-badge">{t.badge}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="drawer-body" role={tabs ? 'tabpanel' : undefined}>
          {current ? current.content : children}
        </div>

        {actions && !hero && tabs === undefined && <footer className="drawer-actions">{actions}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

/**
 * A labelled progress meter — the read-only "slider" a project-controls user
 * expects beside a value: how much of this line has been billed, how much of the
 * contract paid. It reports state; it does not set it.
 */
export function ProgressMeter({ pct, tone = 'primary', title }: {
  pct: number; tone?: 'primary' | 'good' | 'warn' | 'danger'; title?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div className="meter" title={title ?? `${clamped.toFixed(0)}%`} role="progressbar"
      aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`meter-fill meter-${tone}`} style={{ width: `${clamped}%` }} />
      <span className="meter-label">{clamped.toFixed(0)}%</span>
    </div>
  );
}
