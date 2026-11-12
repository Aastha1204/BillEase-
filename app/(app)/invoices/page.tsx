'use client';
import Link from 'next/link';
import { Bell, Download, Eye, Plus, Receipt, Search, Wallet } from 'lucide-react';
import { CreditNoteModal } from '@/components/credit/CreditNoteModal';
import { useMemo, useState } from 'react';
import { RecordPaymentModal } from '@/components/delivery/RecordPaymentModal';
import { celebrate, PaidSweep } from '@/components/delivery/paid';
import { ReminderModal } from '@/components/delivery/ReminderModal';
import { StatusChip } from '@/components/StatusChip';
import { Button, Chip, Toast } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { formatDate, formatINR, toDecimalString } from '@/lib/domain/money';
import { invoiceBalance, invoiceStatus, type InvoiceStatus } from '@/lib/domain/payments';
import { classify } from '@/lib/domain/reports';
import type { Invoice } from '@/lib/domain/types';
import { downloadText } from '@/lib/download';
import { formatCsvDate } from '@/lib/format';
import { todayIso, useApp } from '@/lib/store';

const STATUSES: ('all' | InvoiceStatus)[] = ['all', 'Draft', 'Unpaid', 'Partly paid', 'Paid', 'Overdue'];

/** Filters, row actions (view, record payment, send reminder; credit note arrives with Phase 7) and bulk CSV export. */
export default function InvoicesPage() {
  const { invoices, payments, creditNotes, customers, business } = useApp();
  const today = todayIso();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [kind, setKind] = useState<'all' | 'B2B' | 'B2C'>('all');
  const [supply, setSupply] = useState<'all' | 'intra' | 'inter'>('all');
  const [customer, setCustomer] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [remFor, setRemFor] = useState<Invoice | null>(null);
  const [cnFor, setCnFor] = useState<Invoice | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sweep, setSweep] = useState(0);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return invoices
      .map((i) => ({ inv: i, st: invoiceStatus(i, payments, creditNotes, today), bal: invoiceBalance(i, payments, creditNotes) }))
      .filter(({ inv, st }) =>
        (status === 'all' || st === status) && (kind === 'all' || (kind === 'B2B') === inv.isB2B) && (supply === 'all' || inv.totals.supply === supply)
        && (customer === 'all' || inv.customerId === customer) && (!from || inv.date >= from) && (!to || inv.date <= to)
        && (!t || (inv.number ?? 'draft').toLowerCase().includes(t) || inv.customer.name.toLowerCase().includes(t)))
      .sort((a, b) => (!a.inv.lockedAt !== !b.inv.lockedAt ? (a.inv.lockedAt ? 1 : -1) : b.inv.date.localeCompare(a.inv.date) || (b.inv.number ?? '').localeCompare(a.inv.number ?? '')));
  }, [invoices, payments, creditNotes, today, q, status, kind, supply, customer, from, to]);

  const exportCsv = () => downloadText(`invoices-${today}.csv`, toCsv([
    ['Invoice no.', 'Date', 'Due date', 'Customer', 'GSTIN', 'Type', 'Category', 'Place of supply', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round off', 'Total', 'Balance', 'Status'],
    ...rows.filter((r) => r.inv.lockedAt).map(({ inv, st, bal }) => [
      inv.number ?? '', formatCsvDate(inv.date), formatCsvDate(inv.dueDate), inv.customer.name, inv.customer.gstin ?? '', inv.isB2B ? 'B2B' : 'B2C', classify(inv, business.settings.b2clThreshold),
      inv.placeOfSupply, ...[inv.totals.taxable, inv.totals.cgst, inv.totals.sgst, inv.totals.igst, inv.totals.roundOff, inv.totals.grandTotal, bal].map(toDecimalString), st,
    ]),
  ]), 'text/csv');

  const sel = 'input w-auto';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Invoices <span className="num text-sm font-normal text-mute" data-testid="count">({rows.length})</span></h1>
        <Button onClick={exportCsv} data-testid="export-csv"><Download size={16} /> CSV</Button>
        <Link href="/invoices/new"><Button variant="primary"><Plus size={16} /> New invoice</Button></Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        </div>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" data-testid="f-status">{STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</select>
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="B2B or B2C"><option value="all">B2B + B2C</option><option value="B2B">B2B</option><option value="B2C">B2C</option></select>
        <select className={sel} value={supply} onChange={(e) => setSupply(e.target.value as typeof supply)} aria-label="Intra or inter-state"><option value="all">Intra + inter</option><option value="intra">Intra-state</option><option value="inter">Inter-state</option></select>
        <select className={sel} value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Customer"><option value="all">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="date" className={sel} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" className={sel} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        {(status !== 'all' || kind !== 'all' || supply !== 'all' || customer !== 'all' || from || to || q) &&
          <button className="text-xs text-gold underline" onClick={() => { setStatus('all'); setKind('all'); setSupply('all'); setCustomer('all'); setFrom(''); setTo(''); setQ(''); }}>Clear filters</button>}
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs text-mute"><tr>{['Number', 'Date', 'Customer', 'Type', 'Total', 'Balance', 'Status', ''].map((h, i) => <th key={i} className={`px-4 py-3 font-medium ${h === 'Total' || h === 'Balance' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 300).map(({ inv, st, bal }) => (
              <tr key={inv.id} className="border-t border-mute/15 hover:bg-mute/10" data-testid="inv-row" data-status={st}>
                <td className="px-4 py-3 font-mono text-xs"><Link href={`/invoices/${inv.id}`} className="text-gold hover:underline">{inv.number ?? 'Draft'}</Link></td>
                <td className="num px-4 py-3">{formatDate(inv.date)}</td>
                <td className="px-4 py-3">{inv.customer.name || <span className="text-mute">No customer yet</span>}</td>
                <td className="px-4 py-3 text-xs"><Chip tone={inv.isB2B ? 'info' : 'mute'}>{inv.isB2B ? 'B2B' : 'B2C'}</Chip>{inv.totals.supply === 'inter' && <span className="ml-1"><Chip tone="igst">IGST</Chip></span>}</td>
                <td className="num px-4 py-3 text-right">{formatINR(inv.totals.grandTotal)}</td>
                <td className="num px-4 py-3 text-right">{inv.lockedAt ? formatINR(Math.max(0, bal)) : '—'}</td>
                <td className="px-4 py-3"><StatusChip status={st} /></td>
                <td className="whitespace-nowrap px-2 py-3 text-right">
                  <Link href={`/invoices/${inv.id}`} className="inline-block rounded p-1.5 hover:bg-mute/15" title="View" aria-label={`View ${inv.number ?? 'draft'}`}><Eye size={16} /></Link>
                  {inv.lockedAt && <button className="rounded p-1.5 hover:bg-mute/15" title="Create credit note" aria-label={`Create credit note for ${inv.number}`} onClick={() => setCnFor(inv)} data-testid="row-cn"><Receipt size={16} /></button>}
                  {inv.lockedAt && bal > 0 && <>
                    <button className="rounded p-1.5 hover:bg-mute/15" title="Record payment" aria-label={`Record payment for ${inv.number}`} onClick={() => setPayFor(inv)} data-testid="row-pay"><Wallet size={16} /></button>
                    <button className="rounded p-1.5 hover:bg-mute/15" title="Send reminder" aria-label={`Send reminder for ${inv.number}`} onClick={() => setRemFor(inv)} data-testid="row-remind"><Bell size={16} /></button>
                  </>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-mute">No invoices match.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && <p className="text-xs text-mute">Showing the first 300 of {rows.length}. Narrow the filters to see the rest.</p>}

      {payFor && <RecordPaymentModal open onClose={() => setPayFor(null)} inv={payFor} onRecorded={(full, a) => { say(`Payment recorded ${formatINR(a)}`); if (full) { setSweep((n) => n + 1); void celebrate(); } }} />}
      {cnFor && <CreditNoteModal open onClose={() => setCnFor(null)} inv={cnFor} onCreated={(cn) => say(`Credit note ${cn.number} created`)} />}
      {remFor && <ReminderModal open onClose={() => setRemFor(null)} inv={remFor} business={business} balance={invoiceBalance(remFor, payments, creditNotes)} onSent={say} />}
      {sweep > 0 && <PaidSweep key={sweep} />}
      <Toast msg={toast} />
    </div>
  );
}
