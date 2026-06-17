import { useEffect, useRef, useState } from 'react';

/**
 * A click-to-edit cell. Shows the value; click (or Enter/Space) turns it into an
 * input that commits on Enter or blur and cancels on Escape. Commit only fires
 * when the value actually changed.
 */
export function EditableCell({
  value, onCommit, type = 'text', ariaLabel, placeholder = '—', align = 'left', coords,
}: {
  value: string;
  onCommit: (next: string) => void;
  type?: 'text' | 'number';
  ariaLabel: string;
  placeholder?: string;
  align?: 'left' | 'right';
  coords?: { r: number; c: number };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setDraft(value); setTimeout(() => inputRef.current?.select(), 0); } }, [editing, value]);

  function commit() {
    setEditing(false);
    const next = type === 'number' ? draft.trim() : draft.trim();
    if (next !== value.trim()) onCommit(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editable-input"
        type={type === 'number' ? 'text' : 'text'}
        inputMode={type === 'number' ? 'numeric' : undefined}
        aria-label={ariaLabel}
        value={draft}
        style={{ textAlign: align }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`editable-cell${value.trim() ? '' : ' empty'}`}
      aria-label={ariaLabel}
      data-r={coords?.r}
      data-c={coords?.c}
      style={{ textAlign: align, width: '100%' }}
      onClick={() => setEditing(true)}
    >
      {value.trim() || placeholder}
    </button>
  );
}
