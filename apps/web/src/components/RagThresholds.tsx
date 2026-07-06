import { useUiState } from '../state/UiState';

// Adjustable health thresholds (slippage = actual% − planned%). Changing these
// live-recolours every RAG badge and the exceptions feed, since all of them
// recompute from this shared state on render.
export function RagThresholds() {
  const { rag, setRag } = useUiState();
  return (
    <details className="rag-thresholds">
      <summary>Health thresholds</summary>
      <div className="rag-thresholds-body">
        <label>
          At risk below (slippage %): <strong>{rag.amberAt}</strong>
          <input
            type="range"
            min={-20}
            max={0}
            value={rag.amberAt}
            aria-label="Amber threshold"
            onChange={(e) => {
              const amberAt = Number(e.target.value);
              setRag({ amberAt, redAt: Math.min(rag.redAt, amberAt) });
            }}
          />
        </label>
        <label>
          Behind below (slippage %): <strong>{rag.redAt}</strong>
          <input
            type="range"
            min={-30}
            max={0}
            value={rag.redAt}
            aria-label="Red threshold"
            onChange={(e) => {
              const redAt = Number(e.target.value);
              setRag({ redAt, amberAt: Math.max(rag.amberAt, redAt) });
            }}
          />
        </label>
      </div>
    </details>
  );
}
