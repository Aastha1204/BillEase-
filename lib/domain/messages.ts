import { addDays, daysBetween } from './payments';
import type { InvoiceEvent, MessageTemplates } from './entities';
import type { Invoice } from './types';

export type Lang = 'en' | 'hi';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', hi: 'हिन्दी (Hindi)' };

export interface MsgCtx {
  firstName: string; number: string; tradeName: string;
  amount: string;   // formatted, e.g. "₹41,868.00"
  dueDate: string;  // formatted, e.g. "27-Nov-2026"
  link: string; vpa: string;
}

const fill = (tpl: string, c: MsgCtx) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => (c as unknown as Record<string, string>)[k] ?? '');

const INVOICE: Record<Lang, string> = {
  en: 'Namaste {firstName} ji 🙏\nInvoice {number} from {tradeName}\nAmount: {amount} · Due: {dueDate}\nView & pay: {link}\nUPI: {vpa}\nThank you for your business!',
  hi: 'नमस्ते {firstName} जी 🙏\n{tradeName} की ओर से इनवॉइस {number}\nराशि: {amount} · देय तिथि: {dueDate}\nदेखें और भुगतान करें: {link}\nUPI: {vpa}\nआपके व्यवसाय के लिए धन्यवाद!',
};
export const defaultInvoiceTemplate = (lang: Lang) => INVOICE[lang];
export const invoiceMessage = (lang: Lang, c: MsgCtx, t?: MessageTemplates) => fill(t?.invoice?.[lang] || INVOICE[lang], c);

/** Reminder ladder: 2 days before due (gentle), on the due date, 3 days overdue (firm), 7 days overdue (final). */
export const LADDER = [
  { id: 'pre2', offset: -2, label: '2 days before due', tone: 'Gentle' },
  { id: 'due', offset: 0, label: 'On the due date', tone: 'Due today' },
  { id: 'late3', offset: 3, label: '3 days overdue', tone: 'Firm' },
  { id: 'late7', offset: 7, label: '7 days overdue', tone: 'Final' },
] as const;
export type StepId = (typeof LADDER)[number]['id'];

const REMINDER: Record<StepId, Record<Lang, string>> = {
  pre2: {
    en: 'Namaste {firstName} ji 🙏\nA gentle reminder: invoice {number} for {amount} is due on {dueDate}.\nView & pay: {link}\nUPI: {vpa}\nThank you!',
    hi: 'नमस्ते {firstName} जी 🙏\nएक विनम्र याद दिलाना: इनवॉइस {number} की राशि {amount} की देय तिथि {dueDate} है।\nदेखें और भुगतान करें: {link}\nUPI: {vpa}\nधन्यवाद!',
  },
  due: {
    en: 'Namaste {firstName} ji 🙏\nInvoice {number} for {amount} is due today ({dueDate}).\nView & pay: {link}\nUPI: {vpa}\nThank you!',
    hi: 'नमस्ते {firstName} जी 🙏\nइनवॉइस {number} की राशि {amount} आज ({dueDate}) देय है।\nदेखें और भुगतान करें: {link}\nUPI: {vpa}\nधन्यवाद!',
  },
  late3: {
    en: 'Hello {firstName} ji,\nInvoice {number} for {amount} was due on {dueDate} and is now overdue. Please arrange the payment at the earliest.\nPay here: {link}\nUPI: {vpa}',
    hi: 'नमस्ते {firstName} जी,\nइनवॉइस {number} की राशि {amount} की देय तिथि {dueDate} थी और अब विलंबित है। कृपया जल्द से जल्द भुगतान करें।\nयहाँ भुगतान करें: {link}\nUPI: {vpa}',
  },
  late7: {
    en: 'Final reminder, {firstName} ji.\nInvoice {number} for {amount} (due {dueDate}) is still unpaid. Please pay today or call us if there is an issue.\nPay here: {link}\nUPI: {vpa}',
    hi: 'अंतिम अनुस्मारक, {firstName} जी।\nइनवॉइस {number} की राशि {amount} (देय {dueDate}) अभी भी बकाया है। कृपया आज ही भुगतान करें या कोई समस्या हो तो हमसे संपर्क करें।\nयहाँ भुगतान करें: {link}\nUPI: {vpa}',
  },
};
export const defaultReminderTemplate = (step: StepId, lang: Lang) => REMINDER[step][lang];
export const reminderMessage = (step: StepId, lang: Lang, c: MsgCtx, t?: MessageTemplates) => fill(t?.reminder?.[step]?.[lang] || REMINDER[step][lang], c);

export const TEMPLATE_TOKENS = ['firstName', 'number', 'tradeName', 'amount', 'dueDate', 'link', 'vpa'] as const;
/** Tokens used in a template that we do not know (shown as a warning; they would be sent as blanks). */
export function unknownTokens(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].filter((k) => !(TEMPLATE_TOKENS as readonly string[]).includes(k));
}

export type LadderState = 'sent' | 'due' | 'upcoming' | 'closed';
export interface LadderRow { id: StepId; label: string; tone: string; date: string; state: LadderState }

/**
 * Where each reminder step stands. `due` = its date has arrived and it has not been sent;
 * once the invoice is fully paid every unsent step is `closed`.
 */
export function ladderFor(inv: Pick<Invoice, 'id' | 'dueDate'>, events: InvoiceEvent[], balance: number, today: string): LadderRow[] {
  return LADDER.map((s) => {
    const date = addDays(inv.dueDate, s.offset);
    const sent = events.some((e) => e.invoiceId === inv.id && e.type === 'reminder' && e.step === s.id);
    const state: LadderState = sent ? 'sent' : balance <= 0 ? 'closed' : date <= today ? 'due' : 'upcoming';
    return { id: s.id, label: s.label, tone: s.tone, date, state };
  });
}

/** The reminder to send now: the latest step whose date has arrived and was not sent yet. */
export function suggestedStep(rows: LadderRow[]): StepId | null {
  const due = rows.filter((r) => r.state === 'due');
  return due.length ? due[due.length - 1].id : null;
}

export function daysOverdue(inv: Pick<Invoice, 'dueDate'>, today: string) {
  return Math.max(0, daysBetween(inv.dueDate, today));
}

/** Indian mobile: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9. */
export function normalizePhone(input: string): { ok: boolean; digits?: string; error?: string } {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^\d{10}$/.test(d)) return { ok: false, error: 'Enter a 10-digit mobile number' };
  if (!/^[6-9]/.test(d)) return { ok: false, error: 'Indian mobile numbers start with 6, 7, 8 or 9' };
  return { ok: true, digits: d };
}

export const waUrl = (digits10: string, text: string) => `https://wa.me/91${digits10}?text=${encodeURIComponent(text)}`;
export const firstNameOf = (name: string) => (name.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'there');
