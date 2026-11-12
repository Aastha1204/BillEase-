'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { HeroData } from '@/lib/heroData';
import { InvoicePreview } from '../builder/InvoicePreview';

/** Static CSS composition used when WebGL is unavailable, reduced motion is on, or 3D is switched off. */
export function HeroFallback({ data }: { data: HeroData }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toString(data.upiUri, { type: 'svg', margin: 1, width: 120 }).then(setQr).catch(() => setQr('')); }, [data.upiUri]);
  const glass = 'absolute inset-x-0 mx-auto h-[24rem] w-[17rem] rounded-2xl border border-white/20 bg-white/[0.06] shadow-2xl backdrop-blur-md';
  return (
    <div className="relative flex h-full w-full items-center justify-center" data-testid="hero-fallback" style={{ perspective: 1200 }}>
      <div className="relative h-[26rem] w-[19rem]" style={{ transformStyle: 'preserve-3d', transform: 'rotateY(-14deg) rotateX(4deg)' }}>
        <div className={glass} style={{ top: '0.2rem', transform: 'translate3d(-34px,-14px,-90px) rotate(-6deg)' }} />
        <div className={glass} style={{ top: '0.6rem', transform: 'translate3d(-14px,-6px,-45px) rotate(-3deg)' }} />
        <div className="absolute inset-x-0 top-2 mx-auto w-[17rem] overflow-hidden rounded-2xl border border-white/30 bg-white/10 p-1.5 shadow-2xl backdrop-blur-md" style={{ transform: 'translateZ(0)' }}>
          <div className="overflow-hidden rounded-xl bg-white"><InvoicePreview inv={data.inv} business={data.business} /></div>
        </div>
        <div className="absolute -right-8 bottom-6 flex h-20 w-20 items-center justify-center rounded-full text-4xl font-black text-amber-900 shadow-xl"
          style={{ background: 'radial-gradient(circle at 35% 30%, #FFE3A3, #E8A33A)', transform: 'translateZ(60px)' }} aria-hidden>₹</div>
        {qr && <div className="absolute -left-10 bottom-2 h-24 w-24 rounded-lg bg-white p-1 shadow-xl" style={{ transform: 'translateZ(50px) rotate(-5deg)' }} dangerouslySetInnerHTML={{ __html: qr }} aria-hidden />}
      </div>
    </div>
  );
}
