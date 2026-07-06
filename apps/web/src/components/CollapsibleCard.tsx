import { type ReactNode } from 'react';
import { usePersistentBool } from './usePersistentBool';
import { Focusable } from './Focusable';
import { Dockable } from './Dock';

/**
 * A `.card` whose body collapses to just its header (accordion). Optionally
 * exposes Expand (full-page) and Dock affordances. Collapse state persists when
 * an `id` is given. When focusable/dockable, the content is provided so it can
 * be re-mounted in the overlay/dock.
 */
export function CollapsibleCard({
  id, title, actions, focusable, dockable, defaultCollapsed = false, children,
}: {
  id?: string;
  title: string;
  actions?: ReactNode;
  focusable?: boolean;
  dockable?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = usePersistentBool(id ? `collapse.${id}` : undefined, defaultCollapsed);

  const head = (
    <div className="card-head">
      <button
        className="card-collapse"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <svg className={`caret${collapsed ? ' collapsed' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <h3>{title}</h3>
      </button>
      <div className="card-head-actions no-print">{actions}</div>
    </div>
  );

  const inner = (big = false) => (
    <div className="card">
      {head}
      {(!collapsed || big) && <div className="card-body">{children}</div>}
    </div>
  );

  if (focusable || dockable) {
    return (
      <Dockable title={title} enabled={!!dockable}>
        {() => (
          <Focusable title={title}>
            {(big) => inner(big)}
          </Focusable>
        )}
      </Dockable>
    );
  }
  return inner();
}
