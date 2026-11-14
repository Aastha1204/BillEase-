// @vitest-environment node
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { applyCustomer, canonicalDraft, issueReadiness, recompute } from '@/lib/domain/builder';
import { issueInvoice } from '@/lib/domain/locking';
import { CHARGE_PRESETS, DEFAULT_TERMS, demoEInvoice, panOf, pinOf, standardView } from '@/lib/domain/standardView';
import type { Invoice, LineInput } from '@/lib/domain/types';
import { makePdfElement } from '@/lib/pdf/element';
import { generateSeed } from '@/lib/seed';

const TODAY = '2026-11-12';
const s = generateSeed(TODAY);
const FONTS = path.resolve(__dirname, '../public/fonts');
const pages = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

// A fully filled trade-format invoice built from the app's own fictional demo data.
function tradeInvoice(supply: 'intra' | 'inter' = 'intra'): Invoice {
  const base = canonicalDraft(s.business, s.customers, s.items, TODAY, 'std1');
  const lines: LineInput[] = base.lines.map((l, i) => ({ ...l, partNo: `P-${100 + i}`, batch: `B${i + 1}`, grade: 'EN1A', size: `${6 + i} MM` }));
  const charge = (label: string, hsn: string, rate: number): LineInput => ({ id: `c-${hsn}-${rate}`, description: label, hsn, qty: 1, unit: 'Job', ratePaise: rate, discount: { kind: 'percent', value: 0 }, gstRate: 18, kind: 'charge' });
  lines.push(charge(CHARGE_PRESETS[0].label, CHARGE_PRESETS[0].hsn, 9000), charge(CHARGE_PRESETS[1].label, CHARGE_PRESETS[1].hsn, 20000));
  let inv: Invoice = recompute({
    ...base, lines, shipToName: 'Site Office (Thane)', shipToAddress: 'Plot 5, Industrial Area, Thane 400604', shipToGstin: undefined,
    meta: { paymentTerms: '30 days', challanNo: 'CH/26-27/0042', challanDate: '2026-11-11', ewayBill: '381000000001', vehicleNo: 'MH04 XY 1234', lrNo: 'LR-778', lrDate: '2026-11-11',
      transporter: 'Demo Transport Co.', buyerOrderNo: 'PO-2613', buyerOrderDate: '2026-10-27', dispatchedThrough: 'Road', destination: 'Mumbai', termsOfDelivery: 'Ex-works' },
  }, s.business);
  if (supply === 'inter') inv = applyCustomer(inv, s.customers.find((c) => c.name.startsWith('Surat'))!, s.business);
  return issueInvoice(inv, 'SSE/26-27/0420', `${TODAY}T10:00:00Z`);
}

describe('standard view', () => {
  it('PAN and PIN helpers', () => {
    expect(panOf('27ABJFS4821K1ZT')).toBe('ABJFS4821K');
    expect(pinOf('Thane West 400602')).toBe('400602');
    expect(pinOf('No pin here')).toBe('');
  });
  it('separates items from charges and totals correctly (taxable = items + charges)', () => {
    const inv = tradeInvoice();
    const v = standardView(inv, s.business);
    expect(v.items).toHaveLength(4);
    expect(v.charges.map((c) => c.value)).toEqual([9000, 20000]);
    expect(v.itemValue).toBe(3699100);
    expect(v.chargesValue).toBe(29000);
    expect(v.taxable).toBe(v.itemValue + v.chargesValue);
    expect(v.taxable).toBe(inv.totals.taxable);
    expect(v.cgst).toBe(inv.totals.cgst);
    expect(v.grandTotal).toBe(inv.totals.grandTotal);
    expect(v.items[0].details).toEqual(['Batch No : B1', 'Grade : EN1A', 'Size : 6 MM']);
    expect(v.rateLabel).toBe(''); // lines have different GST rates (5% and 18%)
  });
  it('HSN summary includes the charge SAC and its rows add up to the invoice', () => {
    const v = standardView(tradeInvoice(), s.business);
    expect(v.hsnRows.some((h) => h.hsn === '996511')).toBe(true);
    expect(v.hsnRows.reduce((a, h) => a + h.taxable, 0)).toBe(v.taxable);
    expect(v.hsnRows.reduce((a, h) => a + h.totalTax, 0)).toBe(v.cgst + v.sgst + v.igst);
    expect(v.taxWords).toMatch(/^Rupees .* Only$/);
  });
  it('inter-state switches to IGST everywhere', () => {
    const v = standardView(tradeInvoice('inter'), s.business);
    expect(v.inter).toBe(true);
    expect(v.cgst + v.sgst).toBe(0);
    expect(v.igst).toBeGreaterThan(0);
    expect(v.items.every((i) => i.cgst === 0 && i.igst > 0)).toBe(true);
    expect(v.buyer.stateName).toBe('Gujarat');
  });
  it('header grid carries the transport and reference details', () => {
    const v = standardView(tradeInvoice(), s.business);
    const flat = Object.fromEntries(v.grid.flat());
    expect(flat['Vehicle No.']).toBe('MH04 XY 1234');
    expect(flat['E-Way Bill No.']).toBe('381000000001');
    expect(flat['Mode / Terms of Payment']).toBe('30 days');
    expect(flat["Buyer's Order No."]).toBe('PO-2613');
    expect(flat['Challan Date']).toBe('11-Nov-2026');
    expect(v.consignee.name).toBe('Site Office (Thane)');
    expect(v.consignee.pin).toBe('400604');
    expect(v.buyer.pan).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
  });
  it('uses sensible defaults when the business has no custom terms, and custom ones when set', () => {
    const inv = tradeInvoice();
    expect(standardView(inv, s.business).terms).toEqual(DEFAULT_TERMS);
    expect(standardView(inv, { ...s.business, termsAndConditions: ['Pay in 7 days.'] }).terms).toEqual(['Pay in 7 days.']);
    expect(standardView(inv, { ...s.business, jurisdiction: 'Subject to Kalyan jurisdiction' }).jurisdiction).toMatch(/Kalyan/);
  });
  it('demo e-invoice values are deterministic, well-formed and only shown when enabled for a B2B invoice', () => {
    const inv = tradeInvoice();
    const e = demoEInvoice(inv, s.business.gstin);
    expect(e.irn).toMatch(/^[0-9a-f]{64}$/);
    expect(e.ackNo).toMatch(/^\d{15}$/);
    expect(demoEInvoice(inv, s.business.gstin)).toEqual(e);
    expect(standardView(inv, s.business).eInvoice).toBeNull();
    expect(standardView(inv, { ...s.business, eInvoice: true }).eInvoice).toEqual(e);
    expect(standardView({ ...inv, isB2B: false }, { ...s.business, eInvoice: true }).eInvoice).toBeNull();
  });
  it('charges still satisfy the Rule 46 checklist', () => {
    const r = issueReadiness({ ...tradeInvoice(), lockedAt: null, number: null }, s.business, { today: TODAY, lastIssuedDate: null });
    expect(r.compliance.passed).toBe(15);
  });
});

describe('standard pdf', () => {
  const render = async (inv: Invoice, business = s.business, over: object = {}) =>
    renderToBuffer((await makePdfElement({ inv, business: { ...business, settings: { ...business.settings, pdfTemplate: 'Standard' } }, balance: inv.totals.grandTotal, ...over }, FONTS)) as never);
  it('renders the full trade invoice on one page (intra and inter); the e-invoice variant needs at most two', async () => {
    expect(pages(await render(tradeInvoice()))).toBe(1);
    expect(pages(await render(tradeInvoice('inter')))).toBe(1);
    const buf = await render(tradeInvoice(), { ...s.business, eInvoice: true });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // The optional e-invoice block adds height; the bank/signature block may then move to a second page.
    expect(pages(buf)).toBeLessThanOrEqual(2);
  });
  it('flows long item lists onto more pages, and renders draft, paid and credit variants', async () => {
    const base = tradeInvoice();
    const lines = Array.from({ length: 45 }, (_, i) => ({ ...base.lines[i % 4], id: `x${i}` }));
    const big = recompute({ ...base, lines }, s.business);
    expect(pages(await render({ ...big, lockedAt: base.lockedAt }))).toBeGreaterThan(1);
    expect(pages(await render({ ...base, number: null, lockedAt: null }))).toBe(1);
    expect(pages(await render(base, s.business, { balance: 0 }))).toBe(1);
    expect(pages(await render(base, s.business, { kind: 'credit', against: { number: 'SSE/26-27/0400', date: '2026-10-01' } }))).toBe(1);
  });
});
