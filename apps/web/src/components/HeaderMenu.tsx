import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A small header dropdown that closes on outside-click or Escape. Modern control
 * bars group related controls behind one labelled trigger rather than scattering a
 * dozen loose icons; these menus give the header exactly two: identity and display.
 */
export function HeaderMenu({ label, title, ariaLabel, badge, align = 'right', children }: {
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
  badge?: ReactNode;
  align?: 'right' | 'left';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="header-menu" ref={ref}>
      <button className="header-menu-trigger" title={title} aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        {label}
        {badge}
        <span className="header-menu-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className={`header-menu-panel ${align === 'left' ? 'align-left' : 'align-right'}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
