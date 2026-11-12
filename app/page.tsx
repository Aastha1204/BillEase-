'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Briefcase, Receipt, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { HeroFallback } from '@/components/landing/HeroFallback';
import { webglAvailable } from '@/components/three/textures';
import { heroData } from '@/lib/heroData';
import { todayIso, useApp } from '@/lib/store';
import { useHydrated } from '@/lib/store/useHydrated';
import { useUi } from '@/lib/store/ui';

// three.js loads only here (never on the app screens) and only when the hero will actually render 3D.
const HeroScene = dynamic(() => import('@/components/three/HeroScene'), { ssr: false, loading: () => <div className="h-full w-full" aria-hidden /> });

const PITCH = 'Create a correct GST invoice in under a minute, send it on WhatsApp with a UPI QR, track who has paid, and hand your CA a clean monthly GST summary.';

export default function Landing() {
  const router = useRouter();
  const ready = useHydrated();
  const { enterOwner, enterCa } = useApp();
  const threeD = useUi((s) => s.threeD);
  const [mode, setMode] = useState<'pending' | '3d' | 'css'>('pending');
  const data = useMemo(() => heroData(todayIso()), []);

  useEffect(() => { document.documentElement.dataset.theme = 'dark'; delete document.documentElement.dataset.brand; }, []);
  useEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setMode(threeD && !reduced && webglAvailable() ? '3d' : 'css');
  }, [ready, threeD]);

  const go = (ca: boolean) => { if (ca) { enterCa(); router.push('/ca'); } else { enterOwner(); router.push('/dashboard'); } };

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: 'radial-gradient(1200px 600px at 75% 30%, rgba(99,102,241,.22), transparent 60%), radial-gradient(900px 500px at 20% 80%, rgba(245,181,68,.12), transparent 60%), #0B1220' }}>
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-6 px-6 py-10 lg:grid-cols-[1fr_1.05fr]">
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold"><Receipt className="text-gold" /> <span>Bill<span className="text-gold">Ease</span></span></div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">A correct GST invoice, <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#F5B544,#FF8A3D)' }}>in under a minute.</span></h1>
          <p className="max-w-xl text-base text-mute sm:text-lg" data-testid="pitch">{PITCH}</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => go(false)} disabled={!ready} data-testid="enter-owner"
              className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base shadow-lg shadow-amber-500/20 disabled:opacity-60"><Store size={18} /> Enter as Business Owner</button>
            <button onClick={() => go(true)} disabled={!ready} data-testid="enter-ca"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-60"><Briefcase size={18} /> Enter as CA (white-label)</button>
          </div>
          <p className="text-xs text-mute">No sign-in. Demo data only; every business, customer and number is fictional.</p>
        </section>
        <section className="relative h-[34rem] w-full" aria-label="A glass stack of GST invoices with a rupee coin and a UPI QR">
          {mode === '3d' && <HeroScene data={data} onFail={() => setMode('css')} />}
          {mode === 'css' && <HeroFallback data={data} />}
        </section>
      </div>
      <footer className="absolute inset-x-0 bottom-3 text-center text-xs text-mute">Powered by Neovia AI</footer>
    </main>
  );
}
