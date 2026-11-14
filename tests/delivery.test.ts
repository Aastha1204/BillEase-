// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { firstNameOf, invoiceMessage, ladderFor, LADDER, normalizePhone, reminderMessage, suggestedStep, waUrl, type MsgCtx } from '@/lib/domain/messages';
import { buildTimeline } from '@/lib/domain/timeline';
import { invoiceBalance, invoiceStatus, validatePayment } from '@/lib/domain/payments';
import { migrateState, SCHEMA_VERSION, todayIso, useApp } from '@/lib/store';
import { generateSeed } from '@/lib/seed';
import type { InvoiceEvent } from '@/lib/domain/entities';

const ctx: MsgCtx = { firstName: 'Priya', number: 'SSE/26-27/0418', tradeName: 'Shree Sai Electricals', amount: '₹41,868.00', dueDate: '27-Nov-2026', link: 'https://x.example/i#abc', vpa: 'shreesai@demo' };

describe('messages', () => {
  it('English invoice template matches the spec exactly', () => {
    expect(invoiceMessage('en', ctx)).toBe(
      'Namaste Priya ji 🙏\nInvoice SSE/26-27/0418 from Shree Sai Electricals\nAmount: ₹41,868.00 · Due: 27-Nov-2026\nView & pay: https://x.example/i#abc\nUPI: shreesai@demo\nThank you for your business!');
  });
  it('Hindi template fills every placeholder', () => {
    const m = invoiceMessage('hi', ctx);
    expect(m).toContain('नमस्ते Priya जी');
    for (const v of [ctx.number, ctx.amount, ctx.dueDate, ctx.link, ctx.vpa, ctx.tradeName]) expect(m).toContain(v);
    expect(m).not.toMatch(/\{\w+\}/);
  });
  it('all four reminder steps exist in both languages with no leftover placeholders', () => {
    for (const s of LADDER) for (const l of ['en', 'hi'] as const) {
      const m = reminderMessage(s.id, l, ctx);
      expect(m, `${s.id}/${l}`).not.toMatch(/\{\w+\}/);
      expect(m).toContain(ctx.number);
    }
    expect(reminderMessage('late7', 'en', ctx)).toMatch(/Final reminder/);
  });
  it('phone validation and wa.me link', () => {
    expect(normalizePhone('+91 98765 43210')).toEqual({ ok: true, digits: '9876543210' });
    expect(normalizePhone('09876543210').digits).toBe('9876543210');
    expect(normalizePhone('919876543210').digits).toBe('9876543210');
    expect(normalizePhone('12345').ok).toBe(false);
    expect(normalizePhone('5876543210').ok).toBe(false);
    const u = waUrl('9876543210', 'Hi & bye\nline');
    expect(u).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye%0Aline');
    expect(firstNameOf('Sneha Kulkarni (home renovation)')).toBe('Sneha');
  });
});

describe('reminder ladder', () => {
  const inv = { id: 'i1', dueDate: '2026-11-20' };
  const row = (today: string, events: InvoiceEvent[] = [], bal = 100) => ladderFor(inv, events, bal, today);
  it('dates are -2, 0, +3, +7 days from the due date', () => {
    expect(row('2026-11-01').map((r) => r.date)).toEqual(['2026-11-18', '2026-11-20', '2026-11-23', '2026-11-27']);
  });
  it('steps become due as dates arrive; the latest due step is suggested', () => {
    expect(row('2026-11-17').every((r) => r.state === 'upcoming')).toBe(true);
    expect(suggestedStep(row('2026-11-17'))).toBeNull();
    expect(row('2026-11-18')[0].state).toBe('due');
    expect(suggestedStep(row('2026-11-24'))).toBe('late3');
    expect(suggestedStep(row('2026-12-10'))).toBe('late7');
  });
  it('sent steps are remembered; paid invoices close the rest', () => {
    const ev: InvoiceEvent[] = [{ id: 'e', invoiceId: 'i1', at: 'x', type: 'reminder', step: 'due' }];
    expect(row('2026-11-24', ev).map((r) => r.state)).toEqual(['due', 'sent', 'due', 'upcoming']);
    expect(row('2026-11-24', ev, 0).map((r) => r.state)).toEqual(['closed', 'sent', 'closed', 'closed']);
    expect(row('2026-11-24', [{ ...ev[0], invoiceId: 'other' }])[1].state).toBe('due');
  });
});

describe('payments and timeline', () => {
  const s = generateSeed('2026-11-12');
  const unpaid = s.invoices.find((i) => invoiceBalance(i, s.payments, s.creditNotes) === i.totals.grandTotal && i.dueDate >= '2026-11-12')!;
  const ok = (amount: number, over: object = {}) => validatePayment(unpaid, s.payments, s.creditNotes, { amount, date: '2026-11-12', method: 'UPI', ...over }, '2026-11-12');
  it('validates amount, date and method', () => {
    expect(ok(1000)).toBeNull();
    expect(ok(unpaid.totals.grandTotal)).toBeNull();
    expect(ok(0)).toMatch(/greater than zero/);
    expect(ok(unpaid.totals.grandTotal + 1)).toMatch(/more than the balance/);
    expect(ok(1000, { method: 'Bitcoin' })).toMatch(/method/);
    expect(ok(1000, { date: '2026-11-13' })).toMatch(/future/);
    expect(ok(1000, { date: '2000-01-01' })).toMatch(/before the invoice/);
    expect(validatePayment({ ...unpaid, lockedAt: null }, [], [], { amount: 1, date: '2026-11-12', method: 'UPI' }, '2026-11-12')).toMatch(/issued/);
  });
  it('part payments lead to Partly paid then Paid, and the timeline lists them in order', () => {
    const half = Math.floor(unpaid.totals.grandTotal / 2);
    const p1 = { id: 'p1', invoiceId: unpaid.id, amount: half, method: 'UPI', date: '2026-11-12' };
    const p2 = { id: 'p2', invoiceId: unpaid.id, amount: unpaid.totals.grandTotal - half, method: 'Cash', date: '2026-11-12' };
    expect(invoiceStatus(unpaid, [p1], [], '2026-11-12')).toBe('Partly paid');
    expect(invoiceStatus(unpaid, [p1, p2], [], '2026-11-12')).toBe('Paid');
    const ev: InvoiceEvent[] = [{ id: 'e1', invoiceId: unpaid.id, at: `${unpaid.date}T15:00:00.000Z`, type: 'whatsapp', detail: 'to 98xxxxx' }];
    const kinds = buildTimeline(unpaid, [p1, p2], [], ev).map((t) => t.kind);
    expect(kinds[0]).toBe('created');
    expect(kinds[1]).toBe('issued');
    expect(kinds).toContain('whatsapp');
    expect(kinds.filter((k) => k === 'payment')).toHaveLength(2);
    expect(kinds.indexOf('whatsapp')).toBeLessThan(kinds.indexOf('payment'));
  });
});

describe('store v2', () => {
  beforeEach(() => useApp.getState().resetDemo());
  it('recordPayment stores a valid payment and rejects an invalid one', () => {
    const s = useApp.getState();
    const inv = s.invoices.find((i) => invoiceBalance(i, s.payments, s.creditNotes) > 0)!;
    const bal = invoiceBalance(inv, s.payments, s.creditNotes);
    expect(() => s.recordPayment(inv.id, { amount: bal + 100, date: todayIso(), method: 'UPI' })).toThrow(/more than the balance/);
    const p = s.recordPayment(inv.id, { amount: bal, date: todayIso(), method: 'UPI', reference: ' UTR123 ' });
    expect(p.reference).toBe('UTR123');
    const after = useApp.getState();
    expect(invoiceBalance(inv, after.payments, after.creditNotes)).toBe(0);
    expect(() => after.recordPayment(inv.id, { amount: 100, date: todayIso(), method: 'UPI' })).toThrow(/fully paid/);
  });
  it('events and prospect persist; the prospect survives Reset demo data', () => {
    const s = useApp.getState();
    s.addEvent(s.invoices[0].id, 'whatsapp', 'test');
    s.setProspect({ name: 'Asha', phone: '9876543210' });
    expect(useApp.getState().events).toHaveLength(1);
    useApp.getState().resetDemo();
    expect(useApp.getState().events).toHaveLength(0);
    expect(useApp.getState().prospect.name).toBe('Asha');
  });
  it('migrates v1 data forward without losing invoices, and resets junk', () => {
    const v1 = { ...generateSeed('2026-11-12') } as Partial<ReturnType<typeof generateSeed>>;
    delete v1.events; delete v1.prospect;
    const m = migrateState(v1, 1);
    expect(m.invoices).toHaveLength(110);
    expect(m.events).toEqual([]);
    expect(m.prospect).toEqual({ name: '', phone: '' });
    expect(SCHEMA_VERSION).toBe(4);
    expect(m.activeId).toBe('biz-sse');
    expect(Object.keys(m.others).sort()).toEqual(['biz-aarambh', 'biz-brightsteel', 'biz-omhardware', 'biz-pixelkraft', 'biz-precision']);
    expect(m.mode).toBe('owner');
    expect(migrateState({ nope: 1 }, 1).invoices).toHaveLength(110);
  });
});
