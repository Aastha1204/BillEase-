'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Download, Link2, Lock, LockOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { formatINR } from '@/lib/domain/money';
import type { Invoice } from '@/lib/domain/types';
import { invoiceBalance } from '@/lib/domain/payments';
import { useApp } from '@/lib/store';
import { DeliveryButtons } from '../delivery/DeliveryButtons';
import { Button, Toast } from '../ui';
import { InvoicePreview } from './InvoicePreview';
import { useInvoiceActions } from './useInvoiceActions';

/** Digits roll up like an odometer; other characters stay put. */
function Odometer({ text, go, reduce }: { text: string; go: boolean; reduce: boolean | null }) {
  let d = 0;
  return (
    <span className="inline-flex font-mono text-2xl font-bold" aria-label={text}>
      {[...text].map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} aria-hidden>{ch}</span>;
        const digit = Number(ch);
        const delay = 0.08 * d++;
        return (
          <span key={i} aria-hidden className="inline-block h-[1.2em] overflow-hidden leading-[1.2em]">
            <motion.span className="flex flex-col" initial={{ y: reduce ? `-${digit * 1.2}em` : '0em' }} animate={{ y: go ? `-${digit * 1.2}em` : '0em' }}
              transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n} className="h-[1.2em]">{n}</span>)}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * Math.PI * 2, r: 70 + (i % 4) * 22, s: 4 + (i % 3) * 2, c: i % 2 ? '#F5B544' : '#22C55E' }));

/** Stamp lands, padlock snaps shut, number rolls in, then the success sheet. */
export function IssueSequence({ inv, business, balance, onDone, autoSend }: { autoSend?: boolean; inv: Invoice; business: Business; balance: number; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? 4 : 0);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const { payments, creditNotes } = useApp();
  const live = invoiceBalance(inv, payments, creditNotes);
  const { download, copyLink, busy } = useInvoiceActions(inv, business, live, say);

  useEffect(() => {
    if (reduce) return;
    const ts = [setTimeout(() => setStage(1), 350), setTimeout(() => setStage(2), 900), setTimeout(() => setStage(3), 1300), setTimeout(() => setStage(4), 2700)];
    return () => ts.forEach(clearTimeout);
  }, [reduce]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Invoice issued" data-testid="issue-sequence">
      <div className="grid w-full max-w-4xl items-center gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="relative">
          <InvoicePreview inv={inv} business={business} />
          {stage >= 1 && (
            <motion.div initial={reduce ? false : { scale: 1.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-[5px] border-paid px-5 py-1 text-4xl font-black tracking-widest text-paid"
              style={{ boxShadow: 'inset 0 0 0 2px rgba(34,197,94,.35)', background: 'rgba(255,255,255,.55)' }} data-testid="issued-stamp">ISSUED</motion.div>
          )}
          {stage >= 1 && !reduce && (
            <div className="pointer-events-none absolute left-1/2 top-[42%]" aria-hidden>
              {PARTICLES.map((p, i) => (
                <motion.span key={i} className="absolute rounded-full" style={{ width: p.s, height: p.s, background: p.c }}
                  initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(p.a) * p.r, y: Math.sin(p.a) * p.r, opacity: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 text-center md:text-left">
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <motion.span key={stage >= 2 ? 'closed' : 'open'} initial={reduce ? false : { scale: stage >= 2 ? 1.5 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}
              className={stage >= 2 ? 'text-gold' : 'text-mute'} data-testid="padlock" data-locked={stage >= 2}>
              {stage >= 2 ? <Lock size={30} /> : <LockOpen size={30} />}
            </motion.span>
            <Odometer text={inv.number ?? ''} go={stage >= 3} reduce={reduce} />
          </div>
          {stage >= 4 ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass space-y-4 rounded-2xl p-5" data-testid="success-sheet">
              <p className="flex items-center gap-2 text-lg font-semibold"><Check className="text-paid" /> Invoice issued and locked</p>
              <p className="text-sm text-mute">{inv.customer.name} · <span className="num font-semibold text-fg">{formatINR(inv.totals.grandTotal)}</span></p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={download} disabled={busy}><Download size={16} /> {busy ? 'Preparing…' : 'Download PDF'}</Button>
                <Button onClick={copyLink}><Link2 size={16} /> Copy share link</Button>
                <DeliveryButtons inv={inv} business={business} balance={live} say={say} autoOpenWa={autoSend} />
                <Button onClick={onDone} data-testid="view-invoice">View invoice</Button>
              </div>
            </motion.div>
          ) : <div className="h-24" />}
        </div>
      </div>
      <Toast msg={toast} />
    </div>
  );
}
