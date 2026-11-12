'use client';
import { Bell } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { LADDER, LANG_LABEL, ladderFor, normalizePhone, reminderMessage, suggestedStep, waUrl, type Lang, type StepId } from '@/lib/domain/messages';
import type { Invoice } from '@/lib/domain/types';
import { messageCtx, recipientDefaults } from '@/lib/delivery';
import { todayIso, useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

/** One rung of the reminder ladder, sent through a prefilled wa.me link (English or Hindi). */
export function ReminderModal({ open, onClose, inv, business, balance, initialStep, onSent }: {
  open: boolean; onClose: () => void; inv: Invoice; business: Business; balance: number; initialStep?: StepId; onSent: (msg: string) => void;
}) {
  const { customers, prospect, events, addEvent, setProspect } = useApp();
  const [step, setStep] = useState<StepId>('due');
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const d = recipientDefaults(inv, customers, prospect);
    setName(d.name); setPhone(d.phone); setErr('');
    setStep(initialStep ?? suggestedStep(ladderFor(inv, events, balance, todayIso())) ?? 'due');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = useMemo(() => (open ? reminderMessage(step, lang, messageCtx(inv, business, balance, name), business.settings.templates) : ''), [open, step, lang, name, inv, business, balance]);
  const p = normalizePhone(phone);

  function send() {
    if (!p.ok) { setErr(p.error ?? 'Enter a valid number'); return; }
    // Only a number you typed yourself becomes the demo prospect; the customer's own number must not stick.
    if (p.digits !== recipientDefaults(inv, customers, { name: '', phone: '' }).phone) setProspect({ name, phone: p.digits! });
    window.open(waUrl(p.digits!, text), '_blank', 'noopener');
    const label = LADDER.find((s) => s.id === step)!.label;
    addEvent(inv.id, 'reminder', `${label} (${lang === 'hi' ? 'Hindi' : 'English'}) to +91 ${p.digits}`, step);
    onSent(`Reminder opened in WhatsApp (${label})`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Send reminder · ${inv.number}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={send} data-testid="reminder-send"><Bell size={16} /> Open WhatsApp</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Step"><select className="input" value={step} onChange={(e) => setStep(e.target.value as StepId)} data-testid="reminder-step">{LADDER.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.tone})</option>)}</select></Field>
        <Field label="Language"><select className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>{(Object.keys(LANG_LABEL) as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</select></Field>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="WhatsApp number (+91)" error={err}><input className="input num" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="reminder-phone" /></Field>
      </div>
      <Field label="Message preview"><textarea className="input text-xs" rows={7} readOnly value={text} /></Field>
    </Modal>
  );
}
