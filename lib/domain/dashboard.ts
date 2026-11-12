import type { Paise } from './money';
import { addDays, daysBetween, invoiceBalance, invoiceStatus } from './payments';
import type { CreditNote, Invoice, Payment } from './types';

export interface AgeingBucket { label: string; amount: Paise; count: number }
export interface DashboardData {
  month: { ym: string; sales: Paise; invoices: number; outputGst: Paise; creditNotes: Paise };
  receivables: Paise;
  overdue: { amount: Paise; count: number };
  trend: { date: string; sales: Paise }[];
  gstByRate: { rate: number; tax: Paise; taxable: Paise }[];
  ageing: AgeingBucket[];
  recent: Invoice[];
  topCustomers: { name: string; total: Paise; count: number }[];
}

const AGE_BUCKETS: [string, number, number][] = [['0–15 days', 0, 15], ['16–30 days', 16, 30], ['31–60 days', 31, 60], ['60+ days', 61, Infinity]];

/**
 * Dashboard numbers from issued invoices only. Month sales and output GST are net of the month's
 * credit notes. Output GST is before input tax credit. Ageing counts days since the invoice date.
 */
export function dashboardData(invoices: Invoice[], payments: Payment[], creditNotes: CreditNote[], today: string): DashboardData {
  const issued = invoices.filter((i) => i.lockedAt && i.number && !i.cancelled);
  const ym = today.slice(0, 7);
  const inMonth = issued.filter((i) => i.date.startsWith(ym));
  const cnMonth = creditNotes.filter((c) => c.date.startsWith(ym));
  const sales = inMonth.reduce((a, i) => a + i.totals.grandTotal, 0) - cnMonth.reduce((a, c) => a + c.totals.grandTotal, 0);
  const outputGst = inMonth.reduce((a, i) => a + i.totals.totalTax, 0) - cnMonth.reduce((a, c) => a + c.totals.totalTax, 0);

  let receivables = 0, overdueAmt = 0, overdueCount = 0;
  const ageing: AgeingBucket[] = AGE_BUCKETS.map(([label]) => ({ label, amount: 0, count: 0 }));
  for (const i of issued) {
    const bal = invoiceBalance(i, payments, creditNotes);
    if (bal <= 0) continue;
    receivables += bal;
    if (invoiceStatus(i, payments, creditNotes, today) === 'Overdue') { overdueAmt += bal; overdueCount++; }
    const age = Math.max(0, daysBetween(i.date, today));
    const k = AGE_BUCKETS.findIndex(([, lo, hi]) => age >= lo && age <= hi);
    ageing[k].amount += bal; ageing[k].count++;
  }

  const start = addDays(today, -89);
  const byDay = new Map<string, number>();
  const rate = new Map<number, { rate: number; tax: number; taxable: number }>();
  const cust = new Map<string, { name: string; total: number; count: number }>();
  for (const i of issued) {
    if (i.date < start || i.date > today) continue;
    byDay.set(i.date, (byDay.get(i.date) ?? 0) + i.totals.grandTotal);
    for (const b of i.totals.byRate) {
      const e = rate.get(b.gstRate) ?? { rate: b.gstRate, tax: 0, taxable: 0 };
      e.tax += b.totalTax; e.taxable += b.taxable; rate.set(b.gstRate, e);
    }
    const c = cust.get(i.customerId || i.customer.name) ?? { name: i.customer.name, total: 0, count: 0 };
    c.total += i.totals.grandTotal; c.count++; cust.set(i.customerId || i.customer.name, c);
  }
  const trend = Array.from({ length: 90 }, (_, k) => { const d = addDays(start, k); return { date: d, sales: byDay.get(d) ?? 0 }; });

  return {
    month: { ym, sales, invoices: inMonth.length, outputGst, creditNotes: cnMonth.reduce((a, c) => a + c.totals.grandTotal, 0) },
    receivables, overdue: { amount: overdueAmt, count: overdueCount }, trend,
    gstByRate: [...rate.values()].sort((a, b) => a.rate - b.rate), ageing,
    recent: [...issued].sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? '').localeCompare(a.number ?? '')).slice(0, 6),
    topCustomers: [...cust.values()].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}
