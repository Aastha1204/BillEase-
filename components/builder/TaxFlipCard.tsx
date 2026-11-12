'use client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatINR } from '@/lib/domain/money';
import type { InvoiceTotals } from '@/lib/domain/types';
import { Chip } from '../ui';

const rate = (r: number) => `${r}%`;
const half = (r: number) => `${r / 2}%`;

function Row({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${strong ? 'font-semibold' : ''} ${tone ?? ''}`}>
      <span>{label}</span><span className="num">{formatINR(value)}</span>
    </div>
  );
}

/** Front face: CGST + SGST by rate. Back face: IGST by rate. Rotates 180deg on the Y axis when supply flips. */
export function TaxFlipCard({ totals }: { totals: InvoiceTotals }) {
  const reduce = useReducedMotion();
  const inter = totals.supply === 'inter';
  const prev = useRef({ supply: totals.supply, total: totals.grandTotal });
  const [unchanged, setUnchanged] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (prev.current.supply !== totals.supply) {
      setUnchanged(prev.current.total === totals.grandTotal && totals.grandTotal > 0);
      setPulse((p) => p + 1);
      const t = setTimeout(() => setUnchanged(false), 3200);
      prev.current = { supply: totals.supply, total: totals.grandTotal };
      return () => clearTimeout(t);
    }
    prev.current = { supply: totals.supply, total: totals.grandTotal };
  }, [totals.supply, totals.grandTotal]);

  const front = (
    <div>
      <Row label="Taxable value" value={totals.taxable} />
      {totals.byRate.filter((b) => b.cgst + b.sgst > 0 || b.gstRate === 0).map((b) => (
        <div key={b.gstRate}>
          <Row label={`CGST ${half(b.gstRate)}`} value={b.cgst} />
          <Row label={`SGST ${half(b.gstRate)}`} value={b.sgst} />
        </div>
      ))}
      <Row label="Total tax" value={totals.totalTax} strong />
    </div>
  );
  const back = (
    <div>
      <Row label="Taxable value" value={totals.taxable} />
      {totals.byRate.filter((b) => b.igst > 0 || b.gstRate === 0).map((b) => <Row key={b.gstRate} label={`IGST ${rate(b.gstRate)}`} value={b.igst} tone="text-indigo-300" />)}
      <Row label="Total tax" value={totals.totalTax} strong />
    </div>
  );

  const faceBase: React.CSSProperties = { gridArea: '1 / 1', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  return (
    <div className="space-y-3">
      <div style={{ perspective: 1200 }} aria-live="polite" aria-label={inter ? 'Inter-state: IGST' : 'Intra-state: CGST and SGST'}>
        {reduce ? (
          <div className="glass rounded-2xl p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={inter ? 'inter' : 'intra'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {inter ? back : front}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <motion.div className="grid" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: inter ? 180 : 0 }}
            transition={{ type: 'spring', duration: 0.6, bounce: 0.15 }}>
            <div className="glass rounded-2xl p-4" style={faceBase}>{front}</div>
            <div className="glass rounded-2xl border-igst/40 p-4" style={{ ...faceBase, transform: 'rotateY(180deg)', borderColor: 'rgb(99 102 241 / 0.5)' }}>{back}</div>
          </motion.div>
        )}
      </div>
      <div className="px-1">
        <Row label="Round off" value={totals.roundOff} />
        <motion.div key={pulse} initial={pulse ? { scale: 1.04 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="flex items-baseline justify-between border-t border-mute/25 pt-2">
          <span className="text-sm font-semibold">Grand total</span>
          <span className="num text-2xl font-bold text-gold">{formatINR(totals.grandTotal)}</span>
        </motion.div>
        <div className="h-5 text-right text-xs text-paid">{unchanged && <span>Total unchanged</span>}</div>
      </div>
    </div>
  );
}

/** "Maharashtra (27) -> Gujarat (24) / Inter-state / IGST" with an animated dashed connector. */
export function RouteChip({ from, to, inter }: { from: string; to: string; inter: boolean }) {
  const reduce = useReducedMotion();
  const pill = 'rounded-full border border-mute/30 bg-ink px-3 py-1 text-xs font-medium';
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="route-chip">
      <span className={pill}>{from}</span>
      {inter ? (
        <>
          <svg width="56" height="12" viewBox="0 0 56 12" aria-hidden="true">
            <line x1="2" y1="6" x2="46" y2="6" stroke="#6366F1" strokeWidth="2" strokeDasharray="5 4" className={reduce ? '' : 'route-dash'} />
            <path d="M44 2l8 4-8 4" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={pill}>{to}</span>
        </>
      ) : <ArrowRight size={14} className="text-mute" aria-hidden="true" />}
      <Chip tone={inter ? 'igst' : 'info'}>{inter ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</Chip>
    </div>
  );
}
