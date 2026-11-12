'use client';
import { MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { invoiceMessage, LANG_LABEL, normalizePhone, waUrl, type Lang } from '@/lib/domain/messages';
import type { Invoice } from '@/lib/domain/types';
import { messageCtx, recipientDefaults } from '@/lib/delivery';
import { buildPdfBlob, pdfFileName } from '@/lib/pdf/client';
import { useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

export interface SentInfo { contact: string; text: string; method: 'share' | 'link' }

/**
 * Real WhatsApp delivery, no server needed:
 * - phones: the Web Share API shares the actual PDF file through the native share sheet;
 * - otherwise: a wa.me link opens with the message (which includes the public invoice link).
 * Production would use the WhatsApp Cloud API from the backend.
 */
export function SendWhatsAppModal({ open, onClose, inv, business, balance, onSent }: {
  open: boolean; onClose: () => void; inv: Invoice; business: Business; balance: number; onSent: (i: SentInfo) => void;
}) {
  const { customers, prospect, setProspect, addEvent } = useApp();
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [custom, setCustom] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const d = recipientDefaults(inv, customers, prospect);
    setName(d.name); setPhone(d.phone); setCustom(null); setErr(''); setFile(null);
    // Build the PDF up front so the share sheet can open immediately inside the click (browsers require a fresh user gesture).
    let dead = false;
    buildPdfBlob({ inv, business, balance }).then((b) => { if (!dead) setFile(new File([b], pdfFileName(inv), { type: 'application/pdf' })); }).catch(() => {});
    return () => { dead = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const generated = useMemo(() => (open ? invoiceMessage(lang, messageCtx(inv, business, balance, name), business.settings.templates) : ''), [open, lang, name, inv, business, balance]);
  const text = custom ?? generated;
  const p = normalizePhone(phone);
  const canShareFile = typeof navigator !== 'undefined' && !!file && !!navigator.canShare && navigator.canShare({ files: [file] });

  async function send() {
    if (!p.ok) { setErr(p.error ?? 'Enter a valid number'); return; }
    setErr('');
    // Only a number you typed yourself becomes the demo prospect; the customer's own number must not stick.
    if (p.digits !== recipientDefaults(inv, customers, { name: '', phone: '' }).phone) setProspect({ name, phone: p.digits! });
    let method: SentInfo['method'] = 'link';
    if (canShareFile && file) {
      try { await navigator.share({ files: [file], text, title: `Invoice ${inv.number}` }); method = 'share'; }
      catch (e) { if ((e as Error).name === 'AbortError') return; /* share failed: fall back to the link */ }
    }
    if (method === 'link') window.open(waUrl(p.digits!, text), '_blank', 'noopener');
    addEvent(inv.id, 'whatsapp', method === 'share' ? 'via the share sheet (PDF attached)' : `to +91 ${p.digits} (wa.me link)`);
    onSent({ contact: name, text, method });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Send on WhatsApp"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={send} data-testid="wa-send"><MessageCircle size={16} /> {canShareFile ? 'Share PDF' : 'Open WhatsApp'}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Recipient name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="wa-name" /></Field>
        <Field label="WhatsApp number (+91)" error={err}><input className="input num" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="wa-phone" /></Field>
      </div>
      <Field label="Language">
        <select className="input" value={lang} onChange={(e) => { setLang(e.target.value as Lang); setCustom(null); }}>
          {(Object.keys(LANG_LABEL) as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
        </select>
      </Field>
      <Field label="Message"><textarea className="input text-xs" rows={8} value={text} onChange={(e) => setCustom(e.target.value)} data-testid="wa-text" /></Field>
      <p className="text-xs text-mute">
        {canShareFile ? 'Your phone will open its share sheet with the real PDF attached; pick WhatsApp and the contact.'
          : 'WhatsApp opens with this message and the public invoice link. Attach the PDF from Download if you want the file too.'}
      </p>
    </Modal>
  );
}
