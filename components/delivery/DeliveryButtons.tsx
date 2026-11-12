'use client';
import { Mail, MessageCircle, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { formatINR } from '@/lib/domain/money';
import type { Invoice } from '@/lib/domain/types';
import { DeliveryOverlay } from '../demo/DeliveryOverlay';
import { Button } from '../ui';
import { celebrate, PaidSweep } from './paid';
import { RecordPaymentModal } from './RecordPaymentModal';
import { SendEmailModal } from './SendEmailModal';
import { SendWhatsAppModal, type SentInfo } from './SendWhatsAppModal';

/** Send on WhatsApp / Send email / Record payment for an issued invoice, with their modals and animations. */
export function DeliveryButtons({ inv, business, balance, say, autoOpenWa }: { inv: Invoice; business: Business; balance: number; say: (m: string) => void; autoOpenWa?: boolean }) {
  const [wa, setWa] = useState(false);
  const [mail, setMail] = useState(false);
  const [pay, setPay] = useState(false);
  const [sent, setSent] = useState<SentInfo | null>(null);
  const [sweep, setSweep] = useState(0);
  // Presenter step 3: open the WhatsApp send straight away (the presenter still presses Send).
  useEffect(() => { if (autoOpenWa) setWa(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Button onClick={() => setWa(true)} data-testid="send-wa"><MessageCircle size={16} /> Send on WhatsApp</Button>
      <Button onClick={() => setMail(true)} data-testid="send-email"><Mail size={16} /> Send email</Button>
      {balance > 0 && <Button onClick={() => setPay(true)} data-testid="record-payment"><Wallet size={16} /> Record payment</Button>}

      <SendWhatsAppModal open={wa} onClose={() => setWa(false)} inv={inv} business={business} balance={balance} onSent={(i) => { setSent(i); say(i.method === 'share' ? 'Shared with the PDF attached' : 'WhatsApp opened'); }} />
      <SendEmailModal open={mail} onClose={() => setMail(false)} inv={inv} business={business} balance={balance} onDone={say} />
      <RecordPaymentModal open={pay} onClose={() => setPay(false)} inv={inv}
        onRecorded={(full, amount) => {
          say(`Payment recorded ${formatINR(amount)}`);
          if (full) { setSweep((n) => n + 1); void celebrate(); }
        }} />
      {sent && <DeliveryOverlay inv={inv} business={business} contact={sent.contact} text={sent.text} onClose={() => setSent(null)} />}
      {sweep > 0 && <PaidSweep key={sweep} />}
    </>
  );
}
