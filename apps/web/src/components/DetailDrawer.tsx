import { useEffect } from 'react';

/** A right-hand slide-in panel for inspecting an entity without navigating away. */
export function DetailDrawer({
  open, title, subtitle, badge, onClose, actions, children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-head-text">
            <h2 className="drawer-title">{title}</h2>
            {subtitle && <p className="muted small drawer-sub">{subtitle}</p>}
          </div>
          {badge}
          <button className="drawer-close" onClick={onClose} aria-label="Close details">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
        {actions && <footer className="drawer-actions">{actions}</footer>}
      </aside>
    </div>
  );
}
