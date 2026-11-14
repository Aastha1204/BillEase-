// @vitest-environment node
import path from 'node:path';
import JSZip from 'jszip';
import { renderToBuffer } from '@react-pdf/renderer';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAllPacks, clientRow } from '@/lib/domain/ca';
import { makeGstin, validateGstin } from '@/lib/domain/gstin';
import { applyCustomer, issueReadiness, lineFromItem, newDraft, recompute } from '@/lib/domain/builder';
import { validateProfile } from '@/lib/domain/settings';
import { standardView } from '@/lib/domain/standardView';
import { buildReports, allReconciled } from '@/lib/domain/reportTables';
import { invoicesForMonth } from '@/lib/domain/reports';
import { makePdfElement } from '@/lib/pdf/element';
import { generateSeed } from '@/lib/seed';
import { generateClientWorkspaces } from '@/lib/seed/clients';
import { buildWorkspace, makeBusinessId, suggestPrefix, type NewBusinessInput } from '@/lib/seed/newBusiness';
import { migrateState, OWNER_ID, todayIso, useApp, workspacesOf } from '@/lib/store';

const TODAY = '2026-11-12';
const GSTIN = makeGstin('27', 'AAJFS4410C'); // fictional, checksum-valid
const input = (over: Partial<NewBusinessInput> = {}): NewBusinessInput => ({
  tradeName: 'Sunbeam Steel Traders', legalName: '', constitution: 'Partnership firm', kind: 'Trader', address: 'Plot 8, Industrial Estate', city: 'Kalyan', pincode: '421301',
  gstin: GSTIN, phone: '+91 90000 11111', email: 'hello@sunbeam.example', seriesPrefix: 'SST', bankName: 'Demo Bank', bankAccountMasked: 'XXXX1234', ifsc: 'DEMO0001111', bankBranch: 'Kalyan',
  upiId: 'sunbeam@demo', signatoryName: 'Test Partner', withSample: true, ...over,
});

describe('new business helpers', () => {
  it('suggests a series prefix and unique ids', () => {
    expect(suggestPrefix('Sunbeam Steel Traders')).toBe('SST');
    expect(suggestPrefix('Om Hardware')).toBe('OHA');
    expect(suggestPrefix('Zen')).toBe('ZEN');
    expect(suggestPrefix('')).toBe('');
    expect(makeBusinessId('Sunbeam Steel!', [])).toBe('biz-sunbeam-steel');
    expect(makeBusinessId('Sunbeam Steel', ['biz-sunbeam-steel', 'biz-sunbeam-steel-2'])).toBe('biz-sunbeam-steel-3');
  });
  it('builds an empty business, or one with fictional starter data, and rejects a bad GSTIN', () => {
    const empty = buildWorkspace(input({ withSample: false }), 'biz-x', TODAY);
    expect(empty.business.gstin).toBe(GSTIN);
    expect(empty.business.stateCode).toBe('27');
    expect(empty.business.settings.pdfTemplate).toBe('Standard');
    expect([empty.items.length, empty.customers.length, empty.invoices.length]).toEqual([0, 0, 0]);
    const sample = buildWorkspace(input(), 'biz-y', TODAY);
    expect(sample.items.length).toBeGreaterThan(4);
    expect(sample.customers.length).toBeGreaterThan(3);
    for (const c of sample.customers.filter((x) => x.type === 'B2B')) {
      const v = validateGstin(c.gstin!);
      expect(v.valid, c.name).toBe(true);
      expect(v.stateCode).toBe(c.stateCode);
    }
    expect(sample.customers.some((c) => c.stateCode !== '27')).toBe(true); // one inter-state customer to show IGST
    expect([...sample.customers.map((c) => c.id), ...sample.items.map((i) => i.id)].every((id) => id.startsWith('biz-y-'))).toBe(true);
    expect(() => buildWorkspace(input({ gstin: '27ABJFS4821K1ZX' }), 'biz-z', TODAY)).toThrow(/GSTIN/);
  });
  it('the same validation the form uses accepts the input and flags problems', () => {
    expect(validateProfile({ ...input(), legalName: 'Sunbeam Steel Traders' })).toEqual({});
    const bad = validateProfile({ ...input(), legalName: 'x', gstin: 'nope', seriesPrefix: 'TOOLONGPREFIX', pincode: '12' });
    expect(Object.keys(bad).sort()).toEqual(['gstin', 'pincode', 'seriesPrefix']);
  });
});

describe('adding a business in the store', () => {
  beforeEach(() => { useApp.getState().resetDemo(); useApp.getState().enterOwner(OWNER_ID); });
  const add = () => useApp.getState().addBusiness(buildWorkspace(input(), 'biz-sunbeam', TODAY));

  it('appears in the business list and in the CA client list at once', () => {
    add();
    const s = useApp.getState();
    expect(s.workspaceOrder[s.workspaceOrder.length - 1]).toBe('biz-sunbeam');
    const spaces = workspacesOf(s);
    expect(spaces.map((w) => w.business.id)).toContain('biz-sunbeam');
    const row = clientRow(spaces.find((w) => w.business.id === 'biz-sunbeam')!, TODAY.slice(0, 7));
    expect(row).toMatchObject({ name: 'Sunbeam Steel Traders', gstin: GSTIN, invoices: 0, exportReady: false });
    expect(row.kind).toBe('Trader');
  });
  it('is included in the all-clients zip, with its own data only', async () => {
    add();
    const zip = await JSZip.loadAsync(await buildAllPacks(workspacesOf(useApp.getState()), TODAY.slice(0, 7), TODAY));
    const names = Object.keys(zip.files);
    expect(names).toHaveLength(7);
    expect(names.some((n) => n.startsWith('Sunbeam-Steel-Traders'))).toBe(true);
  });
  it('rejects a duplicate id and keeps every other business untouched', () => {
    const before = JSON.stringify(useApp.getState().others);
    add();
    expect(() => add()).toThrow(/already exists/);
    for (const [id, ws] of Object.entries(JSON.parse(before))) expect(JSON.stringify(useApp.getState().others[id])).toBe(JSON.stringify(ws));
  });
  it('can be opened as the owner and remembered as the owner business', () => {
    add();
    useApp.getState().enterOwner('biz-sunbeam');
    expect(useApp.getState().business.tradeName).toBe('Sunbeam Steel Traders');
    expect(useApp.getState().invoices).toHaveLength(0);
    useApp.getState().enterCa();
    useApp.getState().switchWorkspace('biz-aarambh');
    useApp.getState().enterOwner(); // no id: back to the last owner business
    expect(useApp.getState().activeId).toBe('biz-sunbeam');
  });
  it('can issue a first invoice in the new business with its own series, isolated from the others', () => {
    add();
    useApp.getState().enterOwner('biz-sunbeam');
    const s = useApp.getState();
    const cust = s.customers.find((c) => c.type === 'B2B' && c.stateCode === '27')!;
    const lines = [lineFromItem(s.items[0], TODAY, 'l1', 100), lineFromItem(s.items[1], TODAY, 'l2', 40)];
    const draft = applyCustomer(recompute({ ...newDraft(s.business, TODAY, 'sb-1'), date: TODAY, lines }, s.business), cust, s.business);
    expect(issueReadiness(draft, s.business, { today: TODAY, lastIssuedDate: null }).canIssue).toBe(true);
    s.saveDraft(draft);
    const issued = useApp.getState().issueDraft('sb-1');
    expect(issued.number).toMatch(/^SST\/26-27\/0001$/);
    expect(issued.meta?.paymentTerms).toBe('30 days');
    useApp.getState().enterOwner(OWNER_ID);
    expect(useApp.getState().invoices.some((i) => i.number?.startsWith('SST/'))).toBe(false);
    expect(useApp.getState().invoices.length).toBe(110);
  });
});

describe('migration to v4', () => {
  it('keeps a v3 user business, adds the new seeded clients and moves everyone to the Standard format', () => {
    const today = todayIso();
    const seed = generateSeed(today);
    const old = generateClientWorkspaces(today);
    const three = Object.fromEntries(Object.entries(old).filter(([id]) => ['biz-aarambh', 'biz-pixelkraft', 'biz-omhardware'].includes(id)).map(([id, w]) => [id, { ...w, business: { ...w.business, settings: { ...w.business.settings, pdfTemplate: 'Classic' as const } } }]));
    const mine = buildWorkspace(input(), 'biz-mine', today);
    const v3 = { ...seed, business: { ...seed.business, settings: { ...seed.business.settings, pdfTemplate: 'Classic' as const } }, activeId: OWNER_ID, others: { ...three, 'biz-mine': { ...mine, business: { ...mine.business, settings: { ...mine.business.settings, pdfTemplate: 'Classic' as const } } } }, mode: 'owner' as const };
    const m = migrateState(v3, 3);
    expect(Object.keys(m.others).sort()).toEqual(['biz-aarambh', 'biz-brightsteel', 'biz-mine', 'biz-omhardware', 'biz-pixelkraft', 'biz-precision']);
    expect(m.business.settings.pdfTemplate).toBe('Standard');
    expect(Object.values(m.others).every((w) => w.business.settings.pdfTemplate === 'Standard')).toBe(true);
    expect(m.workspaceOrder).toEqual([OWNER_ID, 'biz-aarambh', 'biz-pixelkraft', 'biz-omhardware', 'biz-brightsteel', 'biz-precision', 'biz-mine']);
    expect(m.ownerId).toBe(OWNER_ID);
    expect(m.invoices).toHaveLength(110); // the owner's own data is untouched
    expect(m.others['biz-mine'].customers).toHaveLength(mine.customers.length);
  });
});

describe('seeded trade-format businesses', () => {
  const clients = generateClientWorkspaces(TODAY);
  const steel = clients['biz-brightsteel'];
  const job = clients['biz-precision'];
  it('bright-bar manufacturer: decimal kg quantities, grade/size/batch, charges, e-invoice and transport details', () => {
    expect(steel.business.eInvoice).toBe(true);
    expect(steel.business.cin).toMatch(/^U\d{5}MH\d{4}PTC\d{6}$/);
    expect(steel.invoices.length).toBe(20);
    for (const inv of steel.invoices) {
      const items = inv.lines.filter((l) => l.kind !== 'charge');
      const charges = inv.lines.filter((l) => l.kind === 'charge');
      expect(charges.length).toBeGreaterThanOrEqual(1);
      expect(charges.every((c) => c.hsn === '996511')).toBe(true);
      expect(items.every((l) => l.grade && l.size && l.batch && l.unit === 'Kgs')).toBe(true);
      expect(items.some((l) => !Number.isInteger(l.qty)) || items.length > 0).toBe(true);
      expect(inv.meta?.vehicleNo).toMatch(/^MH \d\d [A-Z]{2} \d{4}$/);
      expect(inv.meta?.paymentTerms).toMatch(/days$/);
      expect(standardView(inv, steel.business).eInvoice).not.toBeNull();
    }
    expect(steel.invoices.some((i) => i.lines.some((l) => !Number.isInteger(l.qty)))).toBe(true);
  });
  it('job-work business: SAC 9988, large piece counts at small rates, transport charges', () => {
    expect(job.items.every((i) => i.hsn === '9988')).toBe(true);
    expect(job.invoices.some((i) => i.lines.some((l) => l.unit === 'Nos' && l.qty >= 200 && l.ratePaise < 1000))).toBe(true);
    expect(job.invoices.every((i) => i.lines.some((l) => l.kind === 'charge'))).toBe(true);
  });
  it('reports for the new businesses reconcile for every month', () => {
    for (const w of [steel, job]) {
      for (const ym of new Set(w.invoices.map((i) => i.date.slice(0, 7)))) {
        const r = buildReports({ invoices: w.invoices, creditNotes: [], ym, b2clThreshold: w.business.settings.b2clThreshold });
        expect(allReconciled(r, invoicesForMonth(w.invoices, ym), w.business.settings.b2clThreshold), `${w.business.tradeName} ${ym}`).toEqual({ ok: true, diffs: [] });
      }
    }
  });
  it('every seeded invoice (all businesses) carries payment terms, and every issued one passes Rule 46', () => {
    const owner = generateSeed(TODAY);
    for (const [biz, invs] of [[owner.business, owner.invoices], ...Object.values(clients).map((w) => [w.business, w.invoices] as const)] as const) {
      for (const inv of invs) {
        expect(inv.meta?.paymentTerms, `${biz.tradeName} ${inv.number}`).toBeTruthy();
        const r = issueReadiness({ ...inv }, biz, { today: TODAY, lastIssuedDate: null });
        expect(r.compliance.passed, `${biz.tradeName} ${inv.number}`).toBe(15);
      }
    }
  });
  it('renders the bright-bar invoice as a Standard PDF', async () => {
    const inv = steel.invoices[steel.invoices.length - 1];
    const el = await makePdfElement({ inv, business: steel.business, balance: inv.totals.grandTotal }, path.resolve(__dirname, '../public/fonts'));
    const buf = await renderToBuffer(el as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});
