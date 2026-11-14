import type { Workspace } from '../domain/ca';
import type { Business, Customer, Item } from '../domain/entities';
import { makeGstin, validateGstin } from '../domain/gstin';
import { toPaise } from '../domain/money';
import { stateName } from '../domain/states';
import { monogramSvg } from './clients';
import { makeRng } from './prng';

export const CONSTITUTIONS = ['Proprietorship', 'Partnership firm', 'LLP', 'Private limited company', 'Public limited company', 'HUF', 'Other'] as const;
export const BUSINESS_KINDS = ['Trader', 'Manufacturer', 'Job work / engineering', 'Services', 'Contractor', 'Retailer'] as const;

export interface NewBusinessInput {
  tradeName: string; legalName: string; constitution: string; kind: string;
  address: string; city: string; pincode: string; gstin: string; phone: string; email: string;
  seriesPrefix: string; bankName: string; bankAccountMasked: string; ifsc: string; bankBranch: string; upiId: string; signatoryName: string;
  withSample: boolean;
}

/** Short, unique, URL-safe id for a business ("biz-sunrise-steels", "biz-sunrise-steels-2"). */
export function makeBusinessId(name: string, existing: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'business';
  let id = `biz-${slug}`;
  for (let n = 2; existing.includes(id); n++) id = `biz-${slug}-${n}`;
  return id;
}

/** Suggested invoice series prefix from a trade name: up to 3 capital letters. */
export function suggestPrefix(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const letters = words.length >= 3 ? words.slice(0, 3).map((w) => w[0]).join('') : words.length === 2 ? words[0][0] + words[1].slice(0, 2) : (words[0] ?? '').slice(0, 3);
  return letters.slice(0, 3);
}

const SAMPLE_ITEMS: [string, string, string, string, number, string][] = [
  ['Mild steel round bar 12 mm', '7214', 'Kg', '62.00', 18, 'Steel'],
  ['Bright steel bar 20 mm', '7215', 'Kg', '98.00', 18, 'Steel'],
  ['Fastener set (box of 100)', '7318', 'Box', '450.00', 18, 'Hardware'],
  ['Machined component (job work)', '9988', 'Pcs', '38.00', 18, 'Job work'],
  ['Labour charges only (job work)', '9988', 'Job', '8500.00', 18, 'Job work'],
  ['Packing material', '4819', 'Pcs', '25.00', 12, 'Packing'],
];
const SAMPLE_CUSTOMERS: { name: string; type: 'B2B' | 'B2C'; abroad?: boolean; terms: number; line: string }[] = [
  { name: 'Sunrise Engineering Works', type: 'B2B', terms: 30, line: 'Unit 4, Industrial Estate' },
  { name: 'Maitri Fabricators', type: 'B2B', terms: 15, line: '12, MIDC Phase 2' },
  { name: 'Orbit Components LLP', type: 'B2B', terms: 30, line: 'Plot 31, Udyog Nagar' },
  { name: 'Greenfield Industries (inter-state)', type: 'B2B', abroad: true, terms: 45, line: 'GIDC Estate, Sector 3' },
  { name: 'Rahul Verma (walk-in)', type: 'B2C', terms: 0, line: 'Flat 9, Shanti Apartments' },
];

/** A brand-new, empty business (optionally with a few fictional starter items and customers) ready to be added as a workspace. */
export function buildWorkspace(input: NewBusinessInput, id: string, today: string): Workspace {
  const g = validateGstin(input.gstin);
  if (!g.valid) throw new Error('A valid GSTIN is required');
  const stateCode = g.stateCode!;
  const business: Business = {
    id, tradeName: input.tradeName.trim(), legalName: input.legalName.trim(), constitution: input.constitution, kind: input.kind,
    address: input.address.trim(), city: input.city.trim(), stateCode, pincode: input.pincode.trim(), gstin: g.normalized,
    phone: input.phone.trim(), email: input.email.trim(), seriesPrefix: input.seriesPrefix.trim(),
    bankName: input.bankName.trim(), bankAccountMasked: input.bankAccountMasked.trim(), ifsc: input.ifsc.trim().toUpperCase(), bankBranch: input.bankBranch.trim(),
    upiId: input.upiId.trim(), signatoryName: input.signatoryName.trim(),
    logoSvg: monogramSvg(input.tradeName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'B', '#A7F3D0', '#38BDF8'), signatureSvg: '',
    settings: { roundOff: true, b2cBasis: 'grand', b2cThreshold: 5_000_000, b2clThreshold: 10_000_000, defaultTermsDays: 30, demoQrWatermark: true, pdfTemplate: 'Standard' },
  };
  const ws: Workspace = { business, customers: [], items: [], invoices: [], payments: [], creditNotes: [], counters: { invoice: {}, creditNote: {} }, auditLog: [], events: [] };
  if (!input.withSample) return ws;

  const rng = makeRng(`billease-new/${id}`);
  const pan = () => `${rng.pick(['A', 'B', 'C'])}${rng.pick(['A', 'B', 'D'])}${rng.pick(['F', 'C', 'H'])}${rng.pick(['F', 'C', 'P'])}${rng.pick(['A', 'S', 'T'])}${rng.int(1000, 9999)}${rng.pick(['K', 'L', 'M', 'N'])}`;
  ws.items = SAMPLE_ITEMS.map((r, i): Item => ({
    id: `${id}-item-${i + 1}`, name: r[0], hsn: r[1], unit: r[2], category: r[5], caVerified: false,
    rates: [{ effectiveFrom: '2025-04-01', ratePaise: toPaise(r[3]), gstRate: r[4] }],
  }));
  const otherState = stateCode === '24' ? '27' : '24';
  ws.customers = SAMPLE_CUSTOMERS.map((c, i): Customer => {
    const sc = c.abroad ? otherState : stateCode;
    const city = c.abroad ? stateName(otherState) : input.city.trim() || stateName(stateCode);
    const addr = `${c.line}, ${city}`;
    return {
      id: `${id}-cust-${i + 1}`, name: c.name, type: c.type, gstin: c.type === 'B2B' ? makeGstin(sc, pan(), '1') : undefined, stateCode: sc, city,
      billingAddress: addr, shippingAddress: addr, phone: `+91 90000 07${String(i + 1).padStart(3, '0')}`, email: '', termsDays: c.terms,
    };
  });
  void today;
  return ws;
}
