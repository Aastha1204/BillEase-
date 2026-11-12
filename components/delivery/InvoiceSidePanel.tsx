'use client';
import clsx from 'clsx';
import { Bell, CheckCircle2, Circle, CreditCard, Download, FileCheck2, Mail, MessageCircle, FilePlus2, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { ladderFor, type StepId } from '@/lib/domain/messages';
import { formatDate, formatINR } from '@/lib/domain/money';
import { invoiceStatus } from '@/lib/domain/payments';
import { buildTimeline, type TimelineKind } from '@/lib/domain/timeline';
import type { Invoice } from '@/lib/domain/types';
import { downloadCreditNotePdf } from '@/lib/pdf/client';
import { todayIso, useApp } from '@/lib/store';
import { StatusChip } from '../StatusChip';
import { Button, Toast } from '../ui';
import { ReminderModal } from './ReminderModal';

const ICON: Record<TimelineKind, typeof Circle> = { created: FilePlus2, issued: FileCheck2, whatsapp: MessageCircle, email: Mail, reminder: Bell, payment: CreditCard, credit: Receipt };

/** Status, balance, payments, reminder ladder and timeline for an issued invoice. */
export function InvoiceSidePanel({ inv, business, balance }: { inv: Invoice; business: Business; balance: number }) {
  const { payments, creditNotes, events } = useApp();
  const today = todayIso();
  const [step, setStep] = useState<StepId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const status = invoiceStatus(inv, payments, creditNotes, today);
  const mine = payments.filter((p) => p.invoiceId === inv.id);
  const linked = creditNotes.filter((c) => c.invoiceId === inv.id);
  const ladder = useMemo(() => ladderFor(inv, events, balance, today), [inv, events, balance, today]);
  const timeline = useMemo(() => buildTimeline(inv, payments, creditNotes, events), [inv, payments, creditNotes, events]);

  return (
    <div className="space-y-4" data-testid="side-panel">
      <section className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Status</h3><span data-testid="status-chip"><StatusChip status={status} /></span></div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-xs text-mute">Balance due</span>
          <span className={clsx('num text-xl font-bold', balance > 0 ? 'text-fg' : 'text-paid')} data-testid="balance">{formatINR(Math.max(0, balance))}</span>
        </div>
        <div className="num text-xs text-mute">of {formatINR(inv.totals.grandTotal)} · due {formatDate(inv.dueDate)}</div>
        {mine.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-mute/20 pt-2 text-xs" data-testid="payments-list">
            {mine.map((p) => <li key={p.id} className="flex justify-between"><span>{formatDate(p.date)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span><span className="num font-medium text-paid">{formatINR(p.amount)}</span></li>)}
          </ul>
        )}
      </section>

      {linked.length > 0 && (
        <section className="glass rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-semibold">Credit notes</h3>
          <ul className="space-y-2" data-testid="cn-list">
            {linked.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-xs">
                <div className="min-w-0 flex-1"><div className="font-mono">{c.number}</div><div className="text-mute">{formatDate(c.date)} · {c.reason}</div></div>
                <span className="num font-medium text-amber">-{formatINR(c.totals.grandTotal)}</span>
                <Button className="!px-2 !py-1 text-xs" onClick={() => downloadCreditNotePdf(c, inv, business)} aria-label={`Download credit note ${c.number}`}><Download size={13} /> PDF</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass rounded-2xl p-4">
        <h3 className="mb-2 text-sm font-semibold">Reminder ladder</h3>
        <ul className="space-y-1.5" data-testid="ladder">
          {ladder.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs" data-state={r.state}>
              {r.state === 'sent' ? <CheckCircle2 size={14} className="text-paid" /> : <Circle size={14} className={r.state === 'due' ? 'text-amber' : 'text-mute/60'} />}
              <span className="flex-1">{r.label} <span className="text-mute">· {r.tone} · {formatDate(r.date)}</span></span>
              {r.state === 'due' && <span className="text-amber">Due</span>}
              {r.state === 'closed' && <span className="text-mute">Closed</span>}
              {(r.state === 'due' || r.state === 'upcoming') && <Button className="!px-2 !py-1 text-xs" onClick={() => setStep(r.id)} data-testid={`remind-${r.id}`}>Send</Button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-2xl p-4">
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <ol className="space-y-2.5" data-testid="timeline">
          {timeline.map((t, i) => {
            const Icon = ICON[t.kind];
            return (
              <li key={i} className="flex gap-2 text-xs" data-kind={t.kind}>
                <Icon size={14} className="mt-0.5 shrink-0 text-gold" />
                <div><div className="font-medium">{t.title}</div>{t.detail && <div className="text-mute">{t.detail}</div>}<div className="num text-mute/70">{formatDate(t.at.slice(0, 10))}</div></div>
              </li>
            );
          })}
        </ol>
      </section>
      <ReminderModal open={step !== null} onClose={() => setStep(null)} inv={inv} business={business} balance={balance} initialStep={step ?? undefined} onSent={say} />
      <Toast msg={toast} />
    </div>
  );
}
