'use client';
import { useEffect, useMemo, useState } from 'react';
import { NumberInput } from '../builder/CommitInput';
import { creditEffect } from '@/lib/domain/creditNote';
import { formatINR } from '@/lib/domain/money';
import { CREDIT_REASONS, createCreditNote, invoiceBalance, remainingQty } from '@/lib/domain/payments';
import type { CreditNote, Invoice } from '@/lib/domain/types';
import { todayIso, useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

/** Credit note from an issued invoice: lines pre-filled, full or partial, with a reason. Issued invoices are never edited. */
export function CreditNoteModal({ open, onClose, inv, onCreated }: { open: boolean; onClose: () => void; inv: Invoice; onCreated: (cn: CreditNote) => void }) {
  const { creditNotes, payments, issueCreditNote } = useApp();
  const prior = useMemo(() => creditNotes.filter((c) => c.invoiceId === inv.id), [creditNotes, inv.id]);
  const room = useMemo(() => remainingQty(inv, creditNotes), [inv, creditNotes]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>(CREDIT_REASONS[0]);
  const [date, setDate] = useState(todayIso());
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setQty({ ...room }); setReason(CREDIT_REASONS[0]); setDate(todayIso()); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    try { return createCreditNote(inv, { id: 'preview', number: 'preview', date, reason, qtyByLine: qty }, prior); } catch { return null; }
  }, [inv, date, reason, qty, prior]);
  const balance = invoiceBalance(inv, payments, creditNotes);
  const effect = preview ? creditEffect(balance, preview.totals.grandTotal) : null;
  const nothingLeft = Object.values(room).every((v) => v <= 0);

  function create() {
    try {
      const cn = issueCreditNote(inv.id, { reason, qtyByLine: qty, date });
      onCreated(cn);
      onClose();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={`Create credit note · ${inv.number}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!preview || nothingLeft} onClick={create} data-testid="cn-create">Create credit note</Button></>}>
      {nothingLeft ? <p className="text-sm text-mute">Every line of this invoice has already been credited in full.</p> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-mute/20">
            <table className="w-full min-w-[560px] text-sm" data-testid="cn-lines">
              <thead className="text-xs text-mute"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Invoiced</th><th className="p-2 text-right">Credited</th><th className="w-28 p-2 text-right">Credit qty</th></tr></thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.id} className="border-t border-mute/15">
                    <td className="p-2">{l.description}</td>
                    <td className="num p-2 text-right">{l.qty} {l.unit}</td>
                    <td className="num p-2 text-right text-mute">{Math.round((l.qty - (room[l.id] ?? 0)) * 1000) / 1000}</td>
                    <td className="p-2"><NumberInput value={qty[l.id] ?? 0} max={room[l.id] ?? 0} disabled={(room[l.id] ?? 0) <= 0} onChange={(n) => setQty((q) => ({ ...q, [l.id]: n }))} aria-label={`Credit qty for ${l.description}`} className="text-right" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 text-xs">
            <button className="text-gold underline" onClick={() => setQty({ ...room })} data-testid="cn-full">Credit in full</button>
            <button className="text-gold underline" onClick={() => setQty(Object.fromEntries(inv.lines.map((l) => [l.id, 0])))}>Clear</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cn-reason">{CREDIT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Credit note date" error={err}><input type="date" className="input" value={date} min={inv.date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          </div>
          <div className="glass space-y-1 rounded-xl p-3 text-sm" data-testid="cn-summary">
            <div className="flex justify-between"><span className="text-mute">Credit value (incl. GST)</span><span className="num font-semibold">{preview ? formatINR(preview.totals.grandTotal) : '—'}</span></div>
            <div className="flex justify-between"><span className="text-mute">Invoice balance now</span><span className="num">{formatINR(Math.max(0, balance))}</span></div>
            {effect && <div className="flex justify-between"><span className="text-mute">Balance after credit note</span><span className="num font-semibold">{formatINR(effect.after)}</span></div>}
            {effect && effect.customerCredit > 0 && <p className="text-xs text-amber">The credit is more than the balance: {formatINR(effect.customerCredit)} is owed back to the customer.</p>}
          </div>
          <p className="text-xs text-mute">The credit note gets its own number series and a PDF titled CREDIT NOTE that quotes this invoice. This invoice stays locked.</p>
        </>
      )}
    </Modal>
  );
}
