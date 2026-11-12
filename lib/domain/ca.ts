import JSZip from 'jszip';
import type { AuditEntry, Business, Customer, InvoiceEvent, Item } from './entities';
import { caPackBuffer, caPackFileName } from './exports';
import type { Counters } from './numbering';
import { allReconciled, buildReports } from './reportTables';
import { invoicesForMonth } from './reports';
import type { CreditNote, Invoice, Payment } from './types';

/** Everything that belongs to ONE business. Workspaces never share records. */
export interface Workspace {
  business: Business;
  customers: Customer[];
  items: Item[];
  invoices: Invoice[];
  payments: Payment[];
  creditNotes: CreditNote[];
  counters: { invoice: Counters; creditNote: Counters };
  auditLog: AuditEntry[];
  events: InvoiceEvent[];
}

/** The fictional CA firm the app is re-branded as in CA view. */
export const CA_FIRM = {
  name: 'Kalyan Tax Associates',
  short: 'KTA',
  tagline: 'Chartered Accountants · Kalyan',
  // accent: teal to sky (the owner app uses saffron-gold)
  accentFrom: '#2DD4BF',
  accentTo: '#0EA5E9',
};

export interface ClientRow {
  id: string;
  name: string;
  kind: string;
  gstin: string;
  invoices: number;
  taxable: number;
  outputTax: number;
  exportReady: boolean;
  reconDiffs: string[];
  lastActivity: string | null; // ISO date
}

/** One line per linked client for the CA's client list (this month, net of credit notes for tax). */
export function clientRow(ws: Workspace, ym: string): ClientRow {
  const invs = invoicesForMonth(ws.invoices, ym);
  const cns = ws.creditNotes.filter((c) => c.date.startsWith(ym));
  const reports = buildReports({ invoices: ws.invoices, creditNotes: ws.creditNotes, ym, b2clThreshold: ws.business.settings.b2clThreshold });
  const recon = allReconciled(reports, invs, ws.business.settings.b2clThreshold);
  const dates = [
    ...ws.invoices.filter((i) => i.lockedAt).map((i) => (i.lockedAt as string).slice(0, 10)),
    ...ws.payments.map((p) => p.date), ...ws.creditNotes.map((c) => c.date), ...ws.events.map((e) => e.at.slice(0, 10)),
  ].sort();
  return {
    id: ws.business.id, name: ws.business.tradeName, kind: ws.business.kind ?? '', gstin: ws.business.gstin,
    invoices: invs.length,
    taxable: invs.reduce((a, i) => a + i.totals.taxable, 0),
    outputTax: invs.reduce((a, i) => a + i.totals.totalTax, 0) - cns.reduce((a, c) => a + c.totals.totalTax, 0),
    exportReady: recon.ok && invs.length > 0,
    reconDiffs: recon.diffs,
    lastActivity: dates.length ? dates[dates.length - 1] : null,
  };
}

/** One CA pack (.xlsx) per client, zipped. Each workbook is built from that client's own data only. */
export async function buildAllPacks(workspaces: Workspace[], ym: string, today: string): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const ws of workspaces) {
    const reports = buildReports({ invoices: ws.invoices, creditNotes: ws.creditNotes, ym, b2clThreshold: ws.business.settings.b2clThreshold });
    const buf = await caPackBuffer({ business: ws.business, ym, reports, invoices: invoicesForMonth(ws.invoices, ym), generatedOn: today });
    zip.file(caPackFileName(ws.business, ym), buf);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
