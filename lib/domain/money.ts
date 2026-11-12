// Integer-paise money helpers. NEVER use floats for money. Pure TS, no browser APIs.
export type Paise = number;

/** Integer division n/d rounded half-up (ties away from zero). Exact for |2n| < 2^53. */
export function divRound(n: number, d: number): number {
  if (d === 0) throw new Error('divRound: division by zero');
  const neg = n < 0 !== d < 0;
  const a = Math.abs(n);
  const b = Math.abs(d);
  const q = Math.floor((2 * a + b) / (2 * b));
  return neg && q !== 0 ? -q : q;
}

/** Parse a rupee amount ("1,25,000.50", 1250.5) into integer paise. Throws on garbage. */
export function toPaise(input: string | number): Paise {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('toPaise: not finite');
    return Math.round(input * 100 + (input < 0 ? -1e-9 : 1e-9));
  }
  const s = input.replace(/[₹,\s]/g, '');
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`toPaise: invalid amount "${input}"`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -paise : paise;
}

/** Round paise to the nearest rupee (half-up), returned in paise. */
export function roundToRupee(p: Paise): Paise {
  return divRound(p, 100) * 100;
}

const groupFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** en-IN grouped amount, e.g. 12500000 -> "1,25,000.00"; symbol adds the rupee sign. */
export function formatINR(p: Paise, opts: { symbol?: boolean } = {}): string {
  const { symbol = true } = opts;
  const neg = p < 0;
  const a = Math.abs(p);
  const body = `${groupFmt.format(Math.floor(a / 100))}.${String(a % 100).padStart(2, '0')}`;
  return `${neg ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}

/** Plain decimal string with 2 places, no grouping: 4186800 -> "41868.00". */
export function toDecimalString(p: Paise): string {
  const neg = p < 0;
  const a = Math.abs(p);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** ISO yyyy-mm-dd -> DD-MMM-YYYY (12-Nov-2026). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1]}`;
}
