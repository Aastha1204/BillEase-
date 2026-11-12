import { formatDate, toDecimalString, type Paise } from './money';
import { classify, creditNotesRegister, documentsIssued, gstSummaryByRate, hsnSummary, invoicesForMonth } from './reports';
import { stateLabel } from './states';
import type { CreditNote, Invoice } from './types';

export type ColType = 'text' | 'money' | 'int' | 'qty' | 'rate' | 'date';
export interface Col { key: string; header: string; type: ColType; width: number }
export type Cell = string | number | null;
export interface Recon { ok: boolean; diffs: string[] }
export interface ReportTable {
  id: string;
  title: string;
  columns: Col[];
  rows: Cell[][];
  totals: Cell[] | null; // aligned with columns; null = not summed
  recon: Recon;
  note?: string;
}

export interface ReportInput { invoices: Invoice[]; creditNotes: CreditNote[]; ym: string; b2clThreshold: Paise }

const col = (key: string, header: string, type: ColType, width: number): Col => ({ key, header, type, width });
const SUM_TYPES: ColType[] = ['money'];

function totalsRow(columns: Col[], rows: Cell[][]): Cell[] {
  return columns.map((c, i) => {
    if (i === 0) return 'Total';
    if (!SUM_TYPES.includes(c.type)) return null;
    return rows.reduce((a, r) => a + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
  });
}
const colTotal = (t: Cell[], columns: Col[], key: string) => (t[columns.findIndex((c) => c.key === key)] as number) ?? 0;

/** Independent sum of the underlying invoice LINES (not the stored invoice totals). */
export function sumLines(invs: Invoice[]) {
  const s = { taxable: 0, cgst: 0, sgst: 0, igst: 0, lineTotal: 0, roundOff: 0 };
  for (const inv of invs) {
    for (const r of inv.totals.lines) { s.taxable += r.taxable; s.cgst += r.cgst; s.sgst += r.sgst; s.igst += r.igst; s.lineTotal += r.total; }
    s.roundOff += inv.totals.roundOff;
  }
  return s;
}

function compare(label: string, got: number, want: number, diffs: string[]) {
  if (got !== want) diffs.push(`${label}: report ${toDecimalString(got)} vs invoice lines ${toDecimalString(want)}`);
}
const recon = (diffs: string[]): Recon => ({ ok: diffs.length === 0, diffs });

function reconcileAmounts(columns: Col[], totals: Cell[], want: { taxable: number; cgst: number; sgst: number; igst: number }, label: string): Recon {
  const diffs: string[] = [];
  for (const k of ['taxable', 'cgst', 'sgst', 'igst'] as const) {
    if (columns.some((c) => c.key === k)) compare(`${label} ${k.toUpperCase()}`, colTotal(totals, columns, k), want[k], diffs);
  }
  return recon(diffs);
}

export function salesRegister(invs: Invoice[]): ReportTable {
  const columns = [col('no', 'Invoice no.', 'text', 18), col('date', 'Date', 'date', 13), col('customer', 'Customer', 'text', 32), col('gstin', 'GSTIN', 'text', 18),
    col('type', 'Type', 'text', 8), col('pos', 'Place of supply', 'text', 22), col('taxable', 'Taxable value', 'money', 15), col('cgst', 'CGST', 'money', 13),
    col('sgst', 'SGST', 'money', 13), col('igst', 'IGST', 'money', 13), col('round', 'Round off', 'money', 11), col('total', 'Invoice value', 'money', 16)];
  const sorted = [...invs].sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? '').localeCompare(b.number ?? ''));
  const rows: Cell[][] = sorted.map((i) => [i.number, i.date, i.customer.name, i.customer.gstin ?? '', i.isB2B ? 'B2B' : 'B2C', stateLabel(i.placeOfSupply),
    i.totals.taxable, i.totals.cgst, i.totals.sgst, i.totals.igst, i.totals.roundOff, i.totals.grandTotal]);
  const totals = totalsRow(columns, rows);
  const want = sumLines(invs);
  const diffs = reconcileAmounts(columns, totals, want, 'Sales register').diffs;
  // Invoice value must equal taxable + tax + round off, summed from the lines.
  compare('Sales register invoice value', colTotal(totals, columns, 'total'), want.lineTotal + want.roundOff, diffs);
  return { id: 'sales', title: 'Sales register', columns, rows, totals, recon: recon(diffs) };
}

export function gstByRate(invs: Invoice[]): ReportTable {
  const columns = [col('rate', 'GST rate', 'rate', 12), col('taxable', 'Taxable value', 'money', 16), col('cgst', 'CGST', 'money', 14), col('sgst', 'SGST', 'money', 14),
    col('igst', 'IGST', 'money', 14), col('tax', 'Total tax', 'money', 14)];
  const rows: Cell[][] = gstSummaryByRate(invs).map((b) => [b.gstRate, b.taxable, b.cgst, b.sgst, b.igst, b.totalTax]);
  const totals = totalsRow(columns, rows);
  const want = sumLines(invs);
  const diffs = reconcileAmounts(columns, totals, want, 'GST summary').diffs;
  compare('GST summary total tax', colTotal(totals, columns, 'tax'), want.cgst + want.sgst + want.igst, diffs);
  return { id: 'gst-rate', title: 'GST summary by rate', columns, rows, totals, recon: recon(diffs), note: 'Output tax before input tax credit.' };
}

export function hsnTable(invs: Invoice[], segment: 'B2B' | 'B2C'): ReportTable {
  const columns = [col('hsn', 'HSN/SAC', 'text', 12), col('unit', 'UQC', 'text', 9), col('qty', 'Quantity', 'qty', 12), col('rate', 'GST rate', 'rate', 10), col('taxable', 'Taxable value', 'money', 16),
    col('cgst', 'CGST', 'money', 14), col('sgst', 'SGST', 'money', 14), col('igst', 'IGST', 'money', 14), col('tax', 'Total tax', 'money', 14)];
  const rows: Cell[][] = hsnSummary(invs, segment).map((r) => [r.hsn, r.unit, r.qty, r.gstRate, r.taxable, r.cgst, r.sgst, r.igst, r.cgst + r.sgst + r.igst]);
  const totals = totalsRow(columns, rows);
  const subset = invs.filter((i) => (segment === 'B2B') === i.isB2B);
  const want = sumLines(subset);
  const diffs = reconcileAmounts(columns, totals, want, `HSN ${segment}`).diffs;
  return { id: `hsn-${segment.toLowerCase()}`, title: `HSN summary (${segment})`, columns, rows, totals, recon: recon(diffs), note: 'GSTR-1 Table 12 is split into B2B and B2C.' };
}

export function b2bTable(invs: Invoice[]): ReportTable {
  const columns = [col('gstin', 'GSTIN of recipient', 'text', 18), col('customer', 'Receiver name', 'text', 30), col('no', 'Invoice no.', 'text', 18), col('date', 'Date', 'date', 13),
    col('value', 'Invoice value', 'money', 15), col('pos', 'Place of supply', 'text', 22), col('rate', 'GST rate', 'rate', 10), col('taxable', 'Taxable value', 'money', 15),
    col('cgst', 'CGST', 'money', 13), col('sgst', 'SGST', 'money', 13), col('igst', 'IGST', 'money', 13)];
  const rows: Cell[][] = [];
  const b2b = invs.filter((i) => classify(i) === 'B2B');
  for (const i of b2b) for (const b of i.totals.byRate) rows.push([i.customer.gstin ?? '', i.customer.name, i.number, i.date, i.totals.grandTotal, stateLabel(i.placeOfSupply), b.gstRate, b.taxable, b.cgst, b.sgst, b.igst]);
  // Invoice value repeats on each rate row, so it is not summed here.
  const totals = columns.map((c, k) => (k === 0 ? 'Total' : ['taxable', 'cgst', 'sgst', 'igst'].includes(c.key) ? rows.reduce((a, r) => a + (r[k] as number), 0) : null));
  return { id: 'b2b', title: 'B2B invoices', columns, rows, totals, recon: reconcileAmounts(columns, totals, sumLines(b2b), 'B2B'), note: 'Rate-wise rows per invoice, as in GSTR-1 Table 4.' };
}

export function b2clTable(invs: Invoice[], threshold: Paise): ReportTable {
  const columns = [col('no', 'Invoice no.', 'text', 18), col('date', 'Date', 'date', 13), col('value', 'Invoice value', 'money', 15), col('pos', 'Place of supply', 'text', 22),
    col('rate', 'GST rate', 'rate', 10), col('taxable', 'Taxable value', 'money', 15), col('igst', 'IGST', 'money', 13)];
  const rows: Cell[][] = [];
  const l = invs.filter((i) => classify(i, threshold) === 'B2CL');
  for (const i of l) for (const b of i.totals.byRate) rows.push([i.number, i.date, i.totals.grandTotal, stateLabel(i.placeOfSupply), b.gstRate, b.taxable, b.igst]);
  const totals = columns.map((c, k) => (k === 0 ? 'Total' : ['taxable', 'igst'].includes(c.key) ? rows.reduce((a, r) => a + (r[k] as number), 0) : null));
  return { id: 'b2cl', title: 'B2C large (B2CL)', columns, rows, totals, recon: reconcileAmounts(columns, totals, sumLines(l), 'B2CL'),
    note: `Inter-state B2C invoices above ₹${(threshold / 100).toLocaleString('en-IN')}.` };
}

export function b2csTable(invs: Invoice[], threshold: Paise): ReportTable {
  const columns = [col('pos', 'Place of supply', 'text', 24), col('rate', 'GST rate', 'rate', 10), col('taxable', 'Taxable value', 'money', 16), col('cgst', 'CGST', 'money', 14),
    col('sgst', 'SGST', 'money', 14), col('igst', 'IGST', 'money', 14)];
  const s = invs.filter((i) => classify(i, threshold) === 'B2CS');
  const m = new Map<string, { pos: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const i of s) for (const r of i.totals.lines) {
    const k = `${i.placeOfSupply}|${r.gstRate}`;
    const e = m.get(k) ?? { pos: i.placeOfSupply, rate: r.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += r.taxable; e.cgst += r.cgst; e.sgst += r.sgst; e.igst += r.igst; m.set(k, e);
  }
  const rows: Cell[][] = [...m.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate).map((e) => [stateLabel(e.pos), e.rate, e.taxable, e.cgst, e.sgst, e.igst]);
  const totals = totalsRow(columns, rows);
  return { id: 'b2cs', title: 'B2C small (B2CS)', columns, rows, totals, recon: reconcileAmounts(columns, totals, sumLines(s), 'B2CS'), note: 'All other B2C invoices, summarised by place of supply and rate.' };
}

export function creditNotesTable(cns: CreditNote[], ym: string): ReportTable {
  const columns = [col('no', 'Credit note no.', 'text', 20), col('date', 'Date', 'date', 13), col('inv', 'Original invoice', 'text', 18), col('invDate', 'Invoice date', 'date', 13),
    col('customer', 'Customer', 'text', 28), col('reason', 'Reason', 'text', 22), col('taxable', 'Taxable value', 'money', 15), col('tax', 'Tax', 'money', 13), col('total', 'Credit value', 'money', 15)];
  const rows: Cell[][] = creditNotesRegister(cns, ym).map((r) => [r.number, r.date, r.invoiceNumber, r.invoiceDate, r.customer, r.reason, r.taxable, r.tax, r.total]);
  const totals = totalsRow(columns, rows);
  const mine = cns.filter((c) => c.date.startsWith(ym));
  const diffs: string[] = [];
  compare('Credit notes taxable', colTotal(totals, columns, 'taxable'), mine.reduce((a, c) => a + c.totals.lines.reduce((x, r) => x + r.taxable, 0), 0), diffs);
  compare('Credit notes tax', colTotal(totals, columns, 'tax'), mine.reduce((a, c) => a + c.totals.lines.reduce((x, r) => x + r.cgst + r.sgst + r.igst, 0), 0), diffs);
  return { id: 'credit-notes', title: 'Credit notes register', columns, rows, totals, recon: recon(diffs) };
}

export function documentsTable(invs: Invoice[], cns: CreditNote[]): ReportTable {
  const columns = [col('series', 'Series', 'text', 22), col('from', 'From', 'text', 20), col('to', 'To', 'text', 20), col('total', 'Total issued', 'int', 13), col('cancelled', 'Cancelled', 'int', 11)];
  const docs = documentsIssued(invs, cns);
  const rows: Cell[][] = docs.map((d) => [d.series, d.from, d.to, d.totalIssued, d.cancelled]);
  const totals: Cell[] = ['Total', null, null, rows.reduce((a, r) => a + (r[3] as number), 0), rows.reduce((a, r) => a + (r[4] as number), 0)];
  const diffs: string[] = [];
  // Every issued document is counted once, and each series is a gap-free run.
  const want = invs.filter((i) => i.lockedAt && i.number).length + cns.length;
  if (totals[3] !== want) diffs.push(`Documents issued: report ${totals[3]} vs ${want} issued`);
  const tail = (n: string) => Number(n.split('/').pop());
  for (const r of rows) if (tail(r[2] as string) - tail(r[1] as string) + 1 !== r[3]) diffs.push(`Series ${r[0]} has a gap between ${r[1]} and ${r[2]}`);
  return { id: 'docs', title: 'Documents issued', columns, rows, totals, recon: recon(diffs), note: 'GSTR-1 Table 13 style.' };
}

export type TabId = 'sales' | 'gst-rate' | 'hsn' | 'b2b-b2cl-b2cs' | 'credit-notes' | 'docs';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'sales', label: 'Sales register' }, { id: 'gst-rate', label: 'GST by rate' }, { id: 'hsn', label: 'HSN summary' },
  { id: 'b2b-b2cl-b2cs', label: 'B2B / B2CL / B2CS' }, { id: 'credit-notes', label: 'Credit notes' }, { id: 'docs', label: 'Documents issued' },
];

/** Every table for a month, grouped by UI tab. */
export function buildReports(inp: ReportInput): Record<TabId, ReportTable[]> {
  const invs = invoicesForMonth(inp.invoices, inp.ym);
  const cns = inp.creditNotes.filter((c) => c.date.startsWith(inp.ym));
  return {
    sales: [salesRegister(invs)],
    'gst-rate': [gstByRate(invs)],
    hsn: [hsnTable(invs, 'B2B'), hsnTable(invs, 'B2C')],
    'b2b-b2cl-b2cs': [b2bTable(invs), b2clTable(invs, inp.b2clThreshold), b2csTable(invs, inp.b2clThreshold)],
    'credit-notes': [creditNotesTable(inp.creditNotes, inp.ym)],
    docs: [documentsTable(invs, cns)],
  };
}
export const allTables = (r: Record<TabId, ReportTable[]>) => TABS.flatMap((t) => r[t.id]);

/**
 * Whole-period check on top of the per-table checks: every invoice is classified exactly once
 * (B2B + B2CL + B2CS taxable equals the sales register taxable).
 */
export function crossCheck(r: Record<TabId, ReportTable[]>, invs: Invoice[], threshold: Paise): Recon {
  const diffs: string[] = [];
  const parts = invs.reduce((a, i) => { a[classify(i, threshold)] += i.totals.taxable; return a; }, { B2B: 0, B2CL: 0, B2CS: 0 });
  const reg = r.sales[0];
  compare('B2B+B2CL+B2CS taxable', parts.B2B + parts.B2CL + parts.B2CS, colTotal(reg.totals!, reg.columns, 'taxable'), diffs);
  return recon(diffs);
}

export function allReconciled(r: Record<TabId, ReportTable[]>, invs: Invoice[], threshold: Paise): Recon {
  const diffs = [...allTables(r).flatMap((t) => t.recon.diffs.map((d) => `${t.title}: ${d}`)), ...crossCheck(r, invs, threshold).diffs];
  return recon(diffs);
}

// ---- cell formatting shared by CSV and the UI ----
export function cellText(c: Col, v: Cell): string {
  if (v === null || v === undefined || v === '') return '';
  // Labels such as "Total" in a numeric column are printed as they are.
  if (typeof v === 'string' && !(c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v))) return v;
  if (c.type === 'money') return toDecimalString(v as number);
  if (c.type === 'date') return formatDate(v as string);
  if (c.type === 'rate') return `${v}%`;
  return String(v);
}

export function tableToCsvRows(t: ReportTable): (string | number)[][] {
  const out: (string | number)[][] = [t.columns.map((c) => c.header)];
  for (const r of t.rows) out.push(r.map((v, i) => cellText(t.columns[i], v)));
  if (t.totals && t.rows.length) out.push(t.totals.map((v, i) => (v === null ? '' : cellText(t.columns[i], v))));
  return out;
}
