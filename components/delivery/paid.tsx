'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Light confetti burst; skipped entirely for reduced motion. */
export async function celebrate() {
  if (reduced()) return;
  const confetti = (await import('canvas-confetti')).default;
  confetti({ particleCount: 70, spread: 75, startVelocity: 38, origin: { y: 0.7 }, colors: ['#22C55E', '#F5B544', '#FFFFFF'], ticks: 140, scalar: 0.9 });
}

/** One-shot emerald glow that sweeps across the screen. */
export function PaidSweep() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 1500); return () => clearTimeout(t); }, []);
  if (!on || reduce) return null;
  return (
    <motion.div aria-hidden data-testid="paid-sweep" className="pointer-events-none fixed inset-0 z-[70]"
      style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(34,197,94,.35) 50%, transparent 70%)' }}
      initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
  );
}

/** "PAID" rubber stamp laid over the invoice preview. */
export function PaidStamp({ fresh }: { fresh: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div data-testid="paid-stamp" initial={reduce || !fresh ? false : { scale: 1.5, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -12 }}
      transition={{ type: 'spring', stiffness: 360, damping: 16 }}
      className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-[6px] border-paid px-6 py-1 text-5xl font-black tracking-widest text-paid"
      style={{ background: 'rgba(255,255,255,.5)' }}>PAID</motion.div>
  );
}
