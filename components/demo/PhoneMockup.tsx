'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, FileText } from 'lucide-react';

/**
 * CSS-3D phone built from divs (no model, no external assets). A neutral chat UI: it is labelled
 * "Sent via WhatsApp" in text but deliberately does not copy WhatsApp's logo or interface.
 */
export function PhoneMockup({ contact, docName, pages = 1, text, showDoc, showText, blueTicks }: {
  contact: string; docName: string; pages?: number; text: string; showDoc: boolean; showText: boolean; blueTicks: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div style={{ perspective: 1200 }} data-testid="phone-mockup">
      <motion.div style={{ transform: 'rotateY(-18deg) rotateX(6deg)', transformStyle: 'preserve-3d' }}
        animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="mx-auto h-[500px] w-[250px] rounded-[2.4rem] border-[7px] border-slate-800 bg-slate-900 shadow-[0_30px_60px_-15px_rgba(0,0,0,.7)]">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[1.9rem] bg-[#ECE5DD] text-slate-800">
          <div className="absolute left-1/2 top-1 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-slate-900" aria-hidden />
          <div className="bg-emerald-700 px-3 pb-2 pt-7 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-bold">{contact.slice(0, 1).toUpperCase() || '?'}</div>
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{contact || 'Customer'}</div><div className="text-[10px] opacity-80">online</div></div>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-hidden p-2.5 text-[11px]">
            <div className="mx-auto w-fit rounded-md bg-amber-100 px-2 py-0.5 text-[9px] text-slate-600">Sent via WhatsApp</div>
            {showDoc && (
              <motion.div initial={reduce ? false : { opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="ml-auto w-[88%] rounded-lg rounded-tr-none bg-[#DCF8C6] p-1.5 shadow-sm" data-testid="phone-doc">
                <div className="flex items-center gap-2 rounded-md bg-white/60 p-2">
                  <FileText className="shrink-0 text-rose-500" size={26} />
                  <div className="min-w-0"><div className="truncate font-semibold">{docName}</div><div className="text-[9px] text-slate-500">{pages} page · PDF</div></div>
                </div>
              </motion.div>
            )}
            {showText && (
              <motion.div initial={reduce ? false : { opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="ml-auto w-[92%] rounded-lg rounded-tr-none bg-[#DCF8C6] p-2 shadow-sm" data-testid="phone-text">
                <p className="line-clamp-[9] whitespace-pre-line break-words leading-snug">{text}</p>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-slate-500">
                  <span>now</span>
                  {blueTicks ? <CheckCheck size={13} className="text-sky-500" data-testid="ticks-blue" /> : <Check size={13} className="text-slate-400" data-testid="ticks-grey" />}
                </div>
              </motion.div>
            )}
          </div>
          <div className="m-2 rounded-full bg-white px-3 py-1.5 text-[10px] text-slate-400">Type a message</div>
        </div>
      </motion.div>
    </div>
  );
}
