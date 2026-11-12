import type { Paise } from './money';
import { stateLabel } from './states';
import type { InvoiceTotals, LineInput } from './types';

export type CheckState = 'pass' | 'fail' | 'warn' | 'na';
export interface Issue { id: string; label: string; state: CheckState; blocking: boolean; message?: string }

export interface ComplianceInput {
  supplier: { name: string; address: string; gstin: string };
  date: string | null;
  isB2B: boolean;
  customer: { name: string; address: string; gstin?: string; stateCode?: string };
  placeOfSupply: string | null;
  shipToStateCode?: string | null;
  shipToAddress?: string | null;
  reverseCharge: boolean | null;
  lines: LineInput[];
  totals: InvoiceTotals;
  signatory: string | null; // signature image present or signatory name
  /** Unregistered-buyer threshold in paise (default Rs 50,000) and the value it is tested on. */
  b2cThreshold?: Paise;
  b2cBasis?: 'grand' | 'taxable';
}

export const B2C_DEFAULT_THRESHOLD: Paise = 5_000_000;

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

export interface Compliance { items: Issue[]; passed: number; total: number; missing: Issue[]; canIssue: boolean }

/** Rule 46 particulars. Items marked na count as passed. */
export function evaluateCompliance(i: ComplianceInput): Compliance {
  const items: Issue[] = [];
  const add = (id: string, label: string, state: CheckState, message?: string) =>
    items.push({ id, label, state, blocking: state === 'fail', message });
  const ok = (cond: boolean) => (cond ? 'pass' : 'fail') as CheckState;
  const threshold = i.b2cThreshold ?? B2C_DEFAULT_THRESHOLD;
  const basis = i.b2cBasis === 'taxable' ? i.totals.taxable : i.totals.grandTotal;
  const b2cStrict = !i.isB2B && basis >= threshold;

  add('supplier', 'Supplier name, address and GSTIN',
    ok(filled(i.supplier.name) && filled(i.supplier.address) && filled(i.supplier.gstin)),
    'Complete the business profile in Settings');
  add('number-date', 'Invoice number and date', ok(filled(i.date)), 'Number is assigned when you issue');

  if (i.isB2B) {
    add('recipient', 'Recipient name and address', ok(filled(i.customer.name) && filled(i.customer.address)),
      'Recipient name and address are required');
    add('recipient-gstin', 'Recipient GSTIN (B2B)', ok(filled(i.customer.gstin)), 'Add the buyer GSTIN');
  } else if (b2cStrict) {
    const missing = [!filled(i.customer.name) && 'name', !filled(i.customer.address) && 'address',
      !filled(i.customer.stateCode) && 'state'].filter(Boolean);
    add('recipient', 'Recipient name and address', missing.length ? 'fail' : 'pass',
      missing.length ? `Invoice value is Rs 50,000 or more: buyer ${missing.join(', ')} required` : undefined);
    add('recipient-gstin', 'Recipient GSTIN (B2B)', 'na', 'Unregistered buyer');
  } else {
    add('recipient', 'Recipient name and address', 'na', 'Not required below Rs 50,000 for an unregistered buyer');
    add('recipient-gstin', 'Recipient GSTIN (B2B)', 'na', 'Unregistered buyer');
  }

  const hsnLens = i.lines.map((l) => l.hsn.replace(/\s/g, '').length);
  add('hsn', 'HSN/SAC on every line',
    i.lines.length === 0 || hsnLens.some((n) => n === 0) ? 'fail' : hsnLens.some((n) => n < 4) ? 'warn' : 'pass',
    hsnLens.some((n) => n > 0 && n < 4) ? 'HSN/SAC has fewer than 4 digits; confirm with your CA' : 'Add HSN/SAC to every line');
  add('description', 'Description on every line', ok(i.lines.length > 0 && i.lines.every((l) => filled(l.description))));
  add('qty-unit', 'Quantity and unit', ok(i.lines.length > 0 && i.lines.every((l) => l.qty > 0 && filled(l.unit))));
  add('total', 'Total value', ok(i.lines.length > 0 && i.totals.grandTotal > 0), 'Add at least one line with a value');
  add('taxable', 'Taxable value after discount', ok(i.lines.length > 0 && i.totals.taxable > 0));
  add('rate', 'Tax rate', ok(i.lines.length > 0 && i.lines.every((l) => Number.isFinite(l.gstRate) && l.gstRate >= 0)));
  add('tax-amount', 'Tax amounts (CGST/SGST or IGST)',
    ok(i.lines.length > 0 && (i.totals.supply === 'intra' ? i.totals.igst === 0 : i.totals.cgst === 0 && i.totals.sgst === 0)));
  add('pos', 'Place of supply with state name and code', ok(filled(i.placeOfSupply) && !!stateLabel(i.placeOfSupply)));

  const shipDiffers = !!i.shipToStateCode && i.shipToStateCode !== i.placeOfSupply;
  add('delivery', 'Delivery address where different from place of supply',
    shipDiffers ? ok(filled(i.shipToAddress)) : 'na',
    shipDiffers ? 'Enter the delivery address' : undefined);
  add('reverse-charge', 'Reverse charge applicability', ok(i.reverseCharge === true || i.reverseCharge === false));
  add('signature', 'Signature of supplier or authorised signatory', ok(filled(i.signatory)),
    'Upload a signature or set the signatory name in Settings');

  const passed = items.filter((x) => x.state !== 'fail').length;
  const missing = items.filter((x) => x.blocking);
  return { items, passed, total: items.length, missing, canIssue: missing.length === 0 };
}
