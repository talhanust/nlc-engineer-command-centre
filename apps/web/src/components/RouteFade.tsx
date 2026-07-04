import { useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';

/**
 * Subtle cross-fade between nodes/tabs. Where the View Transitions API exists
 * the browser handles a true cross-fade (driven by the `view-transition-name`
 * in CSS); everywhere else this keyed wrapper re-mounts on path change and the
 * `.route-fade` CSS animation provides a graceful fade-in fallback.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const loc = useLocation();
  // Key by node + tab so drilling down animates, but query/hash changes don't.
  const key = loc.pathname;
  return (
    <div key={key} className="route-fade" style={{ viewTransitionName: 'route' } as React.CSSProperties}>
      {children}
    </div>
  );
}
