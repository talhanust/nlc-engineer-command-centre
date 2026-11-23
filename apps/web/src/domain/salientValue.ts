// Typing a salient's value so the fact sheet reads like data, not strings.
//
// A salient is stored as a free-text label/value pair — deliberately, so a PM can
// record anything. But a value that IS a date, a money figure or a percentage
// should render as one (right-aligned money, a small bar for a percent), and a
// stale figure should be visibly stale. Inferring the type from the value and
// label keeps that behaviour without forcing a schema onto every fact.

export type SalientType = 'date' | 'money' | 'percent' | 'text';

export interface TypedSalient {
  type: SalientType;
  /** The display string (formatted), e.g. "Rs 2,518.7 Mn", "20 Aug 2026", "62%". */
  display: string;
  /** For percent: 0–100, so the UI can draw a bar. */
  pct?: number;
}

const MONEY_RE = /^(rs|pkr|₨|\$)?\s?[\d,]+(\.\d+)?\s?(mn|bn|m|b|k|million|billion)?$/i;
const PERCENT_RE = /^(\d{1,3}(\.\d+)?)\s?%$/;

/** Classify + format a salient value. Label is a hint (e.g. "Completion" → date). */
export function typeSalient(label: string, value: string): TypedSalient {
  const v = value.trim();
  const l = label.trim().toLowerCase();

  // Percent — explicit "%".
  const pm = v.match(PERCENT_RE);
  if (pm) {
    const pct = Math.max(0, Math.min(100, parseFloat(pm[1])));
    return { type: 'percent', display: v, pct };
  }

  // Date — a label that implies a date, or a value that parses as one. We keep the
  // user's own text as the display (dates in a BOQ are written many ways); the type
  // just drives the icon/alignment.
  const looksDateLabel = /\b(date|completion|commenc|mobilis|mobiliz|start|finish|eot|handover|dlp)\b/.test(l);
  if (looksDateLabel || isDateish(v)) {
    return { type: 'date', display: v };
  }

  // Money — a currency token, or a money-ish label with a numeric value.
  const looksMoneyLabel = /\b(value|cost|amount|budget|price|contract|revenue|retention|advance)\b/.test(l);
  if (MONEY_RE.test(v) && (/[a-z₨$]/i.test(v) || looksMoneyLabel)) {
    return { type: 'money', display: v };
  }

  return { type: 'text', display: v };
}

function isDateish(v: string): boolean {
  if (!/\d/.test(v)) return false;
  // Accept "Aug 2026", "20 Aug 2026", "2026-08-20", "20/08/2026" and similar.
  if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(v)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4}\b/i.test(v)) return true;
  return false;
}

/**
 * A short, quiet "updated …" string from an ISO timestamp — relative for recent
 * saves, an absolute date once it is old enough that "42 days ago" stops helping.
 */
export function relativeUpdated(iso: string | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const secs = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  // Older than a month: show the date itself.
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
