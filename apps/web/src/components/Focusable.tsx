import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Wraps any panel with an "Expand" affordance that opens it full-page in an
 * overlay (Esc or ✕ to close). Uses a render-prop so the content is mounted
 * fresh in whichever location is active — this keeps stateful children like the
 * Leaflet map from being torn between two parents. `expanded` lets the child
 * adapt (e.g. a taller map, wheel-zoom on).
 */
export function Focusable({
  title, label, children,
}: { title: string; label?: string; children: (expanded: boolean) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // lock background scroll
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <div className="focusable">
      <button
        className="focus-btn no-print"
        onClick={() => setExpanded(true)}
        aria-label={label ?? `Expand ${title} to full screen`}
        title="Full screen"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>

      {!expanded && children(false)}

      {expanded && createPortal(
        <div className="focus-overlay" role="dialog" aria-modal="true" aria-label={`${title} — full screen`}>
          <div className="focus-head">
            <span className="focus-title">{title}</span>
            <button ref={closeRef} className="btn-ghost" onClick={() => setExpanded(false)} aria-label="Close full screen">
              ✕ Close
            </button>
          </div>
          <div className="focus-body">{children(true)}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
