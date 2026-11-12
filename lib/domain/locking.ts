import type { Invoice } from './types';

export class LockedInvoiceError extends Error {
  constructor(id: string) {
    super(`Invoice ${id} is issued and locked. Create a credit note instead.`);
    this.name = 'LockedInvoiceError';
  }
}
export const isLocked = (inv: Pick<Invoice, 'lockedAt'>) => !!inv.lockedAt;

export function assertEditable(inv: Pick<Invoice, 'id' | 'lockedAt'>): void {
  if (inv.lockedAt) throw new LockedInvoiceError(inv.id);
}
/** Every store update goes through this; a locked invoice throws. */
export function updateInvoice(inv: Invoice, patch: Partial<Invoice>): Invoice {
  assertEditable(inv);
  return { ...inv, ...patch, id: inv.id };
}
/** Issue: assigns the number and sets lockedAt. Issuing twice throws. */
export function issueInvoice(inv: Invoice, number: string, nowIso: string): Invoice {
  assertEditable(inv);
  return { ...inv, number, lockedAt: nowIso };
}
