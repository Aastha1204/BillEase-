import type { Business } from './entities';
import { formatDate } from './money';
import { stateName } from './states';
import type { Invoice, InvoiceMeta } from './types';
import { amountInWordsINR } from './words';

/**
 * Everything the "Standard" (Indian trade) invoice prints, computed once so the PDF and the
 * on-screen preview can never disagree. Pure; no React.
 */

export const DEFAULT_TERMS = [
  'Goods once sold will not be taken back.',
  'Our responsibility ceases once the goods leave our premises.',
  'No claim will be entertained unless notified within 24 hours of receipt of the goods.',
  'Interest @ 24% p.a. will be charged on invoices not paid by the due date.',
];
export const DEFAULT_DECLARATION = 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';

export const CHARGE_PRESETS = [
  { label: 'Loading / Cartage charges on local sales', short: 'Loading / cartage', hsn: '996511', gstRate: 18 },
  { label: 'Freight charges', short: 'Freight', hsn: '996511', gstRate: 18 },
  { label: 'Transport charges', short: 'Transport', hsn: '996519', gstRate: 18 },
  { label: 'Packing and forwarding', short: 'Packing', hsn: '996512', gstRate: 18 },
  { label: 'Other charges', short: 'Other', hsn: '9997', gstRate: 18 },
] as const;

export const panOf = (gstin?: string) => (gstin && gstin.length >= 12 ? gstin.slice(2, 12) : '');
/** 6-digit PIN found at the end of an address ("... Thane 421301"), or ''. */
export const pinOf = (address: string) => /\b(\d{6})\b(?!.*\b\d{6}\b)/.exec(address)?.[1] ?? '';

export interface PartyView { name: string; address: string; pin: string; gstin: string; pan: string; stateName: string; stateCode: string; contact: string }
export interface ItemRow {
  sr: number; partNo: string; description: string; details: string[]; hsn: string; qty: number; uom: string; rate: number;
  discountPct: number; discountAmt: number; value: number; gstRate: number; cgst: number; sgst: number; igst: number;
}
export interface HsnRow { hsn: string; taxable: number; rate: number; cgst: number; sgst: number; igst: number; totalTax: number }
export interface EInvoiceView { irn: string; ackNo: string; ackDate: string }

export interface StandardView {
  inter: boolean;
  title: string;
  supplier: { name: string; legalName: string; address: string; gstin: string; pan: string; cin: string; stateName: string; stateCode: string; phone: string; email: string };
  number: string;
  date: string;
  /** Header grid as [label, value] rows, left cell + right cell. */
  grid: [[string, string], [string, string]][];
  buyer: PartyView;
  consignee: PartyView;
  placeOfSupply: string;
  items: ItemRow[];
  totalQty: number | null;
  totalQtyUnit: string;
  itemValue: number;
  charges: { label: string; value: number; gstRate: number }[];
  chargesValue: number;
  taxable: number;
  cgst: number; sgst: number; igst: number;
  rateLabel: string; // "@9%" when every line has the same rate
  roundOff: number;
  grandTotal: number;
  amountWords: string;
  hsnRows: HsnRow[];
  taxWords: string;
  terms: string[];
  declaration: string;
  jurisdiction: string;
  bank: { name: string; account: string; ifsc: string; branch: string; upi: string };
  eInvoice: EInvoiceView | null;
}

/** Deterministic demo e-invoice values. They look like an IRP response but nothing is registered anywhere. */
export function demoEInvoice(inv: Pick<Invoice, 'number' | 'date'>, gstin: string): EInvoiceView {
  let h = 2166136261;
  const seed = `${gstin}|${inv.number}|${inv.date}`;
  const hex = (n: number) => {
    let out = '';
    while (out.length < n) {
      for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0; }
      h = Math.imul(h ^ (out.length + 1), 2246822507) >>> 0;
      out += h.toString(16).padStart(8, '0');
    }
    return out.slice(0, n);
  };
  const digits = String(parseInt(hex(8), 16)).padStart(10, '0').slice(0, 10);
  return { irn: hex(64), ackNo: `12${digits}${String(parseInt(hex(4), 16) % 1000).padStart(3, '0')}`.slice(0, 15), ackDate: inv.date };
}

const party = (name: string, address: string, gstin: string | undefined, stateCode: string, contact = ''): PartyView => ({
  name, address, pin: pinOf(address), gstin: gstin ?? '', pan: panOf(gstin), stateName: stateName(stateCode), stateCode, contact,
});

const d = (iso?: string) => (iso ? formatDate(iso) : '');
const pair = (l: string, v?: string): [string, string] => [l, v ?? ''];

export function standardView(inv: Invoice, b: Business): StandardView {
  const t = inv.totals;
  const m: InvoiceMeta = inv.meta ?? {};
  const inter = t.supply === 'inter';
  const itemIdx = inv.lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind !== 'charge');
  const chargeIdx = inv.lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === 'charge');

  const items: ItemRow[] = itemIdx.map(({ l, i }, n) => {
    const r = t.lines[i];
    return {
      sr: n + 1, partNo: l.partNo ?? '', description: l.description,
      details: [l.batch && `Batch No : ${l.batch}`, l.grade && `Grade : ${l.grade}`, l.size && `Size : ${l.size}`].filter(Boolean) as string[],
      hsn: l.hsn, qty: l.qty, uom: l.unit, rate: l.ratePaise,
      discountPct: l.discount.kind === 'percent' ? l.discount.value : 0, discountAmt: r.discount,
      value: r.taxable, gstRate: l.gstRate, cgst: r.cgst, sgst: r.sgst, igst: r.igst,
    };
  });
  const units = new Set(items.map((x) => x.uom));
  const charges = chargeIdx.map(({ l, i }) => ({ label: l.description, value: t.lines[i].taxable, gstRate: l.gstRate }));
  const itemValue = items.reduce((a, x) => a + x.value, 0);
  const chargesValue = charges.reduce((a, c) => a + c.value, 0);

  const hsn = new Map<string, HsnRow>();
  inv.lines.forEach((l, i) => {
    const r = t.lines[i];
    const k = `${l.hsn}|${l.gstRate}`;
    const e = hsn.get(k) ?? { hsn: l.hsn, taxable: 0, rate: l.gstRate, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    e.taxable += r.taxable; e.cgst += r.cgst; e.sgst += r.sgst; e.igst += r.igst; e.totalTax += r.cgst + r.sgst + r.igst;
    hsn.set(k, e);
  });
  const rates = new Set(inv.lines.map((l) => l.gstRate));
  const half = (r: number) => r / 2;
  const only = rates.size === 1 ? [...rates][0] : null;

  const buyerState = inv.customer.stateCode ?? inv.placeOfSupply;
  const buyer = party(inv.customer.name, inv.customer.address, inv.customer.gstin, buyerState, m.contactPerson);
  const shipSame = !inv.shipToName && !inv.shipToAddress && !inv.shipToStateCode && !inv.shipToGstin;
  const consignee = shipSame ? buyer : party(inv.shipToName || inv.customer.name, inv.shipToAddress || inv.customer.address, inv.shipToGstin ?? inv.customer.gstin, inv.shipToStateCode ?? buyerState);

  const grid: StandardView['grid'] = [
    [pair('Invoice No.', inv.number ?? 'Draft'), pair('Dated', d(inv.date))],
    [pair('Delivery Challan No.', m.challanNo), pair('Challan Date', d(m.challanDate))],
    [pair('Mode / Terms of Payment', m.paymentTerms), pair('Due On', d(inv.dueDate))],
    [pair("Buyer's Order No.", m.buyerOrderNo), pair('Dated', d(m.buyerOrderDate))],
    [pair('Reference No.', m.referenceNo), pair('Other Reference(s)', m.otherReferences)],
    [pair('Dispatch Doc No.', m.dispatchDocNo), pair('Dispatched Through', m.dispatchedThrough)],
    [pair('Vehicle No.', m.vehicleNo), pair('Destination', m.destination)],
    [pair('LR / RR No.', m.lrNo), pair('LR Date', d(m.lrDate))],
    [pair('E-Way Bill No.', m.ewayBill), pair('Transporter', m.transporter)],
    [pair('Broker / Agent', m.brokerName), pair('Broker / Agent Mobile', m.brokerMobile)],
    [pair('Terms of Delivery', m.termsOfDelivery), pair('Reverse Charge', inv.reverseCharge ? 'Yes' : 'No')],
  ];

  const taxTotal = t.cgst + t.sgst + t.igst;
  return {
    inter, title: 'TAX INVOICE',
    supplier: {
      name: b.tradeName, legalName: b.legalName, address: `${b.address}, ${b.city} ${b.pincode}`.replace(/\s+/g, ' ').trim(), gstin: b.gstin, pan: panOf(b.gstin), cin: b.cin ?? '',
      stateName: stateName(b.stateCode), stateCode: b.stateCode, phone: b.phone, email: b.email,
    },
    number: inv.number ?? 'Draft', date: d(inv.date), grid, buyer, consignee, placeOfSupply: stateName(inv.placeOfSupply),
    items,
    totalQty: items.length && units.size === 1 ? items.reduce((a, x) => a + x.qty, 0) : null,
    totalQtyUnit: units.size === 1 ? [...units][0] : '',
    itemValue, charges, chargesValue, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
    rateLabel: only === null ? '' : inter ? `@${only}%` : `@${half(only)}%`,
    roundOff: t.roundOff, grandTotal: t.grandTotal, amountWords: amountInWordsINR(t.grandTotal),
    hsnRows: [...hsn.values()], taxWords: amountInWordsINR(taxTotal),
    terms: b.termsAndConditions?.length ? b.termsAndConditions : DEFAULT_TERMS,
    declaration: b.declaration || DEFAULT_DECLARATION,
    jurisdiction: b.jurisdiction || `Subject to ${b.city || 'local'} jurisdiction`,
    bank: { name: b.bankName, account: b.bankAccountMasked, ifsc: b.ifsc, branch: b.bankBranch ?? '', upi: b.upiId },
    eInvoice: b.eInvoice && inv.number && inv.isB2B ? demoEInvoice(inv, b.gstin) : null,
  };
}
