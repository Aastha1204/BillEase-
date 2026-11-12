import type { Paise } from './money';
import { computeInvoice } from './tax';
import type { CreditNote, Invoice, LineInput, Payment } from './types';

export type InvoiceStatus = 'Draft' | 'Unpaid' | 'Partly paid' | 'Paid' | 'Overdue';

export function invoiceBalance(inv: Invoice, payments: Payment[], creditNotes: CreditNote[]): Paise {
  const paid = payments.filter((p) => p.invoiceId === inv.id).reduce((a, p) => a + p.amount, 0);
  const credited = creditNotes.filter((c) => c.invoiceId === inv.id).reduce((a, c) => a + c.totals.grandTotal, 0);
  return inv.totals.grandTotal - paid - credited;
}

/** Overdue is computed: due date passed and balance > 0. `today` is ISO yyyy-mm-dd. */
export function invoiceStatus(inv: Invoice, payments: Payment[], creditNotes: CreditNote[], today: string): InvoiceStatus {
  if (!inv.lockedAt) return 'Draft';
  const balance = invoiceBalance(inv, payments, creditNotes);
  if (balance <= 0) return 'Paid';
  if (inv.dueDate < today) return 'Overdue';
  const paid = payments.some((p) => p.invoiceId === inv.id && p.amount > 0);
  return paid ? 'Partly paid' : 'Unpaid';
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(fromIso: string, toIso: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(toIso) - t(fromIso)) / 86400000);
}

/** Quantity per line that can still be credited (invoiced qty minus earlier credit notes). */
export function remainingQty(inv: Invoice, creditNotes: CreditNote[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of inv.lines) {
    const done = creditNotes.filter((c) => c.invoiceId === inv.id).reduce((a, c) => a + (c.lines.find((x) => x.id === l.id)?.qty ?? 0), 0);
    out[l.id] = Math.round((l.qty - done) * 1000) / 1000;
  }
  return out;
}

export const CREDIT_REASONS = ['Sales return', 'Rate difference', 'Post-sale discount', 'Deficiency in service', 'Other'] as const;

/**
 * Credit note from an issued invoice. `qtyByLine` gives the quantity credited per line id
 * (omit = full). Same rate, discount %, GST rate and supply type as the original.
 */
export function createCreditNote(
  inv: Invoice,
  args: { id: string; number: string; date: string; reason: string; qtyByLine?: Record<string, number>; roundOff?: boolean },
  prior: CreditNote[] = [],
): CreditNote {
  if (!inv.lockedAt || !inv.number) throw new Error('Credit notes can only be raised against issued invoices');
  const lines: LineInput[] = [];
  for (const l of inv.lines) {
    const room = remainingQty(inv, prior)[l.id] ?? 0;
    const qty = args.qtyByLine ? (args.qtyByLine[l.id] ?? 0) : room; // omitted = credit everything still creditable
    if (qty < 0 || qty > room) throw new Error(`Credit qty for "${l.description}" exceeds what is left to credit (${room})`);
    if (qty === 0) continue;
    // A flat discount is pro-rated to the credited quantity.
    const discount = l.discount.kind === 'flat'
      ? { kind: 'flat' as const, value: Math.round((l.discount.value * qty) / l.qty) }
      : l.discount;
    lines.push({ ...l, qty, discount });
  }
  if (!lines.length) throw new Error('Select at least one line to credit');
  return {
    id: args.id, number: args.number, date: args.date, invoiceId: inv.id,
    invoiceNumber: inv.number, invoiceDate: inv.date, reason: args.reason, lines,
    totals: computeInvoice(lines, inv.totals.supply, args.roundOff ?? true),
    isB2B: inv.isB2B, placeOfSupply: inv.placeOfSupply,
    customerName: inv.customer.name, customerGstin: inv.customer.gstin,
  };
}

export const PAYMENT_METHODS = ['UPI', 'NEFT/IMPS', 'Cash', 'Cheque', 'Card'] as const;

/** Returns an error message, or null when the payment can be recorded. Part payments are allowed. */
export function validatePayment(
  inv: Invoice, payments: Payment[], creditNotes: CreditNote[],
  input: { amount: Paise; date: string; method: string }, today: string,
): string | null {
  if (!inv.lockedAt) return 'Only issued invoices can receive payments';
  if (!Number.isInteger(input.amount) || input.amount <= 0) return 'Enter an amount greater than zero';
  const balance = invoiceBalance(inv, payments, creditNotes);
  if (balance <= 0) return 'This invoice is already fully paid';
  if (input.amount > balance) return 'Amount is more than the balance due';
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) return 'Choose a payment method';
  if (input.date > today) return 'Payment date cannot be in the future';
  if (input.date < inv.date) return 'Payment date is before the invoice date';
  return null;
}
