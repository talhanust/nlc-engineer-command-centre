import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { HrAvatar } from './HrAvatar';
import type { HrPerson, OrgNode } from '../data/types';

type Hit =
  | { kind: 'node'; id: string; name: string; type: OrgNode['type']; sub: string }
  | { kind: 'person'; id: string; name: string; sub: string; nodeId: string; person: HrPerson };

/** Ctrl/Cmd-K command palette: fuzzy jump to any node, project, or person. */
export function CommandPalette() {
  const { nodes, provider } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<HrPerson[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    }
    function onOpenEvent() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('nlc:command-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('nlc:command-palette', onOpenEvent);
    };
  }, []);

  // Lazily load all people the first time the palette opens.
  useEffect(() => {
    if (open && people === null) {
      void provider.listAllPeople().then(setPeople).catch(() => setPeople([]));
    }
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open, people, provider]);

  const nodeName = useMemo(() => new Map(nodes.map((n) => [n.id, n.name])), [nodes]);

  const results = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const nodeHits: Hit[] = nodes
      .filter((n) => (needle ? n.name.toLowerCase().includes(needle) : n.type !== 'hq'))
      .map((n) => ({ kind: 'node', id: n.id, name: n.name, type: n.type, sub: n.type === 'project' ? 'Project' : n.type === 'pd_hq' ? 'PD HQ' : 'Node' }));

    let personHits: Hit[] = [];
    if (needle && people) {
      personHits = people
        .filter((p) => p.name.toLowerCase().includes(needle) || (p.rank ?? '').toLowerCase().includes(needle))
        .map((p) => ({ kind: 'person', id: p.id, name: p.name, nodeId: p.nodeId, person: p, sub: `${p.rank ? p.rank + ' · ' : ''}${nodeName.get(p.nodeId) ?? 'Unit'}` }));
    }
    // Nodes first, then people; capped.
    return [...nodeHits.slice(0, 7), ...personHits.slice(0, 7)].slice(0, 10);
  }, [nodes, q, people, nodeName]);

  if (!open) return null;

  function go(i: number) {
    const h = results[i];
    if (!h) return;
    navigate(h.kind === 'person' ? `/node/${h.nodeId}/hr` : `/node/${h.id}`);
    setOpen(false);
  }

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)} role="dialog" aria-label="Command palette" aria-modal="true">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          aria-label="Command palette search"
          placeholder="Jump to a node, project, or person…"
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
            <li className="palette-empty muted">{q.trim() && people === null ? 'Searching…' : 'No matches'}</li>
          ) : (
            results.map((h, i) => (
              <li
                key={`${h.kind}-${h.id}`}
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
              >
                {h.kind === 'person'
                  ? <HrAvatar person={h.person} size={20} />
                  : <span className={`dot type-${h.type}`} aria-hidden />}
                <span className="palette-name">{h.name}</span>
                <span className="muted small palette-type">{h.sub}</span>
              </li>
            ))
          )}
        </ul>
        <div className="palette-hint muted small">↑↓ to navigate · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
