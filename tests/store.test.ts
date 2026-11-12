// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { LockedInvoiceError } from '@/lib/domain/locking';
import { migrateState, SCHEMA_VERSION, useApp } from '@/lib/store';

describe('store', () => {
  beforeEach(() => useApp.getState().resetDemo());

  it('patching an issued (locked) invoice throws', () => {
    const inv = useApp.getState().invoices[0];
    expect(() => useApp.getState().patchInvoice(inv.id, { dueDate: '2030-01-01' })).toThrow(LockedInvoiceError);
  });
  it('customer with invoices cannot be deleted; a new one can', () => {
    const s = useApp.getState();
    expect(() => s.deleteCustomer(s.invoices[0].customerId)).toThrow();
    s.upsertCustomer({ id: 'c-new', name: 'Temp', type: 'B2C', stateCode: '27', city: 'Kalyan', billingAddress: 'x', shippingAddress: 'x', phone: '', email: '', termsDays: 0 });
    expect(useApp.getState().customers.some((c) => c.id === 'c-new')).toBe(true);
    useApp.getState().deleteCustomer('c-new');
    expect(useApp.getState().customers.some((c) => c.id === 'c-new')).toBe(false);
  });
  it('GST change from a date keeps earlier history and resets CA verified', () => {
    const id = useApp.getState().items[0].id;
    useApp.getState().setCaVerified(id, true);
    useApp.getState().changeGstRateFrom(id, '2030-01-01', 12);
    const it = useApp.getState().items.find((i) => i.id === id)!;
    expect(it.rates.map((r) => r.gstRate)).toEqual([18, 12]);
    expect(it.caVerified).toBe(false);
  });
  it('reset restores the exact original dataset', () => {
    const before = JSON.stringify(useApp.getState().invoices);
    useApp.getState().upsertItem({ id: 'zz', name: 'zz', hsn: '1234', unit: 'Pcs', category: 'x', rates: [], caVerified: false });
    useApp.getState().resetDemo();
    expect(JSON.stringify(useApp.getState().invoices)).toBe(before);
    expect(useApp.getState().items).toHaveLength(40);
  });
  it('migration keeps current-version data and resets old or corrupt data', () => {
    const cur = { ...useApp.getState() };
    expect(migrateState(cur, SCHEMA_VERSION).invoices).toHaveLength(110);
    expect(migrateState({ junk: true }, SCHEMA_VERSION).invoices).toHaveLength(110);
    expect(migrateState(cur, 0).invoices).toHaveLength(110);
    expect(migrateState(null, SCHEMA_VERSION).customers).toHaveLength(25);
  });
});

describe('store: drafts and issue', () => {
  it('saves a draft, issues it with the next consecutive number, then locks it', async () => {
    const { canonicalDraft } = await import('@/lib/domain/builder');
    const st = useApp.getState();
    st.resetDemo();
    const s = useApp.getState();
    const today = s.invoices[s.invoices.length - 1].date;
    const d = canonicalDraft(s.business, s.customers, s.items, today, 'draft-x');
    s.saveDraft(d);
    expect(useApp.getState().invoices.find((i) => i.id === 'draft-x')!.number).toBeNull();
    s.saveDraft({ ...d, reverseCharge: true }); // drafts stay editable
    const issued = useApp.getState().issueDraft('draft-x');
    expect(issued.number).toBe('SSE/26-27/0419');
    expect(issued.lockedAt).toBeTruthy();
    expect(() => useApp.getState().saveDraft(d)).toThrow(LockedInvoiceError);
    expect(() => useApp.getState().issueDraft('draft-x')).toThrow();
    expect(() => useApp.getState().discardDraft('draft-x')).toThrow();
  });
});
