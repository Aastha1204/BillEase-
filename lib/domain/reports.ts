import type { Paise } from './money';
import type { CreditNote, Invoice, InvoiceTotals, RateBucket } from './types';

export type Category = 'B2B' | 'B2CL' | 'B2CS';
export const B2CL_DEFAULT_THRESHOLD: Paise = 10_000_000; // Rs 1,00,000

/** B2CL = inter-state B2C with invoice value ABOVE the threshold; all other B2C = B2CS. */
export function classify(inv: Pick<Invoice, 'isB2B' | 'totals'>, threshold = B2CL_DEFAULT_THRESHOLD): Category {
  if (inv.isB2B) return 'B2B';
  return inv.totals.supply === 'inter' && inv.totals.grandTotal > threshold ? 'B2CL' : 'B2CS';
}

const inMonth = (iso: string, ym: string) => iso.startsWith(ym);
const issued = (invs: Invoice[]) => invs.filter((i) => i.lockedAt && i.number && !i.cancelled);
export const invoicesForMonth = (invs: Invoice[], ym: string) => issued(invs).filter((i) => inMonth(i.date, ym));

/** GST summary by rate across invoices (credit notes are reported separately). */
export function gstSummaryByRate(invs: Invoice[]): RateBucket[] {
  const m = new Map<number, RateBucket>();
  for (const inv of invs) {
    for (const r of inv.totals.lines) {
      const b = m.get(r.gstRate) ?? { gstRate: r.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
      b.taxable += r.taxable; b.cgst += r.cgst; b.sgst += r.sgst; b.igst += r.igst;
      b.totalTax += r.cgst + r.sgst + r.igst;
      m.set(r.gstRate, b);
    }
  }
  return [...m.values()].sort((a, b) => a.gstRate - b.gstRate);
}

export interface HsnRow { hsn: string; unit: string; qty: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; gstRate: number }
/** HSN summary, split B2B / B2C as in GSTR-1 Table 12. */
export function hsnSummary(invs: Invoice[], segment: 'B2B' | 'B2C'): HsnRow[] {
  const m = new Map<string, HsnRow>();
  for (const inv of invs) {
    if ((segment === 'B2B') !== inv.isB2B) continue;
    inv.lines.forEach((l, idx) => {
      const r = inv.totals.lines[idx];
      const key = `${l.hsn}|${l.unit}|${r.gstRate}`;
      const row = m.get(key) ?? { hsn: l.hsn, unit: l.unit, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gstRate: r.gstRate };
      row.qty += l.qty; row.taxable += r.taxable; row.cgst += r.cgst; row.sgst += r.sgst; row.igst += r.igst;
      m.set(key, row);
    });
  }
  return [...m.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.gstRate - b.gstRate);
}

export interface CnRow { number: string; date: string; invoiceNumber: string; invoiceDate: string; customer: string; reason: string; taxable: Paise; tax: Paise; total: Paise }
export function creditNotesRegister(cns: CreditNote[], ym?: string): CnRow[] {
  return cns.filter((c) => !ym || inMonth(c.date, ym)).map((c) => ({
    number: c.number, date: c.date, invoiceNumber: c.invoiceNumber, invoiceDate: c.invoiceDate,
    customer: c.customerName, reason: c.reason, taxable: c.totals.taxable, tax: c.totals.totalTax, total: c.totals.grandTotal,
  }));
}

export interface DocsIssuedRow { series: string; from: string; to: string; totalIssued: number; cancelled: number }
/** Table 13 style: consecutive range per series (prefix/FY) with cancelled count. */
export function documentsIssued(invs: Invoice[], cns: CreditNote[]): DocsIssuedRow[] {
  const rows: DocsIssuedRow[] = [];
  const groups = new Map<string, Invoice[]>();
  for (const inv of invs.filter((i) => i.lockedAt && i.number)) {
    const series = inv.number!.split('/').slice(0, -1).join('/');
    groups.set(series, [...(groups.get(series) ?? []), inv]);
  }
  for (const [series, list] of groups) {
    const nums = list.map((i) => i.number!).sort();
    rows.push({ series, from: nums[0], to: nums[nums.length - 1], totalIssued: list.length, cancelled: list.filter((i) => i.cancelled).length });
  }
  const cg = new Map<string, string[]>();
  for (const c of cns) {
    const series = c.number.split('/').slice(0, -1).join('/');
    cg.set(series, [...(cg.get(series) ?? []), c.number]);
  }
  for (const [series, nums] of cg) {
    nums.sort();
    rows.push({ series, from: nums[0], to: nums[nums.length - 1], totalIssued: nums.length, cancelled: 0 });
  }
  return rows.sort((a, b) => a.series.localeCompare(b.series));
}

export interface Reconciliation { ok: boolean; diffs: string[] }
/**
 * Compares the report aggregation with an independent sum of the underlying invoice lines,
 * and each invoice's stored totals with its own lines, to the paisa.
 */
export function reconcile(invs: Invoice[]): Reconciliation {
  const diffs: string[] = [];
  const sumLines = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  const sumTotals = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  for (const inv of invs) {
    const t: InvoiceTotals = inv.totals;
    const own = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    for (const r of t.lines) { own.taxable += r.taxable; own.cgst += r.cgst; own.sgst += r.sgst; own.igst += r.igst; }
    for (const k of ['taxable', 'cgst', 'sgst', 'igst'] as const) {
      if (own[k] !== t[k]) diffs.push(`${inv.number ?? inv.id}: ${k} ${t[k]} != lines ${own[k]}`);
      sumLines[k] += own[k];
      sumTotals[k] += t[k];
    }
  }
  const rate = gstSummaryByRate(invs);
  for (const k of ['taxable', 'cgst', 'sgst', 'igst'] as const) {
    const fromReport = rate.reduce((a, b) => a + b[k], 0);
    if (fromReport !== sumLines[k]) diffs.push(`GST summary ${k} ${fromReport} != lines ${sumLines[k]}`);
  }
  for (const seg of ['B2B', 'B2C'] as const) {
    const rows = hsnSummary(invs, seg);
    const want = invs.filter((i) => (seg === 'B2B') === i.isB2B).reduce((a, i) => a + i.totals.taxable, 0);
    const got = rows.reduce((a, r) => a + r.taxable, 0);
    if (got !== want) diffs.push(`HSN ${seg} taxable ${got} != ${want}`);
  }
  return { ok: diffs.length === 0, diffs };
}
