import type { InvoiceEvent } from './entities';
import { formatINR } from './money';
import type { CreditNote, Invoice, Payment } from './types';

export type TimelineKind = 'created' | 'issued' | 'whatsapp' | 'email' | 'reminder' | 'payment' | 'credit';
export interface TimelineItem { at: string; kind: TimelineKind; title: string; detail?: string }

const ORDER: Record<TimelineKind, number> = { created: 0, issued: 1, whatsapp: 2, email: 2, reminder: 3, payment: 4, credit: 4 };

/** created -> issued -> sent -> reminder -> payment, oldest first. */
export function buildTimeline(inv: Invoice, payments: Payment[], creditNotes: CreditNote[], events: InvoiceEvent[]): TimelineItem[] {
  const out: TimelineItem[] = [{ at: `${inv.date}T08:00:00.000Z`, kind: 'created', title: 'Invoice created' }];
  if (inv.lockedAt) out.push({ at: inv.lockedAt, kind: 'issued', title: `Issued as ${inv.number}`, detail: 'Locked for editing' });
  for (const e of events.filter((x) => x.invoiceId === inv.id)) {
    out.push({
      at: e.at, kind: e.type === 'whatsapp' ? 'whatsapp' : e.type === 'email' ? 'email' : e.type === 'reminder' ? 'reminder' : 'issued',
      title: e.type === 'whatsapp' ? 'Sent on WhatsApp' : e.type === 'email' ? 'Sent by email' : e.type === 'reminder' ? 'Reminder sent' : 'Share link copied',
      detail: e.detail,
    });
  }
  for (const p of payments.filter((x) => x.invoiceId === inv.id)) {
    out.push({ at: `${p.date}T12:00:00.000Z`, kind: 'payment', title: `Payment received ${formatINR(p.amount)}`, detail: [p.method, p.reference].filter(Boolean).join(' · ') });
  }
  for (const c of creditNotes.filter((x) => x.invoiceId === inv.id)) {
    out.push({ at: `${c.date}T13:00:00.000Z`, kind: 'credit', title: `Credit note ${c.number}`, detail: `${formatINR(c.totals.grandTotal)} · ${c.reason}` });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || ORDER[a.kind] - ORDER[b.kind]);
}
