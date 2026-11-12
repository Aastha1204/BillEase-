// @vitest-environment node
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { canonicalDraft, applyCustomer } from '@/lib/domain/builder';
import { issueInvoice } from '@/lib/domain/locking';
import { computeInvoice } from '@/lib/domain/tax';
import { makePdfElement } from '@/lib/pdf/element';
import { generateSeed } from '@/lib/seed';

const require = createRequire(import.meta.url);
const FONTS = path.resolve(__dirname, '../public/fonts');
const TODAY = '2026-11-12';
const s = generateSeed(TODAY);
const base = issueInvoice(canonicalDraft(s.business, s.customers, s.items, TODAY, 'p1'), 'SSE/26-27/0418', 'now');
const pages = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const render = async (inv = base, over: object = {}) =>
  renderToBuffer((await makePdfElement({ inv, business: s.business, balance: inv.totals.grandTotal, ...over }, FONTS)) as any);

describe('fonts', () => {
  it('all three bundled Noto Sans files contain the rupee glyph (U+20B9)', () => {
    const fk = require('fontkit');
    for (const f of ['Regular', 'SemiBold', 'Bold']) {
      expect(fk.openSync(path.join(FONTS, `NotoSans-${f}.ttf`)).hasGlyphForCodePoint(0x20b9), f).toBe(true);
    }
  });
});

describe('invoice pdf', () => {
  it('renders the canonical invoice on one page with embedded Noto Sans', async () => {
    const buf = await render();
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(buf)).toBe(1);
    expect(buf.toString('latin1')).toMatch(/NotoSans/);
  });
  it('renders inter-state, every theme, and a credit-note variant', async () => {
    const surat = applyCustomer(base, s.customers.find((c) => c.name.startsWith('Surat'))!, s.business);
    const inter = issueInvoice({ ...surat, lockedAt: null }, 'SSE/26-27/0419', 'now');
    for (const template of ['Classic', 'Modern', 'Minimal'] as const) {
      expect(pages(await render(inter, { template }))).toBe(1);
    }
    const cn = await render(base, { kind: 'credit', against: { number: 'SSE/26-27/0400', date: '2026-10-01' } });
    expect(cn.subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('a 60-line invoice flows onto more than one page', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ ...base.lines[i % 4], id: `m${i}` }));
    const big = { ...base, lines, totals: computeInvoice(lines, 'intra', true) };
    expect(pages(await render(big))).toBeGreaterThan(1);
  });
  it('draft and paid variants render', async () => {
    expect(pages(await render({ ...base, number: null, lockedAt: null }))).toBe(1);
    expect(pages(await render(base, { balance: 0 }))).toBe(1);
  });
});
