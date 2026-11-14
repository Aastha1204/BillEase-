import type { Business } from './entities';
import { validateGstin } from './gstin';
import { checkPrefix, creditNoteFits, MAX_NUMBER_LENGTH } from './numbering';

/** UPI VPA: handle@provider, e.g. shreesai@demo. */
export function validateUpiId(v: string): string | null {
  const s = v.trim();
  if (!s) return 'Enter a UPI ID like name@bank';
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(s)) return 'UPI ID must look like name@bank (letters, digits, . _ -)';
  return null;
}

export const MAX_IMAGE_BYTES = 300_000;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

export function validateImageFile(f: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(f.type)) return 'Use a PNG, JPG or SVG image';
  if (f.size > MAX_IMAGE_BYTES) return `Image must be under ${Math.round(MAX_IMAGE_BYTES / 1000)} KB`;
  return null;
}

/** SVG text -> the data URI form the app and the PDF engine expect. */
export const svgTextToDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export interface ProfileFields {
  tradeName: string; legalName: string; address: string; city: string; pincode: string; gstin: string; phone: string; email: string;
  seriesPrefix: string; bankName: string; bankAccountMasked: string; ifsc: string; upiId: string; signatoryName: string;
  /** Trade-format extras (optional). `termsText` is one term per line. */
  cin?: string; bankBranch?: string; jurisdiction?: string; declaration?: string; termsText?: string; eInvoice?: boolean;
}

/** Field-level errors for the business profile; an empty object means it can be saved. */
export function validateProfile(p: ProfileFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (!p.tradeName.trim()) e.tradeName = 'Trade name is required';
  if (!p.legalName.trim()) e.legalName = 'Legal name is required';
  if (!p.address.trim()) e.address = 'Address is required';
  if (!/^\d{6}$/.test(p.pincode.trim())) e.pincode = 'PIN code is 6 digits';
  if (!validateGstin(p.gstin).valid) e.gstin = 'Enter a valid GSTIN (format and checksum)';
  if (p.phone.trim() && !/^(\+91[\s-]?)?[0-9][0-9\s-]{8,13}$/.test(p.phone.trim())) e.phone = 'Enter a valid phone number';
  if (p.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) e.email = 'Enter a valid email';
  const pre = checkPrefix(p.seriesPrefix.trim());
  if (!pre.ok) e.seriesPrefix = pre.message ?? 'Invalid prefix';
  if (p.ifsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.ifsc.trim())) e.ifsc = 'IFSC is 11 characters, e.g. DEMO0001234';
  const upi = validateUpiId(p.upiId);
  if (upi) e.upiId = upi;
  if (!p.signatoryName.trim()) e.signatoryName = 'Signatory name is needed for the signature line (Rule 46)';
  return e;
}

export interface SeriesPreview { invoice: string; invoiceLen: number; invoiceOk: boolean; creditNote: string; creditNoteOk: boolean; message?: string }
/** Live preview under the series prefix field: "SSE/26-27/0001 · 14/16 characters". */
export function seriesPreview(prefix: string, fy = '26-27'): SeriesPreview {
  const p = checkPrefix(prefix, fy);
  const cn = `${prefix}/CN/${fy}/001`;
  return { invoice: p.preview, invoiceLen: p.length, invoiceOk: p.ok, creditNote: cn, creditNoteOk: creditNoteFits(prefix, fy), message: p.message };
}
export { MAX_NUMBER_LENGTH };

export function applyProfile(b: Business, p: ProfileFields): Business {
  const { termsText, ...rest } = p;
  const terms = (termsText ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    ...b, ...rest,
    cin: p.cin?.trim() || undefined, bankBranch: p.bankBranch?.trim() || undefined, jurisdiction: p.jurisdiction?.trim() || undefined, declaration: p.declaration?.trim() || undefined,
    termsAndConditions: terms.length ? terms : undefined, // empty = use the built-in default terms
    eInvoice: !!p.eInvoice,
    tradeName: p.tradeName.trim(), legalName: p.legalName.trim(), gstin: validateGstin(p.gstin).normalized,
    stateCode: validateGstin(p.gstin).stateCode ?? b.stateCode, seriesPrefix: p.seriesPrefix.trim(), upiId: p.upiId.trim(), ifsc: p.ifsc.trim(),
  };
}
