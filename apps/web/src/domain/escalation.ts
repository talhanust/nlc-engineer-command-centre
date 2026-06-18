// Price-escalation (variation-of-price) computation. Each component carries a
// weight and a base/current index; the adjustment escalates only the variable
// portion of the contract by the weighted change in indices.

export interface EscalationComponent {
  label: string;
  weight: number; // fraction of contract (0..1) tied to this component
  baseIndex: number;
  currentIndex: number;
}

export interface EscalationLine {
  label: string;
  weight: number;
  ratio: number; // currentIndex / baseIndex
  contribution: number; // weight * (ratio - 1)
  amount: number;
}

export interface EscalationResult {
  base: number;
  fixedPortion: number; // non-escalated fraction (e.g. 0.15)
  factor: number; // total weighted escalation factor
  amount: number;
  lines: EscalationLine[];
}

/**
 * Escalation = base × Σ wᵢ·(Cᵢ/Bᵢ − 1) over the variable components.
 * `fixedPortion` is the non-adjustable share and is reported for transparency;
 * the component weights are expected to sum to (1 − fixedPortion).
 */
export function escalationAmount(
  base: number,
  fixedPortion: number,
  components: EscalationComponent[],
): EscalationResult {
  const lines: EscalationLine[] = components.map((c) => {
    const ratio = c.baseIndex === 0 ? 1 : c.currentIndex / c.baseIndex;
    const contribution = c.weight * (ratio - 1);
    return { label: c.label, weight: c.weight, ratio, contribution, amount: base * contribution };
  });
  const factor = lines.reduce((a, l) => a + l.contribution, 0);
  return { base, fixedPortion, factor, amount: base * factor, lines };
}

/** PBS index master default (FIDIC-style Pₙ). Weights — including the fixed
 *  portion — sum to 1.000; Pₙ = Σ wᵢ·(Cᵢ/Bᵢ). */
export const DEFAULT_PBS_COMPONENTS: EscalationComponent[] = [
  { label: 'Fixed (non-escalable portion)', weight: 0.15, baseIndex: 100, currentIndex: 100 },
  { label: 'Cement (PBS WPI Cement)', weight: 0.18, baseIndex: 100, currentIndex: 108.5 },
  { label: 'Steel (PBS WPI Iron & Steel)', weight: 0.22, baseIndex: 100, currentIndex: 115.2 },
  { label: 'Bitumen (PBS WPI Bitumen)', weight: 0.12, baseIndex: 100, currentIndex: 122.7 },
  { label: 'POL (PBS WPI Petroleum)', weight: 0.13, baseIndex: 100, currentIndex: 119.4 },
  { label: 'Labour (PBS WPI Wages)', weight: 0.20, baseIndex: 100, currentIndex: 112 },
];

export interface PnLine { label: string; weight: number; baseIndex: number; currentIndex: number; ratio: number; contribution: number }
export interface PnResult { pn: number; factor: number; sumWeights: number; lines: PnLine[] }

/** Price-adjustment coefficient Pₙ = Σ wᵢ·(Cᵢ/Bᵢ). EPC amount on an IPC = gross·(Pₙ − 1). */
export function pnCoefficient(components: EscalationComponent[]): PnResult {
  const lines: PnLine[] = components.map((c) => {
    const ratio = c.baseIndex === 0 ? 1 : c.currentIndex / c.baseIndex;
    return { label: c.label, weight: c.weight, baseIndex: c.baseIndex, currentIndex: c.currentIndex, ratio, contribution: c.weight * ratio };
  });
  const pn = lines.reduce((a, l) => a + l.contribution, 0);
  const sumWeights = components.reduce((a, c) => a + c.weight, 0);
  return { pn, factor: pn - 1, sumWeights, lines };
}
