import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';

/** Ctrl/Cmd-K command palette: fuzzy jump to any node or project. */
export function CommandPalette() {
  const { nodes } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpenEvent() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('nlc:command-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('nlc:command-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = nodes.filter((n) => n.type !== 'hq');
    const matched = needle ? base.filter((n) => n.name.toLowerCase().includes(needle)) : base;
    return matched.slice(0, 8);
  }, [nodes, q]);

  if (!open) return null;

  function go(i: number) {
    const n = results[i];
    if (!n) return;
    navigate(`/node/${n.id}`);
    setOpen(false);
  }

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)} role="dialog" aria-label="Command palette" aria-modal="true">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          aria-label="Command palette search"
          placeholder="Jump to a node or project…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(active); }
          }}
        />
        <ul className="palette-list">
          {results.length === 0 ? (
            <li className="palette-empty muted">No matches</li>
          ) : (
            results.map((n, i) => (
              <li
                key={n.id}
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
              >
                <span className={`dot type-${n.type}`} aria-hidden /> {n.name}
                <span className="muted small palette-type">{n.type === 'project' ? 'Project' : 'Node'}</span>
              </li>
            ))
          )}
        </ul>
        <div className="palette-hint muted small">↑↓ to navigate · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
