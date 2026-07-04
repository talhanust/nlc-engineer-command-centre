/**
 * Composite project health score (req 3f(4)) — a weighted 0–100 combining:
 *   schedule (40%): actual vs planned physical progress;
 *   billing alignment (30%): billed value vs value earned by physical progress
 *     (over- OR under-billing both erode it — claim-vs-progress divergence);
 *   collection (30%): cash received vs billed.
 * Bands: ≥75 green · ≥50 amber · else red. Works from the portfolio summary
 * fields so it can score every project without loading its registers.
 */

export type HealthBand = 'green' | 'amber' | 'red';

export interface HealthScore {
  score: number;      // 0..100
  band: HealthBand;
  schedule: number;   // component scores 0..100
  billing: number;
  collection: number;
}

export interface HealthInput {
  plannedPct: number;   // 0..100
  actualPct: number;    // 0..100
  contractValue: number;
  billed: number;
  received: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function healthScore(i: HealthInput): HealthScore {
  // Schedule: each point of slippage costs 4 points (25-pt slip = 0).
  const slip = Math.max(0, i.plannedPct - i.actualPct);
  const schedule = clamp(100 - slip * 4);

  // Billing alignment: billed% of CV vs physical %. Divergence either way is
  // exposure — under-billed work is unclaimed cost, over-billing is claim risk.
  const billedPct = i.contractValue > 0 ? (i.billed / i.contractValue) * 100 : 0;
  const billingGap = Math.abs(billedPct - i.actualPct);
  const billing = clamp(100 - billingGap * 4);

  // Collection: received vs billed (100% collected = 100).
  const collection = i.billed > 0 ? clamp((i.received / i.billed) * 100) : 100;

  const score = clamp(schedule * 0.4 + billing * 0.3 + collection * 0.3);
  const band: HealthBand = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
  return { score, band, schedule, billing, collection };
}

export function healthLabel(h: HealthScore): string {
  return `${h.score} · sched ${h.schedule} / bill ${h.billing} / cash ${h.collection}`;
}
