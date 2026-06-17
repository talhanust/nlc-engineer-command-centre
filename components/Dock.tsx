import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface DockItem { id: string; title: string; render: () => ReactNode; }
interface DockCtx {
  docked: DockItem | null;
  dock: (item: DockItem) => void;
  undock: (id?: string) => void;
}

const NOOP: DockCtx = { docked: null, dock: () => {}, undock: () => {} };
const Ctx = createContext<DockCtx>(NOOP);

export function DockProvider({ children }: { children: ReactNode }) {
  const [docked, setDocked] = useState<DockItem | null>(null);
  const loc = useLocation();
  // A docked snapshot belongs to the view it was pinned from; clear on nav.
  useEffect(() => { setDocked(null); }, [loc.pathname]);
  const ctx: DockCtx = {
    docked,
    dock: (item) => setDocked(item),
    undock: (id) => setDocked((d) => (!id || d?.id === id ? null : d)),
  };
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Tolerant: returns a no-op when no provider is mounted (e.g. isolated tests). */
export function useDock(): DockCtx {
  return useContext(Ctx);
}

const DockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" />
  </svg>
);

/**
 * Wraps a panel with a "Dock" affordance that pins it to the right-hand rail so
 * it stays visible while the rest of the page scrolls. One item at a time.
 * Content is a snapshot taken when docked; navigation clears the dock.
 */
export function Dockable({
  title, enabled = true, children,
}: { title: string; enabled?: boolean; children: (docked: boolean) => ReactNode }) {
  const id = useId();
  const { docked, dock, undock } = useDock();
  const isDocked = docked?.id === id;

  if (!enabled) return <>{children(false)}</>;

  function toggle() {
    if (isDocked) undock(id);
    else dock({ id, title, render: () => children(true) });
  }

  return (
    <div className="dockable">
      <button
        className="dock-btn no-print"
        onClick={toggle}
        aria-label={isDocked ? `Undock ${title}` : `Dock ${title} to side`}
        title={isDocked ? 'Undock' : 'Pin to side'}
      >
        <DockIcon />
      </button>
      {isDocked ? (
        <div className="dock-stub muted small" role="note">Pinned to the dock&nbsp;→</div>
      ) : (
        children(false)
      )}
    </div>
  );
}

/** The right-hand rail that renders the currently docked panel. */
export function DockRail() {
  const { docked, undock } = useDock();
  if (!docked) return null;
  return (
    <aside className="dock-rail no-print" aria-label="Docked panel">
      <div className="dock-rail-head">
        <span className="chart-title">{docked.title}</span>
        <button className="btn-ghost" onClick={() => undock()} aria-label="Undock panel">✕</button>
      </div>
      <div className="dock-rail-body">{docked.render()}</div>
    </aside>
  );
}
