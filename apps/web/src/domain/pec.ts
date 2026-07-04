// Pakistan Engineering Council (PEC) contractor categories and indicative
// financial limits (PKR). The spec does not fix the table, so these are
// configurable defaults reflecting common PEC bid-capacity tiers.

export interface PecCategory {
  code: string;
  /** Max single-contract value in PKR; null = no limit. */
  limit: number | null;
}

export const PEC_CATEGORIES: PecCategory[] = [
  { code: 'C-A', limit: null },
  { code: 'C-B', limit: 4_000_000_000 },
  { code: 'C-1', limit: 2_000_000_000 },
  { code: 'C-2', limit: 1_000_000_000 },
  { code: 'C-3', limit: 500_000_000 },
  { code: 'C-4', limit: 200_000_000 },
  { code: 'C-5', limit: 65_000_000 },
  { code: 'C-6', limit: 25_000_000 },
];

export const PEC_CODES = PEC_CATEGORIES.map((c) => c.code);

export function pecLimit(code: string | undefined): number | null | undefined {
  if (!code) return undefined; // unknown / not set
  const cat = PEC_CATEGORIES.find((c) => c.code === code);
  return cat ? cat.limit : undefined;
}

/**
 * Can a contractor with this PEC category be awarded a contract of `value`?
 * Unknown category → not eligible (must set a category first).
 */
export function canAwardByPec(code: string | undefined, value: number): boolean {
  const limit = pecLimit(code);
  if (limit === undefined) return false;
  return limit === null || value <= limit;
}

export function pecLimitLabel(code: string | undefined): string {
  const limit = pecLimit(code);
  if (limit === undefined) return 'category not set';
  if (limit === null) return 'no limit';
  return `≤ ${(limit / 1_000_000).toLocaleString()} Mn`;
}
