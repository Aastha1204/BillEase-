import { describe, expect, it } from 'vitest';
import { amountInWordsINR } from '@/lib/domain/words';
import { applyCustomer, canonicalDraft, issueReadiness, newDraft, recompute, routeLabel } from '@/lib/domain/builder';
import { generateSeed } from '@/lib/seed';

const TODAY = '2026-11-12';
const s = generateSeed(TODAY);
const find = (n: string) => s.customers.find((c) => c.name.startsWith(n))!;

describe('builder: canonical demo flow', () => {
  it('Patel intra-state matches the spec; switching to Surat flips to IGST with the same total', () => {
    const d = canonicalDraft(s.business, s.customers, s.items, TODAY, 'd1');
    expect(d.totals.supply).toBe('intra');
    expect(d.totals.taxable).toBe(3699100);
    expect(d.totals.cgst).toBe(243869);
    expect(d.totals.roundOff).toBe(-38);
    expect(d.totals.grandTotal).toBe(4186800);
    expect(amountInWordsINR(d.totals.grandTotal)).toContain('Forty-One Thousand Eight Hundred Sixty-Eight');
    expect(d.dueDate).toBe('2026-11-27');

    const surat = applyCustomer(d, find('Surat'), s.business);
    expect(surat.placeOfSupply).toBe('24');
    expect(surat.totals.supply).toBe('inter');
    expect(surat.totals.igst).toBe(487738);
    expect(surat.totals.grandTotal).toBe(4186800);
    expect(routeLabel(surat, s.business)).toEqual({ from: 'Maharashtra (27)', to: 'Gujarat (24)', inter: true });
  });
  it('manual place of supply change flips the supply type', () => {
    const d = canonicalDraft(s.business, s.customers, s.items, TODAY, 'd2');
    const m = recompute({ ...d, placeOfSupply: '29', posManual: true }, s.business);
    expect(m.totals.supply).toBe('inter');
    expect(m.totals.igst).toBe(487738);
  });
  it('B2C customer defaults place of supply to their state', () => {
    const d = applyCustomer(newDraft(s.business, TODAY, 'd3'), find('Rohan'), s.business);
    expect(d.isB2B).toBe(false);
    expect(d.placeOfSupply).toBe('27');
    expect(d.dueDate).toBe(TODAY);
  });
});

describe('builder: issue readiness', () => {
  const ctx = { today: TODAY, lastIssuedDate: TODAY };
  it('blank draft cannot be issued and says why', () => {
    const r = issueReadiness(newDraft(s.business, TODAY, 'e1'), s.business, ctx);
    expect(r.canIssue).toBe(false);
    expect(r.missing.join(' ')).toMatch(/customer/i);
  });
  it('canonical draft is 15/15 and can be issued', () => {
    const r = issueReadiness(canonicalDraft(s.business, s.customers, s.items, TODAY, 'e2'), s.business, ctx);
    expect(r.compliance.passed).toBe(15);
    expect(r.canIssue).toBe(true);
  });
  it('blocks dates before the last issued invoice or in the future', () => {
    const d = canonicalDraft(s.business, s.customers, s.items, TODAY, 'e3');
    expect(issueReadiness({ ...d, date: '2026-01-01' }, s.business, ctx).canIssue).toBe(false);
    expect(issueReadiness({ ...d, date: '2026-11-13' }, s.business, ctx).canIssue).toBe(false);
  });
  it('different ship-to state requires a delivery address', () => {
    const d = { ...canonicalDraft(s.business, s.customers, s.items, TODAY, 'e4'), shipToStateCode: '24' };
    expect(issueReadiness(d, s.business, ctx).canIssue).toBe(false);
    expect(issueReadiness({ ...d, shipToAddress: 'Surat site' }, s.business, ctx).canIssue).toBe(true);
  });
});
