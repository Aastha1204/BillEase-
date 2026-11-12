'use client';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, IndianRupee, Keyboard, MessageCircle, PlayCircle, RotateCcw, Save, X, BarChart3, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatINR } from '@/lib/domain/money';
import { normalizePhone } from '@/lib/domain/messages';
import { invoiceBalance } from '@/lib/domain/payments';
import { todayIso, useApp } from '@/lib/store';
import { usePresenter, useUi } from '@/lib/store/ui';
import { celebrate, PaidSweep } from '../delivery/paid';
import { Button, Chip, Toast } from '../ui';

const CANONICAL = '/invoices/new?demo=canonical';
const SHORTCUTS: [string, string][] = [['N', 'New invoice'], ['Shift + D', 'Open / close this panel'], ['Ctrl/⌘ + K', 'Search everything'], ['Esc', 'Close a dialog or dismiss the spotlight'], ['Tab / Enter', 'Move between line cells / add a new row']];

function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="h-4 w-4" />
    </label>
  );
}

/** Presenter-only slide-over (Shift+D): prospect details, the 4-step demo script, a simulated payment and demo toggles. */
export function PresenterPanel() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const path = usePathname();
  const { panelOpen, setPanelOpen, send, setSpot } = usePresenter();
  const ui = useUi();
  const { prospect, setProspect, invoices, payments, creditNotes, recordPayment, resetDemo, mode } = useApp();
  const [name, setName] = useState(prospect.name);
  const [phone, setPhone] = useState(prospect.phone);
  const [phoneErr, setPhoneErr] = useState('');
  const [payId, setPayId] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [sweep, setSweep] = useState(0);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => { if (panelOpen) { setName(prospect.name); setPhone(prospect.phone); setPhoneErr(''); } }, [panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!panelOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) setPanelOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [panelOpen, setPanelOpen]);

  const currentId = path.startsWith('/invoices/') ? path.split('/')[2] : '';
  const unpaid = useMemo(() => invoices
    .filter((i) => i.lockedAt && invoiceBalance(i, payments, creditNotes) > 0)
    // The invoice on screen comes first (that is what you are demoing); then newest first.
    .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || (b.lockedAt ?? '').localeCompare(a.lockedAt ?? '') || (b.number ?? '').localeCompare(a.number ?? ''))
    .slice(0, 40), [invoices, payments, creditNotes, currentId]);
  const chosen = unpaid.find((i) => i.id === payId) ?? unpaid[0];
  const chosenBalance = chosen ? invoiceBalance(chosen, payments, creditNotes) : 0;

  function saveProspect(): boolean {
    const p = normalizePhone(phone);
    if (phone.trim() && !p.ok) { setPhoneErr(p.error ?? 'Invalid number'); return false; }
    setPhoneErr('');
    setProspect({ name: name.trim(), phone: p.ok ? p.digits! : '' });
    return true;
  }

  const spot = (selector: string, caption: string) => { if (ui.spotlight) setSpot({ selector, caption }); else setSpot(null); };
  // On narrow screens the open panel would hide the spotlight, so tuck it away (Shift+D brings it back).
  const tuck = () => { if (typeof window !== 'undefined' && window.innerWidth < 1100 && ui.spotlight) setPanelOpen(false); };
  const onBuilder = path === '/invoices/new';
  const ensureBuilder = () => { if (!onBuilder) router.push(CANONICAL); };

  // The 4-step script. Steps 2 and 3 can be run from anywhere: they open the demo invoice first if needed.
  const step1 = () => { router.push(CANONICAL); spot('[data-testid=customer-picker]', 'Patel Interiors is in Maharashtra, so tax splits into CGST + SGST. Pick Surat Lighting House next (or press Step 2).'); say('Step 1: demo invoice opened'); tuck(); };
  const step2 = () => { ensureBuilder(); send({ type: 'select-customer', name: 'Surat Lighting House' }); spot('[data-testid=issue-btn]', 'Same total, but now IGST: only the tax split flipped. Issue the invoice.'); say('Step 2: customer switched to Surat'); tuck(); };
  const step3 = () => {
    if (!saveProspect()) { say('Fix the WhatsApp number first'); return; }
    ensureBuilder(); send({ type: 'issue-send' });
    spot('[data-testid=wa-send]', 'Send it on WhatsApp. This opens the real share sheet or wa.me link.');
    say('Step 3: issuing, then WhatsApp');
    tuck();
  };
  const step4 = () => { router.push('/reports'); spot('[data-testid=ca-pack]', 'One click gives your CA a styled workbook that reconciles to the paisa.'); setPanelOpen(false); };

  function simulate() {
    if (!chosen) return;
    try {
      const amount = chosenBalance;
      recordPayment(chosen.id, { amount, date: todayIso(), method: 'UPI', reference: `SIM-RZP-${Date.now().toString(36).toUpperCase()}` });
      say(`Payment received ${formatINR(amount)} · UPI`);
      setSweep((n) => n + 1); void celebrate();
    } catch (e) { say((e as Error).message); }
  }

  const stepBtn = 'flex w-full items-center gap-3 rounded-xl border border-mute/25 px-3 py-2.5 text-left text-sm hover:bg-gold/10';
  return (
    <>
      <AnimatePresence>
        {panelOpen && (
          <motion.aside key="presenter" role="complementary" aria-label="Presenter panel" data-testid="presenter-panel"
            initial={reduce ? { opacity: 0 } : { x: '100%' }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="glass fixed right-0 top-0 z-[80] flex h-full w-full max-w-sm flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-mute/20 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><PlayCircle size={16} className="text-gold" /> Presenter panel <Chip tone="mute">only you see this</Chip></h2>
              <button onClick={() => setPanelOpen(false)} aria-label="Close presenter panel" className="rounded p-1 hover:bg-mute/15"><X size={18} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-mute">Prospect</h3>
                <input className="input" placeholder="Prospect name" value={name} onChange={(e) => setName(e.target.value)} data-testid="pp-name" />
                <input className={clsx('input num', phoneErr && '!border-overdue')} placeholder="WhatsApp number (+91, 10 digits)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="pp-phone" />
                {phoneErr && <p className="text-xs text-overdue">{phoneErr}</p>}
                <Button onClick={() => { if (saveProspect()) say('Prospect saved'); }} data-testid="pp-save"><Save size={14} /> Save prospect</Button>
                <p className="text-xs text-mute">Used to prefill the WhatsApp send. It stays after Reset demo data.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-mute">3-minute script</h3>
                <button className={stepBtn} onClick={step1} data-testid="step-1"><FileText size={18} className="text-gold" /><span><b>Step 1</b> Open the builder with the demo invoice <span className="block text-xs text-mute">Patel Interiors · ₹41,868.00</span></span></button>
                <button className={stepBtn} onClick={step2} data-testid="step-2"><IndianRupee size={18} className="text-igst" /><span><b>Step 2</b> Switch customer to Surat Lighting House <span className="block text-xs text-mute">Triggers the CGST+SGST → IGST flip</span></span></button>
                <button className={stepBtn} onClick={step3} data-testid="step-3"><MessageCircle size={18} className="text-paid" /><span><b>Step 3</b> Issue and send on WhatsApp <span className="block text-xs text-mute">Stamp, lock, number, then the send dialog</span></span></button>
                <button className={stepBtn} onClick={step4} data-testid="step-4"><BarChart3 size={18} className="text-info" /><span><b>Step 4</b> Open Reports, highlight CA pack <span className="block text-xs text-mute">This month, Download CA pack</span></span></button>
                {mode === 'ca' && <p className="text-xs text-amber">You are in CA view; the script runs on the open client&apos;s books. Switch to Owner view for the standard demo.</p>}
              </section>

              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-mute">Simulate Razorpay payment <Chip tone="amber">SIMULATION</Chip></h3>
                {unpaid.length ? (
                  <>
                    <select className="input" value={chosen?.id} onChange={(e) => setPayId(e.target.value)} data-testid="pp-invoice">
                      {unpaid.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.customer.name} · {formatINR(invoiceBalance(i, payments, creditNotes))}</option>)}
                    </select>
                    <Button variant="primary" onClick={simulate} data-testid="pp-simulate"><Wallet size={14} /> Simulate payment {formatINR(chosenBalance)}</Button>
                  </>
                ) : <p className="text-xs text-mute">No invoice has a balance due.</p>}
                <p className="text-xs text-mute">Records a full UPI payment so you can show the Paid moment. In production this arrives from a Razorpay webhook; here nothing is charged or sent.</p>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-mute">Display</h3>
                <Toggle on={ui.threeD} onChange={(v) => ui.set({ threeD: v })} label="3D landing hero" testId="pp-3d" />
                <Toggle on={ui.presentation} onChange={(v) => ui.set({ presentation: v })} label="Presentation mode (UI at 110%)" testId="pp-present" />
                <Toggle on={ui.spotlight} onChange={(v) => { ui.set({ spotlight: v }); if (!v) setSpot(null); }} label="Script spotlight" testId="pp-spotlight" />
                <Toggle on={ui.theme === 'light'} onChange={(v) => ui.set({ theme: v ? 'light' : 'dark' })} label="Light theme" testId="pp-theme" />
              </section>

              <section className="space-y-2">
                <Button variant="danger" onClick={() => { if (confirm('Reset every business back to the original demo data?')) { resetDemo(); setSpot(null); say('Demo data restored'); } }} data-testid="pp-reset"><RotateCcw size={14} /> Reset demo data</Button>
              </section>

              <section className="space-y-1">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-mute"><Keyboard size={14} /> Keyboard shortcuts</h3>
                <dl className="space-y-1 text-xs">{SHORTCUTS.map(([k, d]) => <div key={k} className="flex justify-between gap-3"><dt><kbd className="rounded bg-mute/20 px-1.5 py-0.5">{k}</kbd></dt><dd className="text-right text-mute">{d}</dd></div>)}</dl>
              </section>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      {sweep > 0 && <PaidSweep key={sweep} />}
      <Toast msg={toast} />
    </>
  );
}
