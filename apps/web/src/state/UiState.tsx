import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { DEFAULT_RAG } from '../domain/rollup';
import type { Rag } from '../domain/rollup';

export interface RagThresholds {
  amberAt: number;
  redAt: number;
}
export interface Filter {
  search: string;
  client: string; // 'all' or a client name
  rag: Rag | 'all';
}

export const EMPTY_FILTER: Filter = { search: '', client: 'all', rag: 'all' };

interface UiState {
  rag: RagThresholds;
  setRag: (r: RagThresholds) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  filterActive: boolean;
}

const RAG_KEY = 'nlc-ecc.ragThresholds';
const Ctx = createContext<UiState | null>(null);

function loadRag(): RagThresholds {
  try {
    const raw = localStorage.getItem(RAG_KEY);
    if (raw) return JSON.parse(raw) as RagThresholds;
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_RAG };
}

export function UiStateProvider({ children }: { children: ReactNode }) {
  const [rag, setRagState] = useState<RagThresholds>(loadRag);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);

  useEffect(() => {
    try {
      localStorage.setItem(RAG_KEY, JSON.stringify(rag));
    } catch {
      /* ignore */
    }
  }, [rag]);

  const filterActive =
    filter.search.trim() !== '' || filter.client !== 'all' || filter.rag !== 'all';

  return (
    <Ctx.Provider value={{ rag, setRag: setRagState, filter, setFilter, filterActive }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUiState(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUiState must be used within UiStateProvider');
  return v;
}
