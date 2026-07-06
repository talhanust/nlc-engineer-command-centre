import type { HrPerson } from '../data/types';
import { initials, hueFor, STATUS_LABEL } from '../domain/roster';

export function HrAvatar({ person, size = 38 }: { person: { name: string; photoUrl?: string }; size?: number }) {
  const hue = hueFor(person.name);
  if (person.photoUrl) {
    return <img className="hr-avatar" src={person.photoUrl} alt="" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <span
      className="hr-avatar hr-avatar-initials"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 42%)`, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(person.name)}
    </span>
  );
}

export function PersonCard({
  person, onEdit, onRemove, onOpen, selected, onToggleSelect,
}: { person: HrPerson; onEdit?: () => void; onRemove?: () => void; onOpen?: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  return (
    <div className={`person-card status-person-${person.status}${selected ? ' selected' : ''}`}>
      {onToggleSelect && (
        <input type="checkbox" className="person-select no-print" checked={!!selected} onChange={onToggleSelect} aria-label={`Select ${person.name}`} />
      )}
      <HrAvatar person={person} size={40} />
      <div className="person-main">
        {onOpen
          ? <button className="person-name person-name-btn" onClick={onOpen} aria-label={`Open ${person.name}`}>{person.name}</button>
          : <div className="person-name">{person.name}</div>}
        <div className="person-sub muted small">{person.rank ?? '—'}{person.category ? ` · ${person.category}` : ''}</div>
        <div className="person-meta">
          <span className={`person-status st-${person.status}`}>{STATUS_LABEL[person.status]}</span>
          {person.postingDate && <span className="muted small">since {person.postingDate}</span>}
        </div>
      </div>
      <div className="person-actions no-print">
        {onEdit && <button className="icon-mini" onClick={onEdit} aria-label={`Edit ${person.name}`}>✎</button>}
        {onRemove && <button className="icon-mini" onClick={onRemove} aria-label={`Remove ${person.name}`}>✕</button>}
      </div>
    </div>
  );
}

export function EmptySeat({ label, onFill }: { label: string; onFill?: () => void }) {
  return (
    <button className="empty-seat no-print" onClick={onFill} aria-label={`Vacant seat — ${label}`}>
      <span className="empty-seat-ring">+</span>
      <span className="empty-seat-label muted small">Vacant · {label}</span>
    </button>
  );
}
