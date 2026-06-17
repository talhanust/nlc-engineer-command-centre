import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { makeDataProvider, initDataBackend } from './ApiDataProvider';
import type { DataProvider, OrgNode, Project } from './types';

interface DataState {
  provider: DataProvider;
  nodes: OrgNode[];
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const provider = makeDataProvider();
const Ctx = createContext<DataState | null>(null);

export function DataContextProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    await initDataBackend();
    const [n, p] = await Promise.all([provider.listNodes(), provider.listProjects()]);
    setNodes(n);
    setProjects(p);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    void load().then(() => { if (!alive) { /* unmounted */ } });
    return () => { alive = false; };
  }, []);

  return <Ctx.Provider value={{ provider, nodes, projects, loading, refresh: load }}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used within DataContextProvider');
  return v;
}
