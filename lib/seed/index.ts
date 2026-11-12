import type { AuditEntry, Business, Customer, InvoiceEvent, Item, Prospect } from '../domain/entities';
import { rateOn } from '../domain/entities';
import { roundToRupee } from '../domain/money';
import { financialYear, formatCreditNoteNumber, formatInvoiceNumber, type Counters } from '../domain/numbering';
import { addDays, createCreditNote, invoiceBalance } from '../domain/payments';
import { computeInvoice, supplyType } from '../domain/tax';
import type { CreditNote, Invoice, LineInput, Payment } from '../domain/types';
import { BUSINESS, buildCustomers, buildItems } from './catalog';
import { makeRng, type Rng } from './prng';

export const SEED_STRING = 'billease-demo';
export const SEED_INVOICE_COUNT = 110;

export interface SeedData {
  business: Business;
  customers: Customer[];
  items: Item[];
  invoices: Invoice[];
  payments: Payment[];
  creditNotes: CreditNote[];
  counters: { invoice: Counters; creditNote: Counters };
  auditLog: AuditEntry[];
  events: InvoiceEvent[];
  prospect: Prospect;
  generatedFor: string; // the "today" the dates are relative to
}

const METHODS = ['UPI', 'UPI', 'UPI', 'NEFT/IMPS', 'Cash', 'Cheque', 'Card'];

function dayOfWeek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function buildLines(rng: Rng, items: Item[], date: string, b2b: boolean, idPrefix: string): LineInput[] {
  const n = b2b ? rng.int(1, 5) : rng.int(1, 3);
  const chosen = new Set<number>();
  while (chosen.size < n) chosen.add(rng.int(0, items.length - 1));
  return [...chosen].map((ix, k) => {
    const it = items[ix];
    const r = rateOn(it, date);
    let qty: number;
    if (it.unit === 'Job') qty = 1;
    else if (r.ratePaise < 10_000) qty = b2b ? rng.int(20, 200) : rng.int(2, 12);
    else if (r.ratePaise < 100_000) qty = b2b ? rng.int(4, 40) : rng.int(1, 4);
    else qty = b2b ? rng.int(1, 10) : rng.int(1, 2);
    const disc = b2b && rng.chance(0.2) ? rng.pick([2, 3, 5, 10]) : 0;
    return {
      id: `${idPrefix}-l${k + 1}`, description: it.name, hsn: it.hsn, qty, unit: it.unit, ratePaise: r.ratePaise,
      discount: { kind: 'percent' as const, value: disc }, gstRate: r.gstRate,
    };
  });
}

/**
 * Deterministic dataset. Same `today` => byte-identical output. Dates are relative to `today`
 * so "this month" always has data. Status is assigned after the date so the stored payments
 * and due dates are consistent with the status mix (~60% paid, 20% unpaid, 12% overdue, 8% partly).
 */
export function generateSeed(today: string): SeedData {
  const rng = makeRng(SEED_STRING);
  const daysAgo = (n: number) => addDays(today, -n);
  const business = structuredClone(BUSINESS);
  const customers = buildCustomers(rng);
  const items = buildItems(today, daysAgo);
  const products = items.filter((i) => i.category !== 'Services');
  const b2bAll = customers.filter((c) => c.type === 'B2B');
  const gujarat = b2bAll.filter((c) => c.stateCode === '24');
  const mhB2B = b2bAll.filter((c) => c.stateCode === '27');
  const b2c = customers.filter((c) => c.type === 'B2C');
  const sneha = customers.find((c) => c.name.startsWith('Sneha'))!;

  // 110 dates over the last 90 days; Sundays carry little volume.
  const weights = Array.from({ length: 90 }, (_, d) => (dayOfWeek(daysAgo(d)) === 0 ? 0.25 : 1) * (1 + 3 * Math.exp(-d / 18)));
  const offsets: number[] = [];
  for (let i = 0; i < SEED_INVOICE_COUNT; i++) offsets.push(rng.weighted(weights));
  offsets.sort((a, b) => b - a); // oldest first
  const specialIdx = offsets.findIndex((o) => o <= 21 && dayOfWeek(daysAgo(o)) !== 0); // the Rs 50,000+ B2C

  type Draft = { date: string; customer: Customer; lines: LineInput[]; special: boolean };
  const drafts: Draft[] = offsets.map((o, i) => {
    const date = daysAgo(o);
    const id = `inv-${String(i + 1).padStart(4, '0')}`;
    if (i === specialIdx) {
      const get = (n: string) => items.find((x) => x.name.startsWith(n))!;
      const mk = (n: string, qty: number, k: number): LineInput => {
        const it = get(n); const r = rateOn(it, date);
        return { id: `${id}-l${k}`, description: it.name, hsn: it.hsn, qty, unit: it.unit, ratePaise: r.ratePaise, discount: { kind: 'percent', value: 0 }, gstRate: r.gstRate };
      };
      return { date, customer: sneha, special: true, lines: [mk('Solar Street Light 30W', 6, 1), mk('Ceiling Fan', 3, 2), mk('Electrical Installation', 1, 3)] };
    }
    const roll = rng.next();
    if (roll < 0.12) return { date, customer: rng.pick(gujarat), lines: buildLines(rng, products, date, true, id), special: false };
    if (roll < 0.70) {
      const lines = buildLines(rng, rng.chance(0.15) ? items : products, date, true, id);
      return { date, customer: rng.pick(mhB2B), lines, special: false };
    }
    // Walk-in B2C: kept under the Rs 50,000 line so only the special invoice needs full buyer details.
    let lines = buildLines(rng, products, date, false, id);
    while (computeInvoice(lines, 'intra', true).grandTotal >= 4_500_000 && lines.length > 1) lines = lines.slice(0, -1);
    if (computeInvoice(lines, 'intra', true).grandTotal >= 4_500_000) lines = [{ ...lines[0], qty: 1 }];
    return { date, customer: rng.pick(b2c), lines, special: false };
  });

  // Numbering: consecutive per FY; the current FY's last number lands at 0418.
  const fyCount: Record<string, number> = {};
  for (const d of drafts) fyCount[financialYear(d.date)] = (fyCount[financialYear(d.date)] ?? 0) + 1;
  const curFy = financialYear(today);
  const seq: Counters = {};
  for (const fy of Object.keys(fyCount)) seq[fy] = fy === curFy ? Math.max(0, 418 - fyCount[fy]) : 0;

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  drafts.forEach((d, i) => {
    const fy = financialYear(d.date);
    seq[fy] += 1;
    const supply = supplyType(d.customer.stateCode, business.stateCode);
    const totals = computeInvoice(d.lines, supply, business.settings.roundOff);
    const inv: Invoice = {
      id: `inv-${String(i + 1).padStart(4, '0')}`,
      number: formatInvoiceNumber(business.seriesPrefix, fy, seq[fy]),
      date: d.date,
      dueDate: addDays(d.date, d.customer.termsDays),
      customerId: d.customer.id,
      customer: { name: d.customer.name, address: d.customer.billingAddress, gstin: d.customer.gstin, stateCode: d.customer.stateCode },
      isB2B: d.customer.type === 'B2B',
      placeOfSupply: d.customer.stateCode,
      reverseCharge: false,
      lines: d.lines,
      totals,
      lockedAt: `${d.date}T10:00:00.000Z`,
    };
    invoices.push(inv);

    const notDue = inv.dueDate >= today;
    const roll = rng.next();
    const outcome: 'paid' | 'unpaid' | 'partly' = d.special ? 'paid'
      : notDue ? (roll < 0.36 ? "paid" : roll < 0.66 ? "unpaid" : "partly")
        : (roll < 0.78 ? "paid" : roll < 0.93 ? "unpaid" : "partly");
    const payDate = () => {
      const p = addDays(d.date, rng.int(0, d.customer.termsDays + 3));
      return p > today ? today : p;
    };
    const total = totals.grandTotal;
    if (outcome === 'paid') {
      payments.push({ id: `pay-${inv.id}-1`, invoiceId: inv.id, amount: total, method: rng.pick(METHODS), date: payDate(), reference: `REF${rng.int(100000, 999999)}` });
    } else if (outcome === 'partly') {
      const part = Math.max(10_000, roundToRupee(Math.floor(total * (0.3 + rng.next() * 0.3))));
      payments.push({ id: `pay-${inv.id}-1`, invoiceId: inv.id, amount: Math.min(part, total - 10_000), method: rng.pick(METHODS), date: payDate(), reference: `REF${rng.int(100000, 999999)}` });
    }
  });

  // Two credit notes against older, unpaid B2B invoices (balance stays positive).
  const cnCounters: Counters = {};
  const creditNotes: CreditNote[] = [];
  const candidates = invoices.filter((inv) => inv.isB2B && inv.date <= daysAgo(12)
    && !payments.some((p) => p.invoiceId === inv.id) && inv.lines.some((l) => l.qty >= 4));
  for (const inv of candidates.slice(0, 2)) {
    const line = inv.lines.find((l) => l.qty >= 4)!;
    const fy = financialYear(addDays(inv.date, 6));
    cnCounters[fy] = (cnCounters[fy] ?? 0) + 1;
    const cn = createCreditNote(inv, {
      id: `cn-${cnCounters[fy]}`, number: formatCreditNoteNumber(business.seriesPrefix, fy, cnCounters[fy]),
      date: addDays(inv.date, 6), reason: creditReason(cnCounters[fy]), qtyByLine: { [line.id]: Math.floor(line.qty / 4) },
    });
    if (invoiceBalance(inv, payments, [cn]) > 0) creditNotes.push(cn);
  }

  const counters = { invoice: { ...seq }, creditNote: cnCounters };
  return { business, customers, items, invoices, payments, creditNotes, counters, auditLog: [], events: [], prospect: { name: '', phone: '' }, generatedFor: today };
}

const creditReason = (n: number) => (n === 1 ? 'Sales return' : 'Rate difference');
