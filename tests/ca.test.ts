// @vitest-environment node
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { renderToBuffer } from '@react-pdf/renderer';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAllPacks, clientRow, type Workspace } from '@/lib/domain/ca';
import { creditEffect, creditNoteAsInvoice } from '@/lib/domain/creditNote';
import { validateGstin } from '@/lib/domain/gstin';
import { invoiceBalance, remainingQty, createCreditNote } from '@/lib/domain/payments';
import { creditNotesRegister } from '@/lib/domain/reports';
import { buildReports } from '@/lib/domain/reportTables';
import { makePdfElement } from '@/lib/pdf/element';
import { generateSeed } from '@/lib/seed';
import { generateClientWorkspaces } from '@/lib/seed/clients';
import { OWNER_ID, todayIso, useApp, workspacesOf, WORKSPACE_ORDER } from '@/lib/store';

const TODAY = '2026-11-12';
const seed = generateSeed(TODAY);
const clients = generateClientWorkspaces(TODAY);
const owner: Workspace = { business: seed.business, customers: seed.customers, items: seed.items, invoices: seed.invoices, payments: seed.payments, creditNotes: seed.creditNotes, counters: seed.counters, auditLog: [], events: [] };
const all = [owner, ...Object.values(clients)];

describe('client businesses', () => {
  it('are the six fictional businesses with valid GSTINs, own series and a state each', () => {
    expect(all.map((w) => w.business.tradeName)).toEqual(['Shree Sai Electricals', 'Aarambh Interiors', 'Pixel Kraft Media', 'Om Hardware & Sanitary', 'Veer Bright Steels Pvt. Ltd.', 'Aarav Precision Works']);
    for (const w of all) expect(validateGstin(w.business.gstin).valid, w.business.tradeName).toBe(true);
    expect(new Set(all.map((w) => w.business.seriesPrefix)).size).toBe(6);
    expect(new Set(all.map((w) => w.business.stateCode)).size).toBeGreaterThanOrEqual(3);
  });
  it('services clients bill SAC codes; the trader bills goods HSN codes', () => {
    for (const id of ['biz-aarambh', 'biz-pixelkraft']) expect(clients[id].items.every((i) => i.hsn.startsWith('99')), id).toBe(true);
    expect(clients['biz-omhardware'].items.some((i) => !i.hsn.startsWith('99'))).toBe(true);
  });
  it('every invoice is issued, consecutive in its own series and self-consistent', () => {
    for (const w of Object.values(clients)) {
      const nums = w.invoices.map((i) => i.number!);
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums.every((n) => n.startsWith(w.business.seriesPrefix + '/') && n.length <= 16)).toBe(true);
      expect(w.invoices.length).toBeGreaterThan(8);
      expect(w.invoices.every((i) => i.lockedAt && i.totals.grandTotal > 0)).toBe(true);
    }
  });
  it('are deterministic for a given day', () => {
    expect(JSON.stringify(generateClientWorkspaces(TODAY))).toBe(JSON.stringify(clients));
  });
});

describe('data isolation between businesses', () => {
  it('no record id, invoice number, customer or GSTIN is shared across businesses', () => {
    const ids = (w: Workspace) => [...w.invoices.map((i) => i.id), ...w.customers.map((c) => c.id), ...w.items.map((i) => i.id), ...w.payments.map((p) => p.id)];
    const seen = new Map<string, string>();
    for (const w of all) for (const id of ids(w)) {
      expect(seen.has(id), `${id} appears in ${seen.get(id)} and ${w.business.tradeName}`).toBe(false);
      seen.set(id, w.business.tradeName);
    }
    const numbers = all.flatMap((w) => w.invoices.map((i) => i.number));
    expect(new Set(numbers).size).toBe(numbers.length);
    // every payment/credit note belongs to an invoice of the SAME business
    for (const w of all) {
      const inv = new Set(w.invoices.map((i) => i.id));
      expect(w.payments.every((p) => inv.has(p.invoiceId))).toBe(true);
      expect(w.creditNotes.every((c) => inv.has(c.invoiceId))).toBe(true);
      expect(w.invoices.every((i) => !i.customerId || w.customers.some((c) => c.id === i.customerId))).toBe(true);
    }
  });
  it('reports for one business never include another business invoices', () => {
    for (const w of all) {
      const r = buildReports({ invoices: w.invoices, creditNotes: w.creditNotes, ym: TODAY.slice(0, 7), b2clThreshold: w.business.settings.b2clThreshold });
      const own = new Set(w.invoices.map((i) => i.number));
      for (const row of r.sales[0].rows) expect(own.has(row[0] as string)).toBe(true);
    }
  });
});

describe('workspace switching in the store', () => {
  beforeEach(() => { useApp.getState().resetDemo(); useApp.getState().enterOwner(); });
  it('starts as the owner with the five clients stashed', () => {
    const s = useApp.getState();
    expect(s.activeId).toBe(OWNER_ID);
    expect(s.mode).toBe('owner');
    expect(Object.keys(s.others)).toHaveLength(5);
    expect(workspacesOf(s).map((w) => w.business.id)).toEqual(WORKSPACE_ORDER);
  });
  it('switching swaps the whole app context and switching back restores it exactly', () => {
    const before = JSON.stringify(workspacesOf(useApp.getState()));
    useApp.getState().switchWorkspace('biz-pixelkraft');
    const s = useApp.getState();
    expect(s.business.tradeName).toBe('Pixel Kraft Media');
    expect(s.invoices.every((i) => i.number!.startsWith('PKM/'))).toBe(true);
    expect(s.customers.every((c) => c.id.startsWith('biz-pixelkraft'))).toBe(true);
    expect(s.others[OWNER_ID].business.tradeName).toBe('Shree Sai Electricals');
    expect('biz-pixelkraft' in s.others).toBe(false);
    useApp.getState().switchWorkspace(OWNER_ID);
    expect(JSON.stringify(workspacesOf(useApp.getState()))).toBe(before);
  });
  it('changes made inside a client never leak into another business', () => {
    useApp.getState().switchWorkspace('biz-omhardware');
    const s = useApp.getState();
    const inv = s.invoices.find((i) => invoiceBalance(i, s.payments, s.creditNotes) > 0)!;
    const sseBefore = JSON.stringify(s.others[OWNER_ID]);
    s.recordPayment(inv.id, { amount: 100, date: todayIso(), method: 'Cash' });
    s.upsertCustomer({ id: 'omh-new', name: 'New Buyer', type: 'B2C', stateCode: '23', city: 'Indore', billingAddress: 'x', shippingAddress: 'x', phone: '', email: '', termsDays: 0 });
    expect(JSON.stringify(useApp.getState().others[OWNER_ID])).toBe(sseBefore);
    useApp.getState().switchWorkspace(OWNER_ID);
    const o = useApp.getState();
    expect(o.customers.some((c) => c.id === 'omh-new')).toBe(false);
    expect(o.payments.some((p) => p.invoiceId === inv.id)).toBe(false);
    expect(o.others['biz-omhardware'].customers.some((c) => c.id === 'omh-new')).toBe(true);
  });
  it('rejects an unknown business and enterOwner always returns to the owner data', () => {
    expect(() => useApp.getState().switchWorkspace('biz-nope')).toThrow(/Unknown business/);
    useApp.getState().enterCa();
    useApp.getState().switchWorkspace('biz-aarambh');
    useApp.getState().enterOwner();
    expect(useApp.getState().activeId).toBe(OWNER_ID);
    expect(useApp.getState().mode).toBe('owner');
  });
  it('reset keeps the view mode but restores every business', () => {
    useApp.getState().enterCa();
    useApp.getState().switchWorkspace('biz-aarambh');
    useApp.getState().resetDemo();
    const s = useApp.getState();
    expect(s.mode).toBe('ca');
    expect(s.activeId).toBe(OWNER_ID);
    expect(Object.keys(s.others)).toHaveLength(5);
  });
});

describe('credit notes', () => {
  beforeEach(() => { useApp.getState().resetDemo(); useApp.getState().enterOwner(); });
  const pick = () => {
    const s = useApp.getState();
    return s.invoices.find((i) => i.lockedAt && i.lines.some((l) => l.qty >= 4) && !s.creditNotes.some((c) => c.invoiceId === i.id) && invoiceBalance(i, s.payments, s.creditNotes) > 0)!;
  };
  it('a partial credit note gets the next number in its own series and reduces the balance', () => {
    const inv = pick();
    const s = useApp.getState();
    const before = invoiceBalance(inv, s.payments, s.creditNotes);
    const line = inv.lines.find((l) => l.qty >= 4)!;
    const cn = s.issueCreditNote(inv.id, { reason: 'Sales return', qtyByLine: { [line.id]: 2 } });
    expect(cn.number).toBe('SSE/CN/26-27/003'); // the seed already holds 001 and 002
    expect(cn.number.length).toBeLessThanOrEqual(16);
    expect(cn.invoiceNumber).toBe(inv.number);
    expect(cn.invoiceDate).toBe(inv.date);
    const after = useApp.getState();
    expect(invoiceBalance(inv, after.payments, after.creditNotes)).toBe(before - cn.totals.grandTotal);
    expect(creditNotesRegister(after.creditNotes).map((r) => r.number)).toContain(cn.number);
    expect(after.counters.creditNote['26-27']).toBe(3);
  });
  it('cannot credit more than was invoiced, across several credit notes', () => {
    const inv = pick();
    const line = inv.lines.find((l) => l.qty >= 4)!;
    const s = useApp.getState();
    s.issueCreditNote(inv.id, { reason: 'Sales return', qtyByLine: { [line.id]: line.qty - 1 } });
    expect(() => useApp.getState().issueCreditNote(inv.id, { reason: 'Sales return', qtyByLine: { [line.id]: 2 } })).toThrow(/exceeds what is left/);
    expect(() => useApp.getState().issueCreditNote(inv.id, { reason: 'Sales return', qtyByLine: { [line.id]: 1 } })).not.toThrow();
    const left = remainingQty(inv, useApp.getState().creditNotes);
    expect(left[line.id]).toBe(0);
    expect(() => useApp.getState().issueCreditNote(inv.id, { reason: 'Other', qtyByLine: { [line.id]: 1 } })).toThrow();
  });
  it('a full credit equals the invoice total and numbers stay consecutive', () => {
    const inv = pick();
    const a = useApp.getState().issueCreditNote(inv.id, { reason: 'Deficiency in service' });
    expect(a.totals.grandTotal).toBe(inv.totals.grandTotal);
    expect(a.lines).toHaveLength(inv.lines.length);
    const inv2 = useApp.getState().invoices.find((i) => i.lockedAt && i.id !== inv.id && !useApp.getState().creditNotes.some((c) => c.invoiceId === i.id))!;
    expect(useApp.getState().issueCreditNote(inv2.id, { reason: 'Rate difference' }).number).toBe('SSE/CN/26-27/004');
  });
  it('validates date, reason and draft invoices', () => {
    const inv = pick();
    const s = useApp.getState();
    expect(() => s.issueCreditNote(inv.id, { reason: 'Nope' })).toThrow(/reason/);
    expect(() => s.issueCreditNote(inv.id, { reason: 'Other', date: '2099-01-01' })).toThrow(/future/);
    expect(() => s.issueCreditNote(inv.id, { reason: 'Other', date: '2000-01-01' })).toThrow(/before the invoice/);
    expect(() => s.issueCreditNote('missing', { reason: 'Other' })).toThrow(/not found/);
    expect(() => createCreditNote({ ...inv, lockedAt: null }, { id: 'x', number: 'n', date: TODAY, reason: 'Other' })).toThrow(/issued/);
  });
  it('credit larger than the balance shows up as customer credit, never a negative balance on screen', () => {
    expect(creditEffect(10000, 4000)).toEqual({ after: 6000, customerCredit: 0 });
    expect(creditEffect(10000, 25000)).toEqual({ after: 0, customerCredit: 15000 });
  });
  it('appears in the credit notes report and reconciles', () => {
    const inv = pick();
    const cn = useApp.getState().issueCreditNote(inv.id, { reason: 'Post-sale discount', qtyByLine: { [inv.lines[0].id]: 1 } });
    const s = useApp.getState();
    const r = buildReports({ invoices: s.invoices, creditNotes: s.creditNotes, ym: cn.date.slice(0, 7), b2clThreshold: s.business.settings.b2clThreshold });
    expect(r['credit-notes'][0].rows.map((x) => x[0])).toContain(cn.number);
    expect(r['credit-notes'][0].recon.ok).toBe(true);
  });
  it('renders a CREDIT NOTE pdf that references the original invoice', async () => {
    const inv = pick();
    const cn = useApp.getState().issueCreditNote(inv.id, { reason: 'Sales return', qtyByLine: { [inv.lines[0].id]: 1 } });
    const as = creditNoteAsInvoice(cn, inv);
    expect(as.number).toBe(cn.number);
    const FONTS = path.resolve(__dirname, '../public/fonts');
    const el = await makePdfElement({ inv: as, business: useApp.getState().business, balance: 0, kind: 'credit', against: { number: cn.invoiceNumber, date: cn.invoiceDate } }, FONTS);
    const buf = await renderToBuffer(el as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });
});

describe('CA client list and zip', () => {
  const ym = TODAY.slice(0, 7);
  it('summarises each client for the month', () => {
    const rows = all.map((w) => clientRow(w, ym));
    for (const [i, r] of rows.entries()) {
      const invs = all[i].invoices.filter((x) => x.date.startsWith(ym));
      expect(r.invoices).toBe(invs.length);
      expect(r.taxable).toBe(invs.reduce((a, x) => a + x.totals.taxable, 0));
      expect(r.gstin).toBe(all[i].business.gstin);
      expect(r.lastActivity).toBeTruthy();
    }
    expect(rows[0].kind).toBe('');
    expect(rows[1].kind).toMatch(/Interior designer/);
    expect(rows.filter((r) => r.invoices > 0).every((r) => r.exportReady)).toBe(true);
  });
  it('a client with a broken reconciliation is not export ready', () => {
    const bad = structuredClone(clients['biz-omhardware']);
    bad.invoices.find((i) => i.date.startsWith(ym) && i.totals.cgst > 0)!.totals.cgst += 1;
    const r = clientRow(bad, ym);
    expect(r.exportReady).toBe(false);
    expect(r.reconDiffs.length).toBeGreaterThan(0);
  });
  it('the zip holds one workbook per client, each containing only that client data', async () => {
    const bytes = await buildAllPacks(all, ym, TODAY);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).sort();
    expect(names).toHaveLength(6);
    expect(names.every((n) => n.endsWith('.xlsx') && n.includes(ym))).toBe(true);
    for (const w of all) {
      const file = names.find((n) => n.startsWith(w.business.tradeName.replace(/[^A-Za-z0-9]+/g, '-')))!;
      expect(file, w.business.tradeName).toBeTruthy();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await zip.file(file)!.async('nodebuffer') as never);
      const cover = (wb.getWorksheet('Cover')!.getSheetValues() as unknown[]).flat().filter(Boolean).join(' | ');
      expect(cover).toContain(w.business.gstin);
      for (const other of all.filter((o) => o !== w)) expect(cover).not.toContain(other.business.gstin);
      const sales = wb.getWorksheet('Sales register')!;
      const own = new Set(w.invoices.map((i) => i.number));
      for (let r = 2; r < 2 + w.invoices.filter((i) => i.date.startsWith(ym)).length; r++) expect(own.has(String(sales.getCell(`A${r}`).value))).toBe(true);
    }
  });
});
