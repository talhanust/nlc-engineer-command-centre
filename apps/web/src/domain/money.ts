// Money helpers. Values arrive as decimal strings (PKR). For the demo we
// parse to Number for display; production sums NUMERIC server-side (see the
// architecture doc) to keep cross-project roll-ups exact to the paisa.

export function toNum(decimalString: string): number {
  const n = Number(decimalString);
  return Number.isFinite(n) ? n : 0;
}

export function sumMoney(values: string[]): number {
  return values.reduce((acc, v) => acc + toNum(v), 0);
}

export function formatPct(value: number): string {
  return `${value.toLocaleString('en-PK', { maximumFractionDigits: 1 })}%`;
}

// ---- Currency display format (user-selectable in Settings) ----
export type MoneyFormat = 'mn' | 'bn' | 'rs';

export const MONEY_FORMATS: { value: MoneyFormat; label: string }[] = [
  { value: 'mn', label: 'Millions (Rs Mn)' },
  { value: 'bn', label: 'Billions (Rs Bn)' },
  { value: 'rs', label: 'Rupees (Rs)' },
];

const MONEY_KEY = 'nlc-ecc.moneyFormat';
let moneyCache: MoneyFormat | null = null;
const listeners = new Set<() => void>();

export function getMoneyFormat(): MoneyFormat {
  if (moneyCache) return moneyCache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MONEY_KEY) : null;
    moneyCache = (raw === 'mn' || raw === 'bn' || raw === 'rs') ? raw : 'mn';
  } catch {
    moneyCache = 'mn';
  }
  return moneyCache;
}

export function setMoneyFormat(fmt: MoneyFormat): void {
  moneyCache = fmt;
  try { localStorage.setItem(MONEY_KEY, fmt); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** Subscribe to currency-unit changes (for useSyncExternalStore). */
export function subscribeMoneyFormat(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const nf = (max: number) => ({ maximumFractionDigits: max });

/** Format PKR according to the user's selected display unit. */
export function formatMoney(value: number, fmt: MoneyFormat = getMoneyFormat()): string {
  switch (fmt) {
    case 'bn':
      return `Rs ${(value / 1e9).toLocaleString('en-PK', nf(2))} Bn`;
    case 'rs':
      return `Rs ${value.toLocaleString('en-PK', nf(0))}`;
    case 'mn':
    default:
      return `Rs ${(value / 1e6).toLocaleString('en-PK', nf(1))} Mn`;
  }
}

/** Compact money for chart axes / tooltips, respecting the selected unit. */
export function formatAxis(value: number, fmt: MoneyFormat = getMoneyFormat()): string {
  switch (fmt) {
    case 'bn':
      return `${(value / 1e9).toLocaleString('en-PK', nf(2))} Bn`;
    case 'rs':
      return Math.abs(value) >= 1e9
        ? `${(value / 1e9).toLocaleString('en-PK', nf(1))} Bn`
        : `${(value / 1e6).toLocaleString('en-PK', nf(0))} Mn`;
    case 'mn':
    default:
      return `${(value / 1e6).toLocaleString('en-PK', nf(0))} Mn`;
  }
}
