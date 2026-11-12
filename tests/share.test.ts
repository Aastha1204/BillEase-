import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { canonicalDraft } from '@/lib/domain/builder';
import { issueInvoice } from '@/lib/domain/locking';
import { decodeInvoice, encodeInvoice, ShareLinkError } from '@/lib/domain/share';
import { upiUriFor } from '@/lib/pdf/element';
import { generateSeed } from '@/lib/seed';

const TODAY = '2026-11-12';
const s = generateSeed(TODAY);
const issued = issueInvoice(canonicalDraft(s.business, s.customers, s.items, TODAY, 'sh1'), 'SSE/26-27/0418', 'now');

describe('share link', () => {
  const hash = encodeInvoice(issued, s.business, issued.totals.grandTotal);
  it('canonical invoice fits well under 2,000 characters', () => {
    expect(hash.length).toBeLessThan(2000);
  });
  it('round-trips with identical totals (recomputed, not stored)', () => {
    const d = decodeInvoice('#' + hash);
    expect(d.invoice.number).toBe('SSE/26-27/0418');
    expect(d.invoice.totals).toEqual(issued.totals);
    expect(d.invoice.totals.grandTotal).toBe(4186800);
    expect(d.balance).toBe(4186800);
    expect(d.business.gstin).toBe(s.business.gstin);
    expect(d.business.upiId).toBe('shreesai@demo');
    expect(d.invoice.customer.gstin).toBe('27AAKFP7316N1ZN');
  });
  it('rejects garbage and tampered payloads', () => {
    expect(() => decodeInvoice('#nonsense')).toThrow(ShareLinkError);
    expect(() => decodeInvoice('')).toThrow(ShareLinkError);
    const bad = (mut: (p: any) => void) => {
      const p = JSON.parse(LZString.decompressFromEncodedURIComponent(hash)!);
      mut(p);
      return LZString.compressToEncodedURIComponent(JSON.stringify(p));
    };
    expect(() => decodeInvoice(bad((p) => { p.l = []; }))).toThrow(ShareLinkError);
    expect(() => decodeInvoice(bad((p) => { p.l[0][4] = -5; }))).toThrow(ShareLinkError);
    expect(() => decodeInvoice(bad((p) => { p.pos = '99'; }))).toThrow(ShareLinkError);
  });
  it('a larger invoice still round-trips', () => {
    const lines = Array.from({ length: 25 }, (_, i) => ({ ...issued.lines[i % 4], id: `x${i}` }));
    const big = { ...issued, lines, totals: { ...issued.totals } };
    const h = encodeInvoice(big, s.business, 1000);
    expect(decodeInvoice(h).invoice.lines).toHaveLength(25);
  });
  it('drafts cannot be shared', () => {
    expect(() => encodeInvoice({ ...issued, number: null }, s.business, 0)).toThrow();
  });
});

describe('upi uri for the invoice', () => {
  it('amount is the balance due', () => {
    const q = new URLSearchParams(upiUriFor(issued, s.business, 2000000).split('?')[1]);
    expect(q.get('am')).toBe('20000.00');
    expect(q.get('tn')).toBe('SSE/26-27/0418');
    expect(q.get('pa')).toBe('shreesai@demo');
  });
});
