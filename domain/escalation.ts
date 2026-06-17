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
