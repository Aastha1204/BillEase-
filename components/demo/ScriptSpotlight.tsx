'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePresenter, useUi } from '@/lib/store/ui';

/**
 * Optional overlay for the presenter: dims the screen and rings the next element to click,
 * with a one-line caption. The dim never blocks clicks; clicking the target (or pressing Esc) dismisses it.
 */
export function ScriptSpotlight() {
  const reduce = useReducedMotion();
  const enabled = useUi((u) => u.spotlight);
  const spot = usePresenter((p) => p.spot);
  const setSpot = usePresenter((p) => p.setSpot);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!spot || !enabled) { setRect(null); return; }
    const find = () => {
      const el = document.querySelector(spot.selector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect((prev) => (prev && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r));
    };
    find();
    const poll = setInterval(find, 200);
    const click = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.(spot.selector)) setSpot(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSpot(null); };
    document.addEventListener('click', click, true);
    window.addEventListener('keydown', key);
    const giveUp = setTimeout(() => setSpot(null), 90_000);
    return () => { clearInterval(poll); clearTimeout(giveUp); document.removeEventListener('click', click, true); window.removeEventListener('keydown', key); };
  }, [spot, enabled, setSpot]);

  if (!spot || !enabled || !rect) return null;
  const pad = 8;
  const below = rect.bottom + 90 < window.innerHeight;
  return (
    <div className="pointer-events-none fixed inset-0 z-[75]" data-testid="spotlight" aria-live="polite">
      <motion.div className="absolute rounded-xl ring-2 ring-gold"
        style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(5,10,20,.72)' }}
        animate={reduce ? undefined : { boxShadow: ['0 0 0 9999px rgba(5,10,20,.72), 0 0 0 0 rgba(245,181,68,.6)', '0 0 0 9999px rgba(5,10,20,.72), 0 0 0 14px rgba(245,181,68,0)'] }}
        transition={{ duration: 1.4, repeat: Infinity }} />
      <div className="glass absolute max-w-xs rounded-xl px-3 py-2 text-sm shadow-2xl"
        style={{ left: Math.min(Math.max(8, rect.left), window.innerWidth - 300), top: below ? rect.bottom + pad + 10 : Math.max(8, rect.top - pad - 64) }} data-testid="spotlight-caption">
        {spot.caption}
        <div className="mt-1 text-[10px] text-mute">Click the highlighted item, or press Esc to dismiss.</div>
      </div>
    </div>
  );
}
