import LZString from 'lz-string';
import type { Business } from './entities';
import { isKnownStateCode } from './states';
import { computeInvoice, supplyType } from './tax';
import type { Invoice, LineInput } from './types';
import { stateFromGstin } from './gstin';

/**
 * Public invoice payload, encoded in the URL hash (never sent to a server).
 * PRODUCTION NOTE: replace this with signed short links (e.g. /i/abc123) resolved by the backend,
 * so links can be revoked, expire, and do not carry customer data in the URL.
 * Totals are NOT stored: they are recomputed from the lines on open, so a link cannot show
 * a total that disagrees with its lines.
 */
export interface SharePayload {
  v: 1;
  n: string; // invoice number
  d: string; // invoice date
  du: string; // due date
  pos: string; // place of supply
  rc: 0 | 1;
  ro: 0 | 1; // round-off on
  b: { n: string; l: string; g: string; a: string; u: string; p: string; e: string; bk: string; sg: string; wm: 0 | 1; tpl: string };
  c: { n: string; a: string; g: string; s: string; b2b: 0 | 1 };
  sh?: [string, string]; // ship-to state, address
  l: [string, string, number, string, number, 0 | 1, number, number][]; // desc,hsn,qty,unit,ratePaise,discKind,discVal,gst
  bal: number; // balance due (paise) when the link was made
}

export function toPayload(inv: Invoice, b: Business, balance: number): SharePayload {
  if (!inv.number) throw new Error('Only issued invoices can be shared');
  return {
    v: 1, n: inv.number, d: inv.date, du: inv.dueDate, pos: inv.placeOfSupply, rc: inv.reverseCharge ? 1 : 0,
    ro: b.settings.roundOff ? 1 : 0,
    b: { n: b.tradeName, l: b.legalName, g: b.gstin, a: `${b.address}, ${b.city} ${b.pincode}`, u: b.upiId, p: b.phone, e: b.email,
      bk: [b.bankName, b.bankAccountMasked, b.ifsc].join('|'), sg: b.signatoryName, wm: b.settings.demoQrWatermark ? 1 : 0, tpl: b.settings.pdfTemplate },
    c: { n: inv.customer.name, a: inv.customer.address, g: inv.customer.gstin ?? '', s: inv.customer.stateCode ?? inv.placeOfSupply, b2b: inv.isB2B ? 1 : 0 },
    ...(inv.shipToStateCode ? { sh: [inv.shipToStateCode, inv.shipToAddress ?? ''] as [string, string] } : {}),
    l: inv.lines.map((x) => [x.description, x.hsn, x.qty, x.unit, x.ratePaise, x.discount.kind === 'flat' ? 1 : 0, x.discount.value, x.gstRate]),
    bal: balance,
  };
}

export function encodeInvoice(inv: Invoice, b: Business, balance: number): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(toPayload(inv, b, balance)));
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export class ShareLinkError extends Error {}

export interface Decoded { invoice: Invoice; business: Business; balance: number }

/** Decode and validate; throws ShareLinkError for anything malformed. */
export function decodeInvoice(hash: string): Decoded {
  const raw = hash.replace(/^#/, '');
  let p: SharePayload;
  try {
    const json = LZString.decompressFromEncodedURIComponent(raw);
    if (!json) throw new Error('empty');
    p = JSON.parse(json);
  } catch { throw new ShareLinkError('This invoice link is not valid.'); }

  const ok = p && p.v === 1 && isStr(p.n) && /^\d{4}-\d{2}-\d{2}$/.test(p.d) && /^\d{4}-\d{2}-\d{2}$/.test(p.du) && isStr(p.pos) && isKnownStateCode(p.pos)
    && p.b && isStr(p.b.n) && isStr(p.b.g) && p.c && isStr(p.c.n) && Array.isArray(p.l) && p.l.length > 0 && p.l.length <= 200 && isNum(p.bal)
    && p.l.every((x) => Array.isArray(x) && isStr(x[0]) && isStr(x[1]) && isNum(x[2]) && isStr(x[3]) && isNum(x[4]) && x[4] >= 0 && isNum(x[6]) && isNum(x[7]) && x[2] >= 0 && x[7] >= 0 && x[7] <= 40);
  if (!ok) throw new ShareLinkError('This invoice link is not valid.');

  const stateCode = stateFromGstin(p.b.g) ?? '27';
  const [bankName = '', bankAccountMasked = '', ifsc = ''] = (p.b.bk ?? '').split('|');
  const business = {
    id: 'shared', tradeName: p.b.n, legalName: p.b.l || p.b.n, constitution: '', address: p.b.a, city: '', stateCode, pincode: '', gstin: p.b.g,
    phone: p.b.p ?? '', email: p.b.e ?? '', seriesPrefix: '', bankName, bankAccountMasked, ifsc, upiId: p.b.u ?? '', signatoryName: p.b.sg ?? '',
    logoSvg: '', signatureSvg: '',
    settings: { roundOff: p.ro === 1, b2cBasis: 'grand', b2cThreshold: 5_000_000, b2clThreshold: 10_000_000, defaultTermsDays: 15, demoQrWatermark: p.b.wm === 1,
      pdfTemplate: (['Classic', 'Modern', 'Minimal'].includes(p.b.tpl) ? p.b.tpl : 'Classic') as Business['settings']['pdfTemplate'] },
  } satisfies Business;

  const lines: LineInput[] = p.l.map((x, i) => ({
    id: `s${i}`, description: x[0], hsn: x[1], qty: x[2], unit: x[3], ratePaise: x[4],
    discount: { kind: x[5] === 1 ? 'flat' : 'percent', value: x[6] }, gstRate: x[7],
  }));
  const supply = supplyType(p.pos, stateCode);
  const invoice: Invoice = {
    id: `shared-${p.n}`, number: p.n, date: p.d, dueDate: p.du, customerId: '',
    customer: { name: p.c.n, address: p.c.a ?? '', gstin: p.c.g || undefined, stateCode: p.c.s },
    isB2B: p.c.b2b === 1, placeOfSupply: p.pos, ...(p.sh ? { shipToStateCode: p.sh[0], shipToAddress: p.sh[1] || undefined } : {}),
    reverseCharge: p.rc === 1, lines, totals: computeInvoice(lines, supply, p.ro === 1), lockedAt: p.d,
  };
  return { invoice, business, balance: Math.max(0, Math.round(p.bal)) };
}
