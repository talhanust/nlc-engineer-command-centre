// Detailed IPC deductions. Demo defaults; production reads these from
// commercial_settings per project. Rates reflect common Pakistani public-works
// practice (retention, income-tax WHT under s.153, sales-tax WHT).

export interface DeductionSettings {
  retentionPct: number;
  incomeTaxFilerPct: number;
  incomeTaxNonFilerPct: number;
  salesTaxWhtPct: number;
  filer: boolean;
}

export const DEFAULT_DEDUCTION_SETTINGS: DeductionSettings = {
  retentionPct: 10,
  incomeTaxFilerPct: 3,
  incomeTaxNonFilerPct: 7,
  salesTaxWhtPct: 1,
  filer: true,
};

export interface DeductionLine {
  label: string;
  pct: number; // percent of gross (0 for fixed-amount lines)
  amount: number;
}

export interface DeductionResult {
  gross: number;
  lines: DeductionLine[];
  totalDeductions: number;
  net: number;
}

/**
 * Full deduction waterfall for an IPC: retention, income-tax WHT (filer vs
 * non-filer band), sales-tax WHT, plus any mobilization/secured-advance
 * recovery applied this certificate.
 */
export function computeDeductions(
  gross: number,
  advanceRecovery: number = 0,
  s: DeductionSettings = DEFAULT_DEDUCTION_SETTINGS,
): DeductionResult {
  const incomeTaxPct = s.filer ? s.incomeTaxFilerPct : s.incomeTaxNonFilerPct;
  const lines: DeductionLine[] = [
    { label: 'Retention', pct: s.retentionPct, amount: (gross * s.retentionPct) / 100 },
    { label: `Income-tax WHT (${s.filer ? 'filer' : 'non-filer'})`, pct: incomeTaxPct, amount: (gross * incomeTaxPct) / 100 },
    { label: 'Sales-tax WHT', pct: s.salesTaxWhtPct, amount: (gross * s.salesTaxWhtPct) / 100 },
  ];
  if (advanceRecovery > 0) {
    lines.push({ label: 'Advance recovery', pct: 0, amount: advanceRecovery });
  }
  const totalDeductions = lines.reduce((a, l) => a + l.amount, 0);
  return { gross, lines, totalDeductions, net: gross - totalDeductions };
}
