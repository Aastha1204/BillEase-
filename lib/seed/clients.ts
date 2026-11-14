import type { Business, Customer, Item } from '../domain/entities';
import { makeGstin } from '../domain/gstin';
import { toPaise } from '../domain/money';
import { financialYear, formatInvoiceNumber, type Counters } from '../domain/numbering';
import { addDays } from '../domain/payments';
import { computeInvoice, supplyType } from '../domain/tax';
import type { Invoice, LineInput, Payment } from '../domain/types';
import type { Workspace } from '../domain/ca';
import { SSE_SIGNATURE } from './assets';
import { seedMeta } from './meta';
import { makeRng, type Rng } from './prng';

const uri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
/** Generated monogram logo (no external images). */
export const monogramSvg = (initials: string, from: string, to: string) => uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#0B1220"/><rect x="14" y="14" width="92" height="92" rx="18" fill="url(#g)"/><text x="60" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="38" fill="#0B1220">${initials}</text></svg>`,
);

type ItemRow = [string, string, string, string, number, string]; // name, hsn/sac, unit, rate, gst, category
interface PartySpec { name: string; type: 'B2B' | 'B2C'; city: string; stateCode: string; addr: string; terms: number }
interface ClientSpec {
  id: string; trade: string; legal: string; constitution: string; kind: string; address: string; city: string; stateCode: string; pincode: string;
  pan: string; prefix: string; upi: string; bank: string; ifsc: string; acct: string; signatory: string; phone: string; email: string; colors: [string, string];
  items: ItemRow[]; customers: PartySpec[]; invoices: number; services: boolean;
  /** Trade-format options (all optional). */
  bankBranch?: string; cin?: string; eInvoice?: boolean; decimals?: boolean; bigQty?: boolean; charges?: boolean; variants?: { grade: string; size: string }[];
}

const SPECS: ClientSpec[] = [
  {
    id: 'biz-aarambh', trade: 'Aarambh Interiors', legal: 'Aarambh Interiors (Proprietorship)', constitution: 'Proprietorship', kind: 'Interior designer (services)',
    address: 'Office 8, Kothrud Business Hub, Paud Road, Kothrud', city: 'Pune', stateCode: '27', pincode: '411038', pan: 'AJPPK3312D', prefix: 'AIN', upi: 'aarambh@demo',
    bank: 'Demo Urban Bank', ifsc: 'DEMO0002345', acct: 'XXXXXXXX2288', signatory: 'Neha Kulkarni, Proprietor', phone: '+91 90000 03001', email: 'studio@aarambh.example', colors: ['#F9A8D4', '#C084FC'],
    items: [['Interior design consultation', '998391', 'Job', '45000.00', 18, 'Design'], ['3D visualisation and walkthrough', '998391', 'Job', '28000.00', 18, 'Design'],
      ['Project management fee', '998399', 'Month', '35000.00', 18, 'Execution'], ['Site supervision (per visit)', '998399', 'Visit', '4500.00', 18, 'Execution'],
      ['Modular kitchen design package', '998391', 'Job', '60000.00', 18, 'Design'], ['Material sourcing assistance', '998399', 'Job', '15000.00', 18, 'Execution']],
    customers: [
      { name: 'Deshpande Homes LLP', type: 'B2B', city: 'Pune', stateCode: '27', addr: '3rd Floor, Sai Plaza, FC Road, Pune 411004', terms: 30 },
      { name: 'Riverside Developers', type: 'B2B', city: 'Pune', stateCode: '27', addr: 'Plot 14, Baner Road, Pune 411045', terms: 30 },
      { name: 'Sahyadri Hospitality', type: 'B2B', city: 'Mumbai', stateCode: '27', addr: '18, Marine Drive Arcade, Mumbai 400020', terms: 15 },
      { name: 'Kapoor & Sons Retail', type: 'B2B', city: 'Hyderabad', stateCode: '36', addr: '5-9-22, Abids Road, Hyderabad 500001', terms: 15 },
      { name: 'Meera Joshi', type: 'B2C', city: 'Pune', stateCode: '27', addr: 'A-702, Lakeview Towers, Wakad, Pune 411057', terms: 0 },
      { name: 'Rahul Bhosale', type: 'B2C', city: 'Pune', stateCode: '27', addr: '12, Shivaji Nagar, Pune 411005', terms: 0 },
    ],
    invoices: 16, services: true,
  },
  {
    id: 'biz-pixelkraft', trade: 'Pixel Kraft Media', legal: 'Pixel Kraft Media Private Limited', constitution: 'Private limited company', kind: 'Agency (services)',
    address: '2nd Floor, Brigade Square, Indiranagar', city: 'Bengaluru', stateCode: '29', pincode: '560038', pan: 'AAKCP9087M', prefix: 'PKM', upi: 'pixelkraft@demo',
    bank: 'Demo Commercial Bank', ifsc: 'DEMO0003456', acct: 'XXXXXXXX7710', signatory: 'Arjun Rao, Director', phone: '+91 90000 04001', email: 'billing@pixelkraft.example', colors: ['#7DD3FC', '#818CF8'],
    items: [['Social media management (monthly)', '998361', 'Month', '45000.00', 18, 'Retainers'], ['Video production (per video)', '999612', 'Job', '85000.00', 18, 'Production'],
      ['Performance marketing management', '998361', 'Month', '60000.00', 18, 'Retainers'], ['Brand identity package', '998391', 'Job', '120000.00', 18, 'Creative'],
      ['Website design and build', '998314', 'Job', '150000.00', 18, 'Creative'], ['Photography shoot (per day)', '999612', 'Day', '25000.00', 18, 'Production']],
    customers: [
      { name: 'Namma Foods Pvt Ltd', type: 'B2B', city: 'Bengaluru', stateCode: '29', addr: '14, 100 Feet Road, Indiranagar, Bengaluru 560038', terms: 30 },
      { name: 'GreenLeaf Organics', type: 'B2B', city: 'Bengaluru', stateCode: '29', addr: 'Unit 7, Whitefield Tech Park, Bengaluru 560066', terms: 30 },
      { name: 'Madras Coffee Works', type: 'B2B', city: 'Chennai', stateCode: '33', addr: '22, Anna Salai, Chennai 600002', terms: 15 },
      { name: 'Konkan Tours LLP', type: 'B2B', city: 'Goa', stateCode: '30', addr: 'Shop 4, Panjim Market Road, Panaji 403001', terms: 15 },
      { name: 'Tejas Fitness', type: 'B2B', city: 'Mumbai', stateCode: '27', addr: 'Gala 9, Andheri Link Road, Mumbai 400053', terms: 30 },
    ],
    invoices: 14, services: true,
  },
  {
    id: 'biz-omhardware', trade: 'Om Hardware & Sanitary', legal: 'Om Hardware & Sanitary (Partnership Firm)', constitution: 'Partnership firm', kind: 'Trader',
    address: '41, Sarafa Bazaar Road, Rajwada', city: 'Indore', stateCode: '23', pincode: '452002', pan: 'AABFO2201H', prefix: 'OHS', upi: 'omhardware@demo',
    bank: 'Demo Gramin Bank', ifsc: 'DEMO0004567', acct: 'XXXXXXXX5533', signatory: 'Dinesh Agrawal, Partner', phone: '+91 90000 05001', email: 'sales@omhardware.example', colors: ['#FDE68A', '#F59E0B'],
    items: [['CPVC pipe 1 inch (3 m)', '3917', 'Length', '285.00', 18, 'Plumbing'], ['Ceramic wash basin', '6910', 'Pcs', '2450.00', 18, 'Sanitary ware'], ['Bathroom tap (brass)', '8481', 'Pcs', '640.00', 18, 'Fittings'],
      ['Portland cement 50 kg', '2523', 'Bag', '395.00', 28, 'Building material'], ['Exterior emulsion paint 20 L', '3208', 'Pcs', '5200.00', 28, 'Paints'], ['Door hinge set', '8302', 'Set', '180.00', 18, 'Fittings'],
      ['TMT steel bar 12 mm (per kg)', '7214', 'Kg', '64.00', 18, 'Building material'], ['PVC water tank 1000 L', '3925', 'Pcs', '7800.00', 18, 'Plumbing']],
    customers: [
      { name: 'Malwa Constructions', type: 'B2B', city: 'Indore', stateCode: '23', addr: '8, AB Road, Vijay Nagar, Indore 452010', terms: 30 },
      { name: 'Shri Ram Plumbing Works', type: 'B2B', city: 'Indore', stateCode: '23', addr: '17, Palasia Square, Indore 452001', terms: 15 },
      { name: 'Ujjain Builders', type: 'B2B', city: 'Ujjain', stateCode: '23', addr: 'Station Road, Ujjain 456001', terms: 30 },
      { name: 'Ratlam Hardware Traders', type: 'B2B', city: 'Ratlam', stateCode: '23', addr: 'Main Market, Ratlam 457001', terms: 15 },
      { name: 'Vikram Jain', type: 'B2C', city: 'Indore', stateCode: '23', addr: '56, Scheme 54, Indore 452010', terms: 0 },
      { name: 'Pooja Sharma', type: 'B2C', city: 'Indore', stateCode: '23', addr: '9, Saket Nagar, Indore 452018', terms: 0 },
    ],
    invoices: 22, services: false,
  },
  {
    id: 'biz-brightsteel', trade: 'Veer Bright Steels Pvt. Ltd.', legal: 'Veer Bright Steels Private Limited', constitution: 'Private limited company', kind: 'Manufacturer (bright bars)',
    address: 'Gala 12, Sagar Industrial Estate, Waliv Road, Vasai East', city: 'Vasai', stateCode: '27', pincode: '401208', pan: 'AABCV5521M', prefix: 'VBS', upi: 'veersteels@demo',
    bank: 'Demo Industrial Bank', ifsc: 'DEMO0005678', acct: 'XXXXXXXX6204', bankBranch: 'Vasai Road', cin: 'U27100MH2015PTC000451', eInvoice: true,
    signatory: 'Mahesh Naik, Director', phone: '+91 90000 08001', email: 'sales@veersteels.example', colors: ['#BAE6FD', '#6366F1'],
    items: [['Bright steel bars', '7215', 'Kgs', '118.00', 18, 'Bright bars'], ['Alloy bright bars', '7215', 'Kgs', '132.00', 18, 'Bright bars'],
      ['Hexagon bright bars', '7215', 'Kgs', '126.00', 18, 'Bright bars'], ['Cold drawn flats', '7215', 'Kgs', '109.00', 18, 'Bright bars']],
    variants: [{ grade: 'EN1A', size: '5 MM DIA' }, { grade: 'EN1A', size: '6 MM DIA' }, { grade: 'EN8', size: '12 MM DIA' }, { grade: 'EN8', size: '16 MM DIA' }, { grade: 'EN9', size: '20 MM DIA' }, { grade: 'EN24', size: '25 MM DIA' }],
    customers: [
      { name: 'Prabhat Precision Components', type: 'B2B', city: 'Thane', stateCode: '27', addr: 'Unit 21, Wagle Industrial Estate, Thane West 400604', terms: 30 },
      { name: 'Neelkanth Fasteners', type: 'B2B', city: 'Bhiwandi', stateCode: '27', addr: 'Gala 6, Kalher Road, Bhiwandi 421302', terms: 30 },
      { name: 'Shreyas Tools & Dies', type: 'B2B', city: 'Pune', stateCode: '27', addr: 'Plot 18, Bhosari MIDC, Pune 411026', terms: 45 },
      { name: 'Harmony Auto Components', type: 'B2B', city: 'Pune', stateCode: '27', addr: 'Gat 112, Chakan Industrial Area, Pune 410501', terms: 30 },
      { name: 'Zenith Machining Works', type: 'B2B', city: 'Navi Mumbai', stateCode: '27', addr: 'D-44, TTC Industrial Area, Navi Mumbai 400705', terms: 15 },
    ],
    invoices: 20, services: false, decimals: true, charges: true,
  },
  {
    id: 'biz-precision', trade: 'Aarav Precision Works', legal: 'Aarav Precision Works (Proprietorship)', constitution: 'Proprietorship', kind: 'Job work / engineering',
    address: 'Shed 7, Anand Industrial Area, Badlapur MIDC', city: 'Badlapur', stateCode: '27', pincode: '421503', pan: 'AKQPA7730R', prefix: 'APW', upi: 'aaravprecision@demo',
    bank: 'Demo Co-operative Bank', ifsc: 'DEMO0006789', acct: 'XXXXXXXX3391', bankBranch: 'Badlapur East',
    signatory: 'Aarav Joshi, Proprietor', phone: '+91 90000 09001', email: 'jobs@aaravprecision.example', colors: ['#FCA5A5', '#F59E0B'],
    items: [['Machining job work: main shaft', '9988', 'Nos', '4.35', 18, 'Job work'], ['Machining job work: aux shaft', '9988', 'Nos', '4.20', 18, 'Job work'],
      ['Machining job work: thread pin', '9988', 'Nos', '3.05', 18, 'Job work'], ['Labour charge only (per lot)', '9988', 'Lot', '1850.00', 18, 'Job work']],
    customers: [
      { name: 'Crestline Appliances Pvt Ltd', type: 'B2B', city: 'Navi Mumbai', stateCode: '27', addr: 'W-210, TTC Industrial Area, Navi Mumbai 400701', terms: 30 },
      { name: 'Bluepeak Pumps', type: 'B2B', city: 'Thane', stateCode: '27', addr: 'Shop 5, Kopri Industrial Estate, Thane East 400603', terms: 30 },
      { name: 'Orion Cycle Components', type: 'B2B', city: 'Pune', stateCode: '27', addr: 'Plot 9, Pimpri MIDC, Pune 411018', terms: 45 },
      { name: 'Vertex Hydraulics LLP', type: 'B2B', city: 'Bhiwandi', stateCode: '27', addr: 'Gala 14, Purna Road, Bhiwandi 421302', terms: 30 },
    ],
    invoices: 16, services: true, bigQty: true, charges: true,
  },
];

const chargeLine = (id: string, label: string, hsn: string, ratePaise: number): LineInput => ({ id, description: label, hsn, qty: 1, unit: 'Job', ratePaise, discount: { kind: 'percent', value: 0 }, gstRate: 18, kind: 'charge' });

const METHODS = ['UPI', 'UPI', 'NEFT/IMPS', 'Cash', 'Cheque'];
const pan = (rng: Rng) => `${rng.pick(['A', 'B', 'C', 'K'])}${rng.pick(['A', 'B', 'D', 'E'])}${rng.pick(['F', 'C', 'H'])}${rng.pick(['F', 'C', 'P'])}${rng.pick(['A', 'S', 'T'])}${rng.int(1000, 9999)}${rng.pick(['K', 'L', 'M', 'N'])}`;

function build(spec: ClientSpec, today: string): Workspace {
  const rng = makeRng(`billease-demo/${spec.id}`);
  const metaRng = makeRng(`billease-demo/${spec.id}/meta`); // separate stream: details never shift the main data
  const daysAgo = (n: number) => addDays(today, -n);
  const business: Business = {
    id: spec.id, tradeName: spec.trade, legalName: spec.legal, constitution: spec.constitution, kind: spec.kind, address: spec.address, city: spec.city, stateCode: spec.stateCode,
    pincode: spec.pincode, gstin: makeGstin(spec.stateCode, spec.pan, '1'), phone: spec.phone, email: spec.email, seriesPrefix: spec.prefix, bankName: spec.bank,
    bankAccountMasked: spec.acct, ifsc: spec.ifsc, upiId: spec.upi, signatoryName: spec.signatory,
    logoSvg: monogramSvg(spec.trade.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), spec.colors[0], spec.colors[1]), signatureSvg: SSE_SIGNATURE,
    settings: { roundOff: true, b2cBasis: 'grand', b2cThreshold: 5_000_000, b2clThreshold: 10_000_000, defaultTermsDays: 15, demoQrWatermark: true, pdfTemplate: 'Standard' },
    bankBranch: spec.bankBranch ?? `${spec.city} Main Branch`, cin: spec.cin, eInvoice: spec.eInvoice,
  };
  const items: Item[] = spec.items.map((r, i) => ({
    id: `${spec.id}-item-${i + 1}`, name: r[0], hsn: r[1], unit: r[2], category: r[5], caVerified: false,
    rates: [{ effectiveFrom: '2025-04-01', ratePaise: toPaise(r[3]), gstRate: r[4] }],
  }));
  const customers: Customer[] = spec.customers.map((c, i) => ({
    id: `${spec.id}-cust-${i + 1}`, name: c.name, type: c.type, gstin: c.type === 'B2B' ? makeGstin(c.stateCode, pan(rng), '1') : undefined, stateCode: c.stateCode, city: c.city,
    billingAddress: c.addr, shippingAddress: c.addr, phone: `+91 90000 0${6000 + i + spec.invoices}`, email: '', termsDays: c.terms,
  }));

  // dates: recent-skewed over 90 days, oldest first
  const w = Array.from({ length: 90 }, (_, d) => 1 + 3 * Math.exp(-d / 18));
  const offsets = Array.from({ length: spec.invoices }, () => rng.weighted(w)).sort((a, b) => b - a);
  const fyCount: Record<string, number> = {};
  offsets.forEach((o) => { const fy = financialYear(daysAgo(o)); fyCount[fy] = (fyCount[fy] ?? 0) + 1; });
  const seq: Counters = {};
  const base = rng.int(20, 80); // as if the series started in April
  for (const fy of Object.keys(fyCount)) seq[fy] = fy === financialYear(today) ? base : 0;

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  offsets.forEach((o, i) => {
    const date = daysAgo(o);
    const cust = rng.pick(customers);
    const id = `${spec.id}-inv-${String(i + 1).padStart(4, '0')}`;
    const n = rng.int(1, spec.services ? 2 : 3);
    const picks = new Set<number>(); while (picks.size < Math.min(n, items.length)) picks.add(rng.int(0, items.length - 1));
    const lines: LineInput[] = [...picks].map((ix, k) => {
      const it = items[ix], r = it.rates[0];
      const small = r.ratePaise < 100_000;
      const qty = spec.decimals ? rng.int(150, 6000) / 10 : spec.bigQty && it.unit === 'Nos' ? rng.int(200, 3000) : ['Job', 'Month', 'Visit', 'Day', 'Lot'].includes(it.unit) ? rng.int(1, cust.type === 'B2C' ? 1 : 3) : small ? rng.int(10, 120) : rng.int(1, 6);
      const v = spec.variants ? rng.pick(spec.variants) : null;
      return { id: `${id}-l${k + 1}`, description: it.name, hsn: it.hsn, qty, unit: it.unit, ratePaise: r.ratePaise, discount: { kind: 'percent', value: rng.chance(0.15) ? rng.pick([2, 5, 10]) : 0 }, gstRate: r.gstRate, ...(v ? { grade: v.grade, size: v.size, batch: `B${rng.int(1000, 9999)}` } : {}) };
    });
    // keep unregistered buyers under the Rs 50,000 line unless they supply a full address (all do), so this is only a size cap for realism
    if (spec.charges) {
      lines.push(chargeLine(`${id}-c1`, 'Loading / Cartage charges on local sales', '996511', 9000));
      if (rng.chance(0.6)) lines.push(chargeLine(`${id}-c2`, 'Freight charges', '996511', rng.int(2, 8) * 10000));
    }
    const fy = financialYear(date);
    seq[fy] += 1;
    const supply = supplyType(cust.stateCode, business.stateCode);
    const totals = computeInvoice(lines, supply, true);
    const inv: Invoice = {
      id, number: formatInvoiceNumber(spec.prefix, fy, seq[fy]), date, dueDate: addDays(date, cust.termsDays), customerId: cust.id,
      customer: { name: cust.name, address: cust.billingAddress, gstin: cust.gstin, stateCode: cust.stateCode }, isB2B: cust.type === 'B2B', placeOfSupply: cust.stateCode,
      reverseCharge: false, lines, totals, lockedAt: `${date}T10:00:00.000Z`,
    };
    inv.meta = seedMeta(metaRng, { prefix: spec.prefix, date, termsDays: cust.termsDays, b2b: inv.isB2B, destination: cust.city, seq: seq[fy], bigOrInter: supply === 'inter' || totals.grandTotal > 5_000_000 });
    invoices.push(inv);
    const notDue = inv.dueDate >= today;
    const roll = rng.next();
    const outcome = notDue ? (roll < 0.36 ? 'paid' : roll < 0.7 ? 'unpaid' : 'partly') : (roll < 0.74 ? 'paid' : roll < 0.93 ? 'unpaid' : 'partly');
    const payDate = () => { const p = addDays(date, rng.int(0, cust.termsDays + 3)); return p > today ? today : p; };
    if (outcome === 'paid') payments.push({ id: `pay-${id}-1`, invoiceId: id, amount: totals.grandTotal, method: rng.pick(METHODS), date: payDate(), reference: `REF${rng.int(100000, 999999)}` });
    else if (outcome === 'partly') payments.push({ id: `pay-${id}-1`, invoiceId: id, amount: Math.max(10_000, Math.floor((totals.grandTotal * 0.4) / 100) * 100), method: rng.pick(METHODS), date: payDate(), reference: `REF${rng.int(100000, 999999)}` });
  });

  return { business, customers, items, invoices, payments, creditNotes: [], counters: { invoice: { ...seq }, creditNote: {} }, auditLog: [], events: [] };
}

/** The linked clients other than Shree Sai Electricals. Deterministic for a given `today`. */
export function generateClientWorkspaces(today: string): Record<string, Workspace> {
  return Object.fromEntries(SPECS.map((s) => [s.id, build(s, today)]));
}
