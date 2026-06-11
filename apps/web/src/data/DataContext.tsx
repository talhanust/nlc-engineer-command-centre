import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { makeDataProvider } from './ApiDataProvider';
import type { DataProvider, OrgNode, Project } from './types';

interface DataState {
  provider: DataProvider;
  nodes: OrgNode[];
  projects: Project[];
  loading: boolean;
}

const provider = makeDataProvider();
const Ctx = createContext<DataState | null>(null);

export function DataContextProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([provider.listNodes(), provider.listProjects()]).then(([n, p]) => {
      if (!alive) return;
      setNodes(n);
      setProjects(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={{ provider, nodes, projects, loading }}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used within DataContextProvider');
  return v;
}
