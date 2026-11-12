'use client';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { formatINR } from '@/lib/domain/money';

/** Counts up to `value` (paise or a plain integer); always ends on the exact value. */
function useCountUp(value: number, ms = 900) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setV(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(p >= 1 ? value : Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduce]);
  return v;
}

const MAX_TILT = 8; // degrees

/** KPI tile: count-up number, hover tilt (max 8 degrees) and a glare that follows the cursor. */
export function KpiTile({ label, value, kind, sub, tone = 'text-fg', testId }: { label: string; value: number; kind: 'money' | 'int'; sub?: string; tone?: string; testId?: string }) {
  const reduce = useReducedMotion();
  const shown = useCountUp(value);
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, on: false });

  function move(e: React.PointerEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * 2 * MAX_TILT, ry: (px - 0.5) * 2 * MAX_TILT, gx: px * 100, gy: py * 100, on: true });
  }
  return (
    <div style={{ perspective: 800 }}>
      <div ref={ref} onPointerMove={move} onPointerLeave={() => setT((p) => ({ ...p, rx: 0, ry: 0, on: false }))} data-testid={testId}
        className="glass relative min-h-[112px] overflow-hidden rounded-2xl p-4 will-change-transform"
        style={{ transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`, transition: t.on ? 'transform 60ms linear' : 'transform 300ms ease-out', transformStyle: 'preserve-3d' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{ opacity: t.on ? 1 : 0, background: `radial-gradient(180px circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,.14), transparent 60%)` }} />
        <div className="text-xs font-medium text-mute">{label}</div>
        <div className={`num mt-1 text-2xl font-bold ${tone}`} aria-label={`${label}: ${kind === 'money' ? formatINR(value) : value}`} data-value={value}>
          {kind === 'money' ? formatINR(shown) : shown.toLocaleString('en-IN')}
        </div>
        {sub && <div className="mt-1 text-xs text-mute">{sub}</div>}
      </div>
    </div>
  );
}
