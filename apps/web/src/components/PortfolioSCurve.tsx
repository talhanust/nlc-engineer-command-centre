import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { descendantProjectIds } from '../domain/org';
import { toNum } from '../domain/money';
import { weightedPortfolioCurve, type WeightedPoint } from '../domain/scurve';
import { SCurveChart } from './SCurveChart';
import type { Project } from '../data/types';

/** #16 — contract-value-weighted aggregate S-curve across a node's projects. */
export function PortfolioSCurve({ nodeId, projects }: { nodeId: string; projects: Project[] }) {
  const { provider, nodes } = useData();
  const [curve, setCurve] = useState<WeightedPoint[]>([]);

  useEffect(() => {
    let alive = true;
    const ids = new Set(descendantProjectIds(nodes, nodeId));
    const inScope = projects.filter((p) => ids.has(p.id));
    Promise.all(
      inScope.map(async (p) => ({
        weight: toNum(p.contractValue),
        points: await provider.listMonthlySeries(p.id),
      })),
    ).then((series) => {
      if (alive) setCurve(weightedPortfolioCurve(series));
    });
    return () => {
      alive = false;
    };
  }, [provider, nodes, nodeId, projects]);

  if (curve.length === 0) return null;
  return <SCurveChart points={curve} title="Portfolio S-curve (contract-value weighted)" />;
}
