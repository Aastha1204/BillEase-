export const MAX_NUMBER_LENGTH = 16;

/** Financial year label (April-March) for an ISO date: 2027-03-31 -> "26-27". */
export function financialYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso);
  if (!m) throw new Error(`financialYear: bad date "${iso}"`);
  const y = Number(m[1]);
  const start = Number(m[2]) >= 4 ? y : y - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(start)}-${yy(start + 1)}`;
}
/** [start, end] ISO dates of the FY containing `iso`. */
export function fyRange(iso: string): [string, string] {
  const y = Number(iso.slice(0, 4));
  const s = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return [`${s}-04-01`, `${s + 1}-03-31`];
}

export const formatInvoiceNumber = (prefix: string, fy: string, seq: number) =>
  `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;
export const formatCreditNoteNumber = (prefix: string, fy: string, seq: number) =>
  `${prefix}/CN/${fy}/${String(seq).padStart(3, '0')}`;

export interface PrefixCheck { ok: boolean; message?: string; preview: string; length: number }

/** Live validation for the Settings screen: the sample number must be <= 16 chars. */
export function checkPrefix(prefix: string, fy = '26-27'): PrefixCheck {
  const preview = formatInvoiceNumber(prefix, fy, 1);
  const length = preview.length;
  if (!/^[A-Z0-9-]+$/.test(prefix)) {
    return { ok: false, preview, length, message: 'Use capital letters, digits or hyphen only' };
  }
  if (length > MAX_NUMBER_LENGTH) {
    return { ok: false, preview, length, message: `Number would be ${length} characters; the limit is ${MAX_NUMBER_LENGTH}` };
  }
  return { ok: true, preview, length };
}
/** Credit-note series is longer (prefix/CN/FY/NNN), so it fits only for prefixes up to 3 chars. */
export const creditNoteFits = (prefix: string, fy = '26-27') =>
  formatCreditNoteNumber(prefix, fy, 1).length <= MAX_NUMBER_LENGTH;

export interface Counters { [fy: string]: number } // last issued sequence per FY

/** Pure: next consecutive number for the invoice date's FY. Returns new counters; never reuses a number. */
export function nextNumber(counters: Counters, prefix: string, iso: string) {
  const c = checkPrefix(prefix);
  if (!c.ok) throw new Error(c.message);
  const fy = financialYear(iso);
  const seq = (counters[fy] ?? 0) + 1;
  return { number: formatInvoiceNumber(prefix, fy, seq), fy, seq, counters: { ...counters, [fy]: seq } };
}
export function nextCreditNoteNumber(counters: Counters, prefix: string, iso: string) {
  const fy = financialYear(iso);
  const seq = (counters[fy] ?? 0) + 1;
  const number = formatCreditNoteNumber(prefix, fy, seq);
  if (number.length > MAX_NUMBER_LENGTH) throw new Error('Credit note number exceeds 16 characters; shorten the prefix');
  return { number, fy, seq, counters: { ...counters, [fy]: seq } };
}
