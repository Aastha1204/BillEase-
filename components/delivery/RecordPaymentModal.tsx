'use client';
import { useEffect, useState } from 'react';
import { MoneyInput } from '../builder/CommitInput';
import { formatINR } from '@/lib/domain/money';
import { invoiceBalance, PAYMENT_METHODS, validatePayment } from '@/lib/domain/payments';
import type { Invoice } from '@/lib/domain/types';
import { todayIso, useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

/** Amount defaults to the balance; part payments are fine and can be repeated. */
export function RecordPaymentModal({ open, onClose, inv, onRecorded }: { open: boolean; onClose: () => void; inv: Invoice; onRecorded: (paidInFull: boolean, amount: number) => void }) {
  const { payments, creditNotes, recordPayment } = useApp();
  const balance = invoiceBalance(inv, payments, creditNotes);
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState<string>('UPI');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(todayIso());
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setAmount(balance); setMethod('UPI'); setRef(''); setDate(todayIso()); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    const msg = validatePayment(inv, payments, creditNotes, { amount, date, method }, todayIso());
    if (msg) { setErr(msg); return; }
    try {
      recordPayment(inv.id, { amount, date, method, reference: ref });
      onRecorded(amount === balance, amount);
      onClose();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Record payment · ${inv.number}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} data-testid="pay-save">Record payment</Button></>}>
      <p className="text-sm text-mute">Balance due <span className="num font-semibold text-fg" data-testid="pay-balance">{formatINR(balance)}</span></p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" error={err}>
          <MoneyInput paise={amount} onChange={setAmount} data-testid="pay-amount" />
        </Field>
        <Field label="Method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Reference (UTR / cheque no.)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Date"><input type="date" className="input" value={date} min={inv.date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      </div>
      {amount !== balance && <button type="button" className="text-xs text-gold underline" onClick={() => setAmount(balance)}>Use full balance</button>}
    </Modal>
  );
}
