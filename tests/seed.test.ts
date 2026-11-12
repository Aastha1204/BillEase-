import { describe, expect, it } from 'vitest';
import { generateSeed } from '@/lib/seed';
import { validateGstin } from '@/lib/domain/gstin';
import { reconcile, invoicesForMonth, classify } from '@/lib/domain/reports';
import { invoiceStatus, invoiceBalance } from '@/lib/domain/payments';
import { evaluateCompliance } from '@/lib/domain/rules';
import { rateOn, withRateChange } from '@/lib/domain/entities';
import { parseItemCsv, parseCsv, toCsv } from '@/lib/domain/csv';
import { computeInvoice } from '@/lib/domain/tax';

const TODAY = '2026-11-12';
const seed = generateSeed(TODAY);

describe('seed', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateSeed(TODAY))).toBe(JSON.stringify(seed));
  });
  it('has the specified shape', () => {
    expect(seed.items).toHaveLength(40);
    expect(seed.customers).toHaveLength(25);
    expect(seed.invoices).toHaveLength(110);
    expect(seed.creditNotes).toHaveLength(2);
    expect(seed.business.gstin).toBe('27ABJFS4821K1ZT');
    expect(validateGstin(seed.business.gstin).valid).toBe(true);
  });
  it('every customer GSTIN is checksum-valid and matches its state', () => {
    for (const c of seed.customers.filter((x) => x.type === 'B2B')) {
      const v = validateGstin(c.gstin!);
      expect(v.valid, c.name).toBe(true);
      expect(v.stateCode, c.name).toBe(c.stateCode);
    }
  });
  it('numbers are unique, <=16 chars, consecutive per FY, current FY ends at 0418', () => {
    const nums = seed.invoices.map((i) => i.number!);
    expect(new Set(nums).size).toBe(nums.length);
    expect(Math.max(...nums.map((n) => n.length))).toBeLessThanOrEqual(16);
    expect(nums[nums.length - 1]).toBe('SSE/26-27/0418');
  });
  it('mix is close to spec', () => {
    const b2b = seed.invoices.filter((i) => i.isB2B).length / 110;
    const inter = seed.invoices.filter((i) => i.totals.supply === 'inter').length / 110;
    expect(b2b).toBeGreaterThan(0.6); expect(b2b).toBeLessThan(0.8);
    expect(inter).toBeGreaterThan(0.05); expect(inter).toBeLessThan(0.2);
    const st = (s: string) => seed.invoices.filter((i) => invoiceStatus(i, seed.payments, seed.creditNotes, TODAY) === s).length / 110;
    expect(st('Paid')).toBeGreaterThan(0.5); expect(st('Paid')).toBeLessThan(0.72);
    expect(st('Overdue')).toBeGreaterThan(0.04);
    expect(st('Partly paid')).toBeGreaterThan(0.02);
    expect(st('Unpaid')).toBeGreaterThan(0.04);
  });
  it('no negative balances, no payments before the invoice date', () => {
    for (const i of seed.invoices) {
      expect(invoiceBalance(i, seed.payments, seed.creditNotes)).toBeGreaterThanOrEqual(0);
    }
    for (const p of seed.payments) {
      const inv = seed.invoices.find((i) => i.id === p.invoiceId)!;
      expect(p.date >= inv.date && p.date <= TODAY).toBe(true);
    }
  });
  it('exactly one B2C invoice >= Rs 50,000 and it has full buyer details', () => {
    const big = seed.invoices.filter((i) => !i.isB2B && i.totals.grandTotal >= 5_000_000);
    expect(big).toHaveLength(1);
    expect(big[0].customer.address).not.toBe('');
    expect(big[0].customer.stateCode).toBeTruthy();
  });
  it('every seeded invoice passes Rule 46', () => {
    for (const i of seed.invoices) {
      const r = evaluateCompliance({
        supplier: { name: seed.business.tradeName, address: seed.business.address, gstin: seed.business.gstin },
        date: i.date, isB2B: i.isB2B, customer: i.customer, placeOfSupply: i.placeOfSupply, reverseCharge: false,
        lines: i.lines, totals: i.totals, signatory: seed.business.signatoryName,
      });
      expect(r.canIssue, `${i.number}: ${r.missing.map((m) => m.label)}`).toBe(true);
    }
  });
  it('reconciles for every month, to the paisa', () => {
    const months = new Set(seed.invoices.map((i) => i.date.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(3);
    for (const m of months) {
      const r = reconcile(invoicesForMonth(seed.invoices, m));
      expect(r, m).toEqual({ ok: true, diffs: [] });
    }
    expect(reconcile(seed.invoices).ok).toBe(true);
  });
  it('this month has data; stored totals equal a recompute', () => {
    expect(invoicesForMonth(seed.invoices, TODAY.slice(0, 7)).length).toBeGreaterThan(0);
    for (const i of seed.invoices) expect(computeInvoice(i.lines, i.totals.supply, true)).toEqual(i.totals);
    expect(seed.invoices.some((i) => classify(i) === 'B2B')).toBe(true);
  });
  it('seeded rates all start unverified, and the fan has rate history', () => {
    expect(seed.items.every((i) => !i.caVerified)).toBe(true);
    const fan = seed.items.find((i) => i.name.startsWith('Ceiling Fan'))!;
    expect(fan.rates).toHaveLength(2);
    expect(rateOn(fan, '2026-01-01').ratePaise).toBe(169000);
    expect(rateOn(fan, TODAY).ratePaise).toBe(179000);
  });
});

describe('items', () => {
  it('GST rate change from a date leaves earlier dates untouched', () => {
    const it = seed.items[0];
    const next = withRateChange(it, { effectiveFrom: '2027-01-01', gstRate: 12 });
    expect(rateOn(next, '2026-12-31').gstRate).toBe(18);
    expect(rateOn(next, '2027-01-01').gstRate).toBe(12);
    expect(next.caVerified).toBe(false);
  });
});

describe('csv', () => {
  it('parses quotes and round-trips', () => {
    const rows = parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n');
    expect(rows).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('item import preview reports row errors', () => {
    const { rows } = parseItemCsv('name,hsn,unit,rate,gst\nGood Item,8536,Pcs,"1,200.50",18\nBad,12,Pcs,abc,17\n');
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].ratePaise).toBe(120050);
    expect(rows[1].errors.length).toBe(3);
    expect(parseItemCsv('x,y\n1,2').headerError).toMatch(/Missing/);
  });
});
