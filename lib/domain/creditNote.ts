import type { CreditNote, Invoice } from './types';

/**
 * A credit note shaped as an Invoice so the shared PDF layout can render it
 * (title "CREDIT NOTE", number/date of the credit note, original invoice referenced separately).
 */
export function creditNoteAsInvoice(cn: CreditNote, original: Invoice): Invoice {
  return {
    id: cn.id, number: cn.number, date: cn.date, dueDate: cn.date, customerId: original.customerId, customer: original.customer,
    isB2B: cn.isB2B, placeOfSupply: cn.placeOfSupply, shipToStateCode: original.shipToStateCode, shipToAddress: original.shipToAddress,
    reverseCharge: false, lines: cn.lines, totals: cn.totals, lockedAt: `${cn.date}T13:00:00.000Z`,
  };
}

/** Plain-words reminder of what a credit note does to the invoice. */
export function creditEffect(balanceBefore: number, creditTotal: number): { after: number; customerCredit: number } {
  const after = balanceBefore - creditTotal;
  return { after: Math.max(0, after), customerCredit: Math.max(0, -after) };
}
