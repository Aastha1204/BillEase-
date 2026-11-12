'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import type { Invoice } from '@/lib/domain/types';
import { InvoicePreview } from '../builder/InvoicePreview';
import { Button } from '../ui';
import { PhoneMockup } from './PhoneMockup';

/**
 * Delivery moment: the A4 preview shrinks and flies on a curved path into the phone,
 * then the PDF bubble and message appear and the ticks turn blue after 1.2 s.
 */
export function DeliveryOverlay({ inv, business, contact, text, onClose }: { inv: Invoice; business: Business; contact: string; text: string; onClose: () => void }) {
  const reduce = useReducedMotion();
  const pageRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null);
  const [showDoc, setShowDoc] = useState(!!reduce);
  const [showText, setShowText] = useState(!!reduce);
  const [blue, setBlue] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduce) { setShowDoc(true); setShowText(true); at(1200, () => setBlue(true)); }
    else {
      at(600, () => {
        const a = pageRef.current?.getBoundingClientRect(), b = phoneRef.current?.getBoundingClientRect();
        if (a && b) setFly({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) });
      });
      at(1700, () => setShowDoc(true));
      at(2300, () => { setShowText(true); at(1200, () => setBlue(true)); });
    }
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  const docName = `${(inv.number ?? 'invoice').replace(/\//g, '-')}.pdf`;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Invoice sent" data-testid="delivery-overlay">
      <div className="grid w-full max-w-4xl items-center gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
        <motion.div ref={pageRef} className="origin-center"
          animate={fly ? { x: [0, fly.x * 0.35, fly.x], y: [0, fly.y * 0.35 - 90, fly.y], scale: [1, 0.55, 0.08], opacity: [1, 1, 0], rotate: [0, -6, -12] } : { x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 1.0, ease: 'easeInOut' }}>
          <InvoicePreview inv={inv} business={business} />
        </motion.div>
        <div className="space-y-4">
          <motion.div ref={phoneRef} initial={reduce ? false : { x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
            <PhoneMockup contact={contact} docName={docName} text={text} showDoc={showDoc} showText={showText} blueTicks={blue} />
          </motion.div>
          <div className="text-center"><Button variant="primary" onClick={onClose} data-testid="delivery-close">Done</Button></div>
        </div>
      </div>
    </div>
  );
}
