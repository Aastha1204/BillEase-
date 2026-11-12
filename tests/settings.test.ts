import { describe, expect, it } from 'vitest';
import { defaultInvoiceTemplate, invoiceMessage, reminderMessage, unknownTokens, type MsgCtx } from '@/lib/domain/messages';
import { applyProfile, seriesPreview, validateImageFile, validateProfile, validateUpiId, type ProfileFields } from '@/lib/domain/settings';
import { generateSeed } from '@/lib/seed';

const b = generateSeed('2026-11-12').business;
const fields = (over: Partial<ProfileFields> = {}): ProfileFields => ({
  tradeName: b.tradeName, legalName: b.legalName, address: b.address, city: b.city, pincode: b.pincode, gstin: b.gstin, phone: b.phone, email: b.email,
  seriesPrefix: b.seriesPrefix, bankName: b.bankName, bankAccountMasked: b.bankAccountMasked, ifsc: b.ifsc, upiId: b.upiId, signatoryName: b.signatoryName, ...over,
});

describe('settings validation', () => {
  it('the seeded profile is valid', () => expect(validateProfile(fields())).toEqual({}));
  it('UPI ID', () => {
    expect(validateUpiId('shreesai@demo')).toBeNull();
    expect(validateUpiId('my.shop-1@okbank')).toBeNull();
    for (const bad of ['', 'noatsign', '@bank', 'a@', 'two words@bank', 'x@1bank']) expect(validateUpiId(bad), bad).not.toBeNull();
  });
  it('GSTIN, PIN, IFSC and series prefix are checked', () => {
    expect(validateProfile(fields({ gstin: '27ABJFS4821K1ZX' })).gstin).toBeTruthy();
    expect(validateProfile(fields({ pincode: '4213' })).pincode).toBeTruthy();
    expect(validateProfile(fields({ ifsc: 'bad' })).ifsc).toBeTruthy();
    expect(validateProfile(fields({ seriesPrefix: 'TOOLONGPREFIX' })).seriesPrefix).toMatch(/16/);
    expect(validateProfile(fields({ seriesPrefix: 'sse' })).seriesPrefix).toBeTruthy();
    expect(validateProfile(fields({ signatoryName: ' ' })).signatoryName).toBeTruthy();
  });
  it('series preview shows the live counter and the credit note fit', () => {
    const p = seriesPreview('SSE');
    expect(p.invoice).toBe('SSE/26-27/0001');
    expect(p.invoiceLen).toBe(14);
    expect(p.invoiceOk && p.creditNoteOk).toBe(true);
    expect(p.creditNote).toBe('SSE/CN/26-27/001');
    const five = seriesPreview('ABCDE');
    expect(five.invoiceOk).toBe(true);
    expect(five.creditNoteOk).toBe(false); // credit notes only fit up to 3 characters
    expect(seriesPreview('ABCDEF').invoiceOk).toBe(false);
  });
  it('applying a profile derives the supplier state from the GSTIN', () => {
    const out = applyProfile(b, fields({ gstin: '24AAHFS2290Q1ZO', tradeName: '  New Name ' }));
    expect(out.stateCode).toBe('24');
    expect(out.tradeName).toBe('New Name');
    expect(out.settings).toEqual(b.settings);
  });
  it('image uploads are limited by type and size', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).toMatch(/PNG/);
    expect(validateImageFile({ type: 'image/png', size: 400_000 })).toMatch(/KB/);
  });
});

describe('message template overrides', () => {
  const ctx: MsgCtx = { firstName: 'Asha', number: 'N1', tradeName: 'T', amount: '₹1.00', dueDate: 'D', link: 'L', vpa: 'v@b' };
  it('falls back to the default when there is no override', () => {
    expect(invoiceMessage('en', ctx)).toBe(invoiceMessage('en', ctx, {}));
    expect(invoiceMessage('en', ctx, { invoice: { hi: 'x' } })).toBe(invoiceMessage('en', ctx));
  });
  it('uses an override per language and per reminder step', () => {
    expect(invoiceMessage('en', ctx, { invoice: { en: 'Hi {firstName}, {number} {amount}' } })).toBe('Hi Asha, N1 ₹1.00');
    expect(reminderMessage('late7', 'hi', ctx, { reminder: { late7: { hi: 'अंतिम {number}' } } })).toBe('अंतिम N1');
    expect(reminderMessage('due', 'hi', ctx, { reminder: { late7: { hi: 'x' } } })).toContain('N1');
    expect(defaultInvoiceTemplate('en')).toContain('{firstName}');
  });
  it('flags unknown placeholders', () => {
    expect(unknownTokens('Hi {firstName} {nmae} {link} {nmae}')).toEqual(['nmae']);
    expect(unknownTokens(defaultInvoiceTemplate('hi'))).toEqual([]);
  });
});
