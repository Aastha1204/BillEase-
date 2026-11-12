'use client';
import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { invoiceMessage } from '@/lib/domain/messages';
import type { Invoice } from '@/lib/domain/types';
import { blobToBase64, messageCtx, recipientDefaults } from '@/lib/delivery';
import { buildPdfBlob, pdfFileName } from '@/lib/pdf/client';
import { downloadBlob } from '@/lib/download';
import { useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * With RESEND_API_KEY set on the server the email is sent with the PDF attached (POST /api/send-email).
 * Without it we open a mailto: draft and download the PDF so it can be attached by hand.
 */
export function SendEmailModal({ open, onClose, inv, business, balance, onDone }: {
  open: boolean; onClose: () => void; inv: Invoice; business: Business; balance: number; onDone: (msg: string) => void;
}) {
  const { customers, prospect, addEvent } = useApp();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const d = recipientDefaults(inv, customers, prospect);
    setTo(d.email); setErr('');
    setSubject(`Invoice ${inv.number} from ${business.tradeName}`);
    setBody(invoiceMessage('en', messageCtx(inv, business, balance, d.name), business.settings.templates));
    fetch('/api/send-email').then((r) => r.json()).then((j) => setEnabled(!!j.enabled)).catch(() => setEnabled(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!EMAIL.test(to.trim())) { setErr('Enter a valid email address'); return; }
    setErr(''); setBusy(true);
    try {
      const blob = await buildPdfBlob({ inv, business, balance });
      if (enabled) {
        const res = await fetch('/api/send-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: to.trim(), subject, text: body, filename: pdfFileName(inv), pdfBase64: await blobToBase64(blob) }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? 'Could not send the email');
        addEvent(inv.id, 'email', `to ${to.trim()} (PDF attached)`);
        onDone(`Email sent to ${to.trim()}`);
      } else {
        downloadBlob(pdfFileName(inv), blob);
        window.location.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        addEvent(inv.id, 'email', `draft opened for ${to.trim()} (PDF downloaded to attach)`);
        onDone('Email draft opened and PDF downloaded. Attach it and send.');
      }
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send by email"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={send} disabled={busy} data-testid="email-send"><Mail size={16} /> {busy ? 'Working…' : enabled ? 'Send email' : 'Open email draft'}</Button></>}>
      <Field label="To" error={err}><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} data-testid="email-to" /></Field>
      <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Message"><textarea className="input text-xs" rows={7} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <p className="text-xs text-mute">
        {enabled === null ? 'Checking email settings…' : enabled ? 'The email is sent from the server with the PDF attached.'
          : 'Email sending is not configured on this server, so your email app opens with a draft and the PDF is downloaded to attach.'}
      </p>
    </Modal>
  );
}
