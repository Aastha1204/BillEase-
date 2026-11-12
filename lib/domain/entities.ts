import type { Paise } from './money';

/** Per-language overrides; anything not set falls back to the built-in default. */
export interface MessageTemplates {
  invoice?: Partial<Record<'en' | 'hi', string>>;
  reminder?: Partial<Record<'pre2' | 'due' | 'late3' | 'late7', Partial<Record<'en' | 'hi', string>>>>;
}

export interface Business {
  id: string;
  tradeName: string;
  legalName: string;
  constitution: string;
  kind?: string; // e.g. "Trader", "Interior designer (services)"
  address: string;
  city: string;
  stateCode: string;
  pincode: string;
  gstin: string;
  phone: string;
  email: string;
  seriesPrefix: string;
  bankName: string;
  bankAccountMasked: string;
  ifsc: string;
  upiId: string;
  signatoryName: string;
  logoSvg: string; // data URI
  signatureSvg: string; // data URI
  settings: {
    roundOff: boolean;
    b2cBasis: 'grand' | 'taxable';
    b2cThreshold: Paise;
    b2clThreshold: Paise;
    defaultTermsDays: number;
    demoQrWatermark: boolean;
    pdfTemplate: 'Classic' | 'Modern' | 'Minimal';
    /** Optional overrides for the WhatsApp/email message templates (see messages.ts). */
    templates?: MessageTemplates;
  };
}

export interface Customer {
  id: string;
  name: string;
  type: 'B2B' | 'B2C';
  gstin?: string;
  stateCode: string;
  city: string;
  billingAddress: string;
  shippingAddress: string;
  phone: string;
  email: string;
  termsDays: number; // 0 = due on receipt
}

export interface RatePoint {
  effectiveFrom: string; // ISO date
  ratePaise: Paise;
  gstRate: number;
}
export interface Item {
  id: string;
  name: string;
  hsn: string;
  unit: string;
  category: string;
  rates: RatePoint[]; // history; the one effective on the invoice date applies
  caVerified: boolean;
}

/** Per-invoice activity that cannot be derived from the invoice itself (sends, reminders). */
export interface InvoiceEvent {
  id: string;
  invoiceId: string;
  at: string; // ISO timestamp
  type: 'whatsapp' | 'email' | 'reminder' | 'link';
  step?: string; // reminder ladder step id
  detail?: string;
}
/** The person you are demoing to (Presenter Panel). */
export interface Prospect { name: string; phone: string }

export interface AuditEntry {
  id: string;
  at: string; // ISO timestamp
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

/** Rate effective on `date` (latest effectiveFrom <= date; falls back to the earliest). */
export function rateOn(item: Pick<Item, 'rates'>, date: string): RatePoint {
  const sorted = [...item.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let cur = sorted[0];
  for (const r of sorted) if (r.effectiveFrom <= date) cur = r;
  return cur;
}

/** Add a rate/GST change that takes effect from a date; same-date entries are replaced. */
export function withRateChange(item: Item, change: { effectiveFrom: string; gstRate?: number; ratePaise?: Paise }): Item {
  const base = rateOn(item, change.effectiveFrom);
  const next: RatePoint = {
    effectiveFrom: change.effectiveFrom,
    ratePaise: change.ratePaise ?? base.ratePaise,
    gstRate: change.gstRate ?? base.gstRate,
  };
  const rates = item.rates.filter((r) => r.effectiveFrom !== change.effectiveFrom).concat(next)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { ...item, rates, caVerified: false };
}
