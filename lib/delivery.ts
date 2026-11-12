import type { Business, Customer, Prospect } from './domain/entities';
import { formatDate, formatINR } from './domain/money';
import { firstNameOf, normalizePhone, type MsgCtx } from './domain/messages';
import { encodeInvoice } from './domain/share';
import type { Invoice } from './domain/types';

/** Who to message: the demo prospect if one is set, otherwise the invoice's customer. */
export function recipientDefaults(inv: Invoice, customers: Customer[], prospect: Prospect) {
  const c = customers.find((x) => x.id === inv.customerId);
  const cust = normalizePhone(c?.phone ?? '');
  return {
    name: prospect.name || inv.customer.name,
    phone: prospect.phone || (cust.ok ? cust.digits! : ''),
    email: c?.email ?? '',
  };
}

export const publicLink = (inv: Invoice, business: Business, balance: number) =>
  `${window.location.origin}/i#${encodeInvoice(inv, business, balance)}`;

export function messageCtx(inv: Invoice, business: Business, balance: number, name: string): MsgCtx {
  return {
    firstName: firstNameOf(name), number: inv.number ?? '', tradeName: business.tradeName,
    amount: formatINR(balance > 0 ? balance : inv.totals.grandTotal), dueDate: formatDate(inv.dueDate),
    link: publicLink(inv, business, balance), vpa: business.upiId,
  };
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
