import { toDecimalString, type Paise } from './money';

export interface UpiParams { vpa: string; payeeName: string; amount: Paise; note: string }

/** upi://pay link. Every parameter is URL-encoded; amount is the balance due. */
export function buildUpiUri(p: UpiParams): string {
  const e = encodeURIComponent;
  return `upi://pay?pa=${e(p.vpa)}&pn=${e(p.payeeName)}&am=${toDecimalString(p.amount)}&cu=INR&tn=${e(p.note)}`;
}
