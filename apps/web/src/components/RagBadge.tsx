import type { Rag } from '../domain/rollup';

const LABEL: Record<Rag, string> = { green: 'On track', amber: 'At risk', red: 'Behind' };

export function RagBadge({ rag }: { rag: Rag }) {
  return (
    <span className={`rag rag-${rag}`} aria-label={`Health: ${LABEL[rag]}`}>
      {LABEL[rag]}
    </span>
  );
}
