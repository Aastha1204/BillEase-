import { describe, expect, it } from 'vitest';
import { formatINR, toPaise, divRound, formatDate } from '@/lib/domain/money';
import { computeInvoice, computeLine, supplyType } from '@/lib/domain/tax';
import { amountInWordsINR, amountWordsBare } from '@/lib/domain/words';
import { makeGstin, validateGstin } from '@/lib/domain/gstin';
import { checkPrefix, creditNoteFits, financialYear, nextNumber, formatInvoiceNumber } from '@/lib/domain/numbering';
import { evaluateCompliance, type ComplianceInput } from '@/lib/domain/rules';
import { assertEditable, issueInvoice, updateInvoice, LockedInvoiceError } from '@/lib/domain/locking';
import { createCreditNote, invoiceBalance, invoiceStatus } from '@/lib/domain/payments';
import { classify, creditNotesRegister, reconcile } from '@/lib/domain/reports';
import { buildUpiUri } from '@/lib/domain/upi';
import type { Invoice, LineInput, Party } from '@/lib/domain/types';

const line = (id: string, description: string, hsn: string, qty: number, rate: string, disc: number, gst: number): LineInput => ({
  id, description, hsn, qty, unit: 'Pcs', ratePaise: toPaise(rate), discount: { kind: 'percent', value: disc }, gstRate: gst,
});
const CANON: LineInput[] = [
  line('1', 'FR PVC Wire 1.5 sq mm (90 m coil)', '8544', 10, '1450.00', 5, 18),
  line('2', 'Modular Switch 6A 1-Way', '8536', 120, '38.50', 0, 18),
  line('3', 'MCB 32A Double Pole', '8536', 8, '612.00', 0, 18),
  line('4', 'Solar Street Light 30W All-in-One', '9405', 2, '6850.00', 0, 5),
];

function makeInvoice(over: Partial<Invoice> & { lines?: LineInput[]; supply?: 'intra' | 'inter' } = {}): Invoice {
  const lines = over.lines ?? CANON;
  const supply = over.supply ?? 'intra';
  const customer: Party = over.customer ?? { name: 'Patel Interiors & Contractors', address: 'Andheri East, Mumbai', gstin: '27AAKFP7316N1ZN', stateCode: '27' };
  return {
    id: over.id ?? 'inv1', number: null, date: '2026-11-12', dueDate: '2026-11-27', customerId: 'c1', customer, isB2B: true,
    placeOfSupply: supply === 'intra' ? '27' : '24', reverseCharge: false, lines,
    totals: computeInvoice(lines, supply), lockedAt: null, ...over,
  } as Invoice;
}

describe('money', () => {
  it('formats en-IN and dates', () => {
    expect(formatINR(12500000)).toBe('₹1,25,000.00');
    expect(formatINR(-38)).toBe('-₹0.38');
    expect(formatDate('2026-11-12')).toBe('12-Nov-2026');
    expect(toPaise('1,25,000.50')).toBe(12500050);
    expect(divRound(5, 10)).toBe(1);
    expect(divRound(-5, 10)).toBe(-1);
  });
});

describe('tax', () => {
  it('canonical intra-state invoice', () => {
    const t = computeInvoice(CANON, 'intra');
    expect(t.taxable).toBe(3699100);
    expect(t.cgst).toBe(243869);
    expect(t.sgst).toBe(243869);
    expect(t.igst).toBe(0);
    expect(t.roundOff).toBe(-38);
    expect(t.grandTotal).toBe(4186800);
    expect(amountInWordsINR(t.grandTotal)).toBe('Rupees Forty-One Thousand Eight Hundred Sixty-Eight Only');
  });
  it('same lines inter-state (Surat): only the split changes', () => {
    const t = computeInvoice(CANON, 'inter');
    expect(t.igst).toBe(487738);
    expect(t.cgst + t.sgst).toBe(0);
    expect(t.grandTotal).toBe(4186800);
  });
  it('paisa edge case: 150.50 at 18%', () => {
    const l = line('x', 'x', '8536', 1, '150.50', 0, 18);
    const intra = computeLine(l, 'intra');
    expect(intra.cgst).toBe(1355);
    expect(intra.sgst).toBe(1355);
    expect(computeLine(l, 'inter').igst).toBe(2709);
  });
  it('supply type from place of supply', () => {
    expect(supplyType('27', '27')).toBe('intra');
    expect(supplyType('24', '27')).toBe('inter');
  });
});

describe('gstin', () => {
  it('validates known GSTINs', () => {
    expect(validateGstin('27AAPFU0939F1ZV').valid).toBe(true);
    const a = validateGstin('27ABJFS4821K1ZT');
    expect(a.valid).toBe(true);
    expect(a.stateName).toBe('Maharashtra');
    expect(a.pan).toBe('ABJFS4821K');
    const b = validateGstin('24AAHFS2290Q1ZO');
    expect(b.valid).toBe(true);
    expect(b.stateName).toBe('Gujarat');
  });
  it('rejects bad checksum and length; normalises case/space', () => {
    expect(validateGstin('27ABJFS4821K1ZX').valid).toBe(false);
    expect(validateGstin('27ABJFS4821K1ZX').formatOk).toBe(true);
    expect(validateGstin('27ABJFS4821K1Z').valid).toBe(false);
    expect(validateGstin(' 27abjfs4821k1zt ').valid).toBe(true);
  });
  it('seed customer GSTINs from the spec are checksum-valid', () => {
    for (const g of ['27AAKFP7316N1ZN', '27AAMFO5528R1ZC', '24AAQFN6043L1ZV']) {
      expect(validateGstin(g).valid, g).toBe(true);
    }
    expect(validateGstin(makeGstin('27', 'AAAAA1234A')).valid).toBe(true);
  });
});

describe('words', () => {
  it('lakh/crore', () => {
    expect(amountWordsBare(10000000)).toBe('One Lakh');
    expect(amountWordsBare(999999900)).toBe('Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine');
    expect(amountWordsBare(1255007550)).toBe('One Crore Twenty-Five Lakh Fifty Thousand Seventy-Five and Fifty Paise');
  });
});

describe('numbering', () => {
  it('FY boundary and sequence restart', () => {
    expect(financialYear('2027-03-31')).toBe('26-27');
    expect(financialYear('2027-04-01')).toBe('27-28');
    let c = { '26-27': 417 } as Record<string, number>;
    const a = nextNumber(c, 'SSE', '2027-03-31');
    expect(a.number).toBe('SSE/26-27/0418');
    expect(a.number.length).toBe(14);
    const b = nextNumber(a.counters, 'SSE', '2027-04-01');
    expect(b.number).toBe('SSE/27-28/0001');
  });
  it('unique, <= 16 chars; long prefix rejected', () => {
    let c: Record<string, number> = {};
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = nextNumber(c, 'SSE', '2026-11-12'); c = r.counters;
      expect(r.number.length).toBeLessThanOrEqual(16);
      seen.add(r.number);
    }
    expect(seen.size).toBe(500);
    expect(checkPrefix('ABCDEF').ok).toBe(false);
    expect(() => nextNumber({}, 'ABCDEF', '2026-11-12')).toThrow();
    expect(formatInvoiceNumber('ABCDE', '26-27', 1).length).toBe(16);
    expect(checkPrefix('ABCDE').ok).toBe(true);
    expect(creditNoteFits('SSE')).toBe(true);
    expect(creditNoteFits('ABCDE')).toBe(false);
  });
});

describe('rule 46 / B2C Rs 50,000', () => {
  const base = (grand: string, customer: ComplianceInput['customer']): ComplianceInput => {
    const lines = [{ ...line('1', 'Item', '8536', 1, grand, 0, 0) }];
    return {
      supplier: { name: 'Shree Sai Electricals', address: 'Kalyan', gstin: '27ABJFS4821K1ZT' }, date: '2026-11-12',
      isB2B: false, customer, placeOfSupply: '27', reverseCharge: false, lines,
      totals: computeInvoice(lines, 'intra', false), signatory: 'Ramesh Patil, Partner',
    };
  };
  it('blocks 50,000.00 without address, allows 49,999.99', () => {
    const blocked = evaluateCompliance(base('50000.00', { name: 'Walk-in', address: '' }));
    expect(blocked.canIssue).toBe(false);
    const ok = evaluateCompliance(base('49999.99', { name: '', address: '' }));
    expect(ok.canIssue).toBe(true);
    const full = evaluateCompliance(base('50000.00', { name: 'Sneha', address: 'Kalyan West', stateCode: '27' }));
    expect(full.canIssue).toBe(true);
    expect(full.total).toBe(15);
  });
});

describe('locking, credit notes, reports', () => {
  const issuedInv = () => issueInvoice(makeInvoice(), 'SSE/26-27/0418', '2026-11-12T10:00:00Z');
  it('locked invoice update throws', () => {
    const inv = issuedInv();
    expect(() => updateInvoice(inv, { dueDate: '2026-12-01' })).toThrow(LockedInvoiceError);
    expect(() => assertEditable(inv)).toThrow();
    expect(() => issueInvoice(inv, 'X', 'now')).toThrow();
    expect(() => updateInvoice(makeInvoice(), { dueDate: '2026-12-01' })).not.toThrow();
  });
  it('credit note reduces balance and appears in register', () => {
    const inv = issuedInv();
    const cn = createCreditNote(inv, { id: 'cn1', number: 'SSE/CN/26-27/001', date: '2026-11-15', reason: 'Sales return', qtyByLine: { '2': 20 } });
    expect(cn.invoiceNumber).toBe('SSE/26-27/0418');
    expect(invoiceBalance(inv, [], [])).toBe(4186800);
    expect(invoiceBalance(inv, [], [cn])).toBe(4186800 - cn.totals.grandTotal);
    expect(creditNotesRegister([cn], '2026-11').map((r) => r.number)).toEqual(['SSE/CN/26-27/001']);
    expect(() => createCreditNote(inv, { id: 'x', number: 'n', date: 'd', reason: 'r', qtyByLine: { '2': 999 } })).toThrow();
  });
  it('status incl. overdue and partly paid', () => {
    const inv = issuedInv();
    expect(invoiceStatus(inv, [], [], '2026-11-20')).toBe('Unpaid');
    expect(invoiceStatus(inv, [], [], '2026-12-05')).toBe('Overdue');
    const part = [{ id: 'p', invoiceId: inv.id, amount: 100000, method: 'UPI', date: '2026-11-13' }];
    expect(invoiceStatus(inv, part, [], '2026-11-20')).toBe('Partly paid');
    const full = [{ ...part[0], amount: 4186800 }];
    expect(invoiceStatus(inv, full, [], '2026-12-05')).toBe('Paid');
    expect(invoiceStatus(makeInvoice(), [], [], '2026-11-20')).toBe('Draft');
  });
  it('reconciliation holds to the paisa', () => {
    const mix: Invoice[] = [];
    for (let i = 0; i < 40; i++) {
      const ls = [line('a', 'A', '8536', 1 + (i % 7), (37.35 + i * 1.13).toFixed(2), i % 3 === 0 ? 2.5 : 0, [5, 12, 18, 28][i % 4]),
        line('b', 'B', '9405', 3 + (i % 5), (289 + i * 0.77).toFixed(2), 0, 18)];
      const inv = makeInvoice({ id: `i${i}`, lines: ls, supply: i % 8 === 0 ? 'inter' : 'intra', isB2B: i % 3 !== 0 });
      mix.push(issueInvoice(inv, `SSE/26-27/${String(i + 1).padStart(4, '0')}`, 'now'));
    }
    expect(reconcile(mix)).toEqual({ ok: true, diffs: [] });
    const broken = structuredClone(mix);
    broken[0].totals.cgst += 1;
    expect(reconcile(broken).ok).toBe(false);
  });
  it('B2CL vs B2CS', () => {
    const big = (grand: string, supply: 'intra' | 'inter') => makeInvoice({ isB2B: false, supply, lines: [line('1', 'x', '8536', 1, grand, 0, 0)] });
    expect(classify(big('100001.00', 'inter'))).toBe('B2CL');
    expect(classify(big('100000.00', 'inter'))).toBe('B2CS');
    expect(classify(big('200000.00', 'intra'))).toBe('B2CS');
    expect(classify(makeInvoice())).toBe('B2B');
  });
});

describe('upi', () => {
  it('canonical invoice URI', () => {
    const uri = buildUpiUri({ vpa: 'shreesai@demo', payeeName: 'Shree Sai Electricals', amount: 4186800, note: 'SSE/26-27/0418' });
    const q = new URLSearchParams(uri.split('?')[1]);
    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(q.get('am')).toBe('41868.00');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('tn')).toBe('SSE/26-27/0418');
    expect(uri).toContain('pn=Shree%20Sai%20Electricals');
  });
});
