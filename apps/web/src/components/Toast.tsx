import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  /** Optional action button (e.g. Undo). */
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after ms (default 4500; 7000 when an action is present). */
  duration?: number;
}

interface Toast extends ToastInput { id: string; }

interface ToastCtx { toast: (t: ToastInput) => void; }
const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const tm = timers.current[id];
    if (tm) { clearTimeout(tm); delete timers.current[id]; }
  }, []);

  const toast = useCallback((t: ToastInput) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    const ms = t.duration ?? (t.actionLabel ? 7000 : 4500);
    timers.current[id] = setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`}>
            <span className="toast-msg">{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => { t.onAction?.(); dismiss(t.id); }}
              >{t.actionLabel}</button>
            )}
            <button className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
