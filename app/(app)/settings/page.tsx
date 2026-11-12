'use client';
import clsx from 'clsx';
import { RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { MoneyInput, NumberInput } from '@/components/builder/CommitInput';
import { Button, Chip, Field, Toast } from '@/components/ui';
import type { Business, MessageTemplates } from '@/lib/domain/entities';
import { validateGstin } from '@/lib/domain/gstin';
import { defaultInvoiceTemplate, defaultReminderTemplate, invoiceMessage, LADDER, reminderMessage, unknownTokens, type Lang, type MsgCtx, type StepId } from '@/lib/domain/messages';
import { applyProfile, seriesPreview, svgTextToDataUri, validateImageFile, validateProfile, type ProfileFields } from '@/lib/domain/settings';
import { stateLabel } from '@/lib/domain/states';
import { useApp } from '@/lib/store';
import { useUi } from '@/lib/store/ui';

const SAMPLE: MsgCtx = { firstName: 'Priya', number: 'SSE/26-27/0418', tradeName: 'Shree Sai Electricals', amount: '₹41,868.00', dueDate: '27-Nov-2026', link: 'https://billease.example/i#…', vpa: 'shreesai@demo' };
const pick = (b: Business): ProfileFields => ({
  tradeName: b.tradeName, legalName: b.legalName, address: b.address, city: b.city, pincode: b.pincode, gstin: b.gstin, phone: b.phone, email: b.email,
  seriesPrefix: b.seriesPrefix, bankName: b.bankName, bankAccountMasked: b.bankAccountMasked, ifsc: b.ifsc, upiId: b.upiId, signatoryName: b.signatoryName,
});

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="glass space-y-4 rounded-2xl p-5">
      <div><h2 className="text-base font-semibold">{title}</h2>{hint && <p className="text-xs text-mute">{hint}</p>}</div>
      {children}
    </section>
  );
}
const Toggle = ({ on, onChange, label, hint, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; testId?: string }) => (
  <label className="flex cursor-pointer items-start gap-3 text-sm">
    <input type="checkbox" className="mt-1" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-mute">{hint}</span>}</span>
  </label>
);

function SettingsForm() {
  const { business, updateBusiness, resetDemo, invoices } = useApp();
  const { theme, set: setUi } = useUi();
  const [f, setF] = useState<ProfileFields>(() => pick(business));
  const [s, setS] = useState<Business['settings']>(() => business.settings);
  const [logo, setLogo] = useState(business.logoSvg);
  const [sig, setSig] = useState(business.signatureSvg);
  const [tpl, setTpl] = useState<MessageTemplates>(() => business.settings.templates ?? {});
  const [msgKey, setMsgKey] = useState<'invoice' | StepId>('invoice');
  const [lang, setLang] = useState<Lang>('en');
  const [toast, setToast] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<Record<string, string>>({});
  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const errors = useMemo(() => validateProfile(f), [f]);
  const series = useMemo(() => seriesPreview(f.seriesPrefix.trim()), [f.seriesPrefix]);
  const gst = validateGstin(f.gstin);
  const merged: Business['settings'] = { ...s, templates: Object.keys(tpl.invoice ?? {}).length || Object.keys(tpl.reminder ?? {}).length ? tpl : undefined };
  const dirty = JSON.stringify([pick(business), business.settings, business.logoSvg, business.signatureSvg]) !== JSON.stringify([f, merged, logo, sig]);
  const hasErrors = Object.keys(errors).length > 0;
  const set = <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const ss = <K extends keyof Business['settings']>(k: K, v: Business['settings'][K]) => setS((p) => ({ ...p, [k]: v }));

  async function upload(file: File | undefined, kind: 'logo' | 'sig') {
    if (!file) return;
    const err = validateImageFile(file);
    setImgErr((p) => ({ ...p, [kind]: err ?? '' }));
    if (err) return;
    const uri = file.type === 'image/svg+xml'
      ? svgTextToDataUri(await file.text())
      : await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    (kind === 'logo' ? setLogo : setSig)(uri);
  }

  function save() {
    if (hasErrors) { say('Fix the highlighted fields first'); return; }
    updateBusiness({ ...applyProfile(business, f), logoSvg: logo, signatureSvg: sig, settings: merged });
    say('Settings saved');
  }
  function discard() {
    setF(pick(business)); setS(business.settings); setLogo(business.logoSvg); setSig(business.signatureSvg); setTpl(business.settings.templates ?? {}); setImgErr({});
  }

  // message templates editor
  const current = msgKey === 'invoice' ? (tpl.invoice?.[lang] ?? defaultInvoiceTemplate(lang)) : (tpl.reminder?.[msgKey]?.[lang] ?? defaultReminderTemplate(msgKey, lang));
  const isDefault = msgKey === 'invoice' ? !tpl.invoice?.[lang] : !tpl.reminder?.[msgKey]?.[lang];
  function setTemplate(text: string | null) {
    setTpl((p) => {
      const n: MessageTemplates = { invoice: { ...p.invoice }, reminder: { ...p.reminder } };
      if (msgKey === 'invoice') { if (text === null) delete n.invoice![lang]; else n.invoice![lang] = text; }
      else {
        n.reminder![msgKey] = { ...n.reminder![msgKey] };
        if (text === null) delete n.reminder![msgKey]![lang]; else n.reminder![msgKey]![lang] = text;
        if (!Object.keys(n.reminder![msgKey]!).length) delete n.reminder![msgKey];
      }
      return n;
    });
  }
  const preview = msgKey === 'invoice' ? invoiceMessage(lang, SAMPLE, tpl) : reminderMessage(msgKey, lang, SAMPLE, tpl);
  const bad = unknownTokens(current);

  const err = (k: string) => errors[k];
  const inputCls = (k: string) => clsx('input', err(k) && '!border-overdue');

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Settings</h1>
        {dirty && <Chip tone="amber">Unsaved changes</Chip>}
      </div>
      <p className="rounded-lg bg-info/10 p-3 text-xs text-info" data-testid="disclaimer">BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA.</p>

      <Section title="Business profile" hint="Printed on every invoice. The supplier state comes from the GSTIN.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Trade name" error={err('tradeName')}><input className={inputCls('tradeName')} value={f.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></Field>
          <Field label="Legal name" error={err('legalName')}><input className={inputCls('legalName')} value={f.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
          <Field label="GSTIN" error={err('gstin')} hint={gst.valid ? `Supplier state: ${stateLabel(gst.stateCode)} · PAN ${gst.pan}` : undefined}>
            <input className={clsx(inputCls('gstin'), 'font-mono uppercase')} maxLength={17} value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} data-testid="s-gstin" />
          </Field>
          <Field label="Authorised signatory" error={err('signatoryName')}><input className={inputCls('signatoryName')} value={f.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} /></Field>
          <div className="md:col-span-2"><Field label="Address" error={err('address')}><textarea className={inputCls('address')} rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
          <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="PIN code" error={err('pincode')}><input className={inputCls('pincode')} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
          <Field label="Phone" error={err('phone')}><input className={inputCls('phone')} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email" error={err('email')}><input className={inputCls('email')} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Logo and signature" hint="PNG, JPG or SVG up to 300 KB. Without an image the PDF draws a monogram.">
        <div className="grid gap-4 md:grid-cols-2">
          {([['logo', 'Logo', logo, setLogo, logoRef], ['sig', 'Signature', sig, setSig, sigRef]] as const).map(([k, label, val, setVal, ref]) => (
            <div key={k} className="space-y-2">
              <div className="text-xs font-medium text-mute">{label}</div>
              <div className="flex h-24 items-center justify-center rounded-lg bg-white p-2">
                {val ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={val} alt={label} className="max-h-full max-w-full" /> : <span className="text-xs text-slate-400">None (monogram used)</span>}
              </div>
              <div className="flex gap-2">
                <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { upload(e.target.files?.[0], k); e.target.value = ''; }} data-testid={`upload-${k}`} />
                <Button onClick={() => ref.current?.click()}><Upload size={14} /> Upload</Button>
                {val && <Button onClick={() => setVal('')}><Trash2 size={14} /> Remove</Button>}
              </div>
              {imgErr[k] && <p className="text-xs text-overdue">{imgErr[k]}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Invoice numbering" hint="Format: prefix/FY/0001. The whole number can be at most 16 characters. Issued numbers never change.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Series prefix" error={err('seriesPrefix')}><input className={clsx(inputCls('seriesPrefix'), 'font-mono uppercase')} value={f.seriesPrefix} onChange={(e) => set('seriesPrefix', e.target.value.toUpperCase())} data-testid="s-prefix" /></Field>
          <div className="text-sm" data-testid="series-preview">
            <div className="text-xs font-medium text-mute">Preview</div>
            <div className="mt-1 font-mono">{series.invoice} <span className={clsx('text-xs', series.invoiceOk ? 'text-paid' : 'text-overdue')} data-testid="series-count">· {series.invoiceLen}/16 characters</span></div>
            <div className="font-mono text-xs text-mute">Credit notes: {series.creditNote} {!series.creditNoteOk && <span className="text-amber">(too long: use a prefix of up to 3 characters to issue credit notes)</span>}</div>
            {invoices.some((i) => i.lockedAt) && <p className="mt-1 text-xs text-mute">Changing the prefix affects only new invoices.</p>}
          </div>
        </div>
      </Section>

      <Section title="Bank and UPI" hint="Shown on the PDF; the UPI ID drives the payment QR and the Pay with UPI link.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Bank name"><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} /></Field>
          <Field label="Account number (masked)"><input className="input" value={f.bankAccountMasked} onChange={(e) => set('bankAccountMasked', e.target.value)} /></Field>
          <Field label="IFSC" error={err('ifsc')}><input className={clsx(inputCls('ifsc'), 'font-mono uppercase')} value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></Field>
          <Field label="UPI ID (VPA)" error={err('upiId')}><input className={inputCls('upiId')} value={f.upiId} onChange={(e) => set('upiId', e.target.value)} data-testid="s-upi" /></Field>
        </div>
        <p className="text-xs text-mute">Use a business/merchant UPI ID in production. Some UPI apps may warn about or block prefilled amounts for personal UPI IDs.</p>
        <Toggle on={s.demoQrWatermark} onChange={(v) => ss('demoQrWatermark', v)} label="Demo watermark under QR" hint="Prints “DEMO” under the QR on PDFs. Turn off for real invoices." testId="s-watermark" />
      </Section>

      <Section title="Tax rules" hint="These are the rules BillEase applies. Your CA confirms which apply to you.">
        <div className="grid gap-4 md:grid-cols-2">
          <Toggle on={s.roundOff} onChange={(v) => ss('roundOff', v)} label="Round off the grand total to the nearest rupee" hint="The difference shows as a separate Round off line." testId="s-roundoff" />
          <Field label="Buyer details required (unregistered buyer, ₹50,000 or more) based on" hint="Your CA decides which basis applies">
            <select className="input" value={s.b2cBasis} onChange={(e) => ss('b2cBasis', e.target.value as 'grand' | 'taxable')} data-testid="s-basis">
              <option value="grand">Grand total (stricter)</option><option value="taxable">Taxable value</option>
            </select>
          </Field>
          <Field label="B2CL threshold (₹), inter-state consumer invoices above this are B2CL"><MoneyInput paise={s.b2clThreshold} onChange={(p) => ss('b2clThreshold', p)} data-testid="s-b2cl" /></Field>
          <Field label="Default payment terms (days)"><NumberInput value={s.defaultTermsDays} max={365} onChange={(n) => ss('defaultTermsDays', Math.round(n))} /></Field>
        </div>
      </Section>

      <Section title="PDF template">
        <div className="flex flex-wrap gap-3">
          {(['Classic', 'Modern', 'Minimal'] as const).map((t) => (
            <button key={t} onClick={() => ss('pdfTemplate', t)} aria-pressed={s.pdfTemplate === t} data-testid={`tpl-${t}`}
              className={clsx('rounded-lg border px-4 py-2 text-sm', s.pdfTemplate === t ? 'border-gold bg-gold/15 text-gold' : 'border-mute/30 text-mute')}>{t}</button>
          ))}
        </div>
      </Section>

      <Section title="Reminders and messages" hint="Reminders open WhatsApp with a prefilled message. Use {firstName} {number} {tradeName} {amount} {dueDate} {link} {vpa}.">
        <ul className="grid gap-1 text-xs text-mute sm:grid-cols-2">{LADDER.map((l) => <li key={l.id}>• {l.label} <span className="text-fg">({l.tone})</span></li>)}</ul>
        <div className="flex flex-wrap gap-3">
          <select className="input w-auto" value={msgKey} onChange={(e) => setMsgKey(e.target.value as typeof msgKey)} aria-label="Message" data-testid="msg-key">
            <option value="invoice">Invoice message</option>{LADDER.map((l) => <option key={l.id} value={l.id}>Reminder: {l.label}</option>)}
          </select>
          <div className="flex rounded-lg border border-mute/30 p-0.5">{(['en', 'hi'] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx('rounded-md px-3 py-1 text-xs', lang === l ? 'bg-gold/20 text-gold' : 'text-mute')}>{l === 'en' ? 'English' : 'हिन्दी'}</button>)}</div>
          {!isDefault && <Button onClick={() => setTemplate(null)} data-testid="msg-reset"><RotateCcw size={14} /> Reset to default</Button>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Template" error={bad.length ? `Unknown placeholder: ${bad.map((b) => `{${b}}`).join(' ')}` : undefined}>
            <textarea className="input font-mono text-xs" rows={8} value={current} onChange={(e) => setTemplate(e.target.value === (msgKey === 'invoice' ? defaultInvoiceTemplate(lang) : defaultReminderTemplate(msgKey, lang)) ? null : e.target.value)} data-testid="msg-text" />
          </Field>
          <div><div className="mb-1 text-xs font-medium text-mute">Preview (sample data)</div><pre className="min-h-[11rem] whitespace-pre-wrap rounded-lg bg-[#DCF8C6] p-3 text-xs text-slate-800" data-testid="msg-preview">{preview}</pre></div>
        </div>
      </Section>

      <Section title="Appearance and demo data">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-mute/30 p-0.5" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => <button key={t} onClick={() => setUi({ theme: t })} aria-pressed={theme === t} data-testid={`theme-${t}`} className={clsx('rounded-md px-3 py-1 text-xs capitalize', theme === t ? 'bg-gold/20 text-gold' : 'text-mute')}>{t}</button>)}
          </div>
          <Button variant="danger" onClick={() => { if (confirm('Reset every business back to the original demo data? Your changes will be lost.')) { resetDemo(); say('Demo data restored'); } }} data-testid="s-reset"><RotateCcw size={16} /> Reset demo data</Button>
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-mute/20 bg-panel/95 px-4 py-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
          {hasErrors && dirty && <span className="mr-auto text-xs text-overdue">{Object.keys(errors).length} field(s) need attention</span>}
          <Button onClick={discard} disabled={!dirty}>Discard</Button>
          <Button variant="primary" onClick={save} disabled={!dirty || hasErrors} data-testid="s-save"><Save size={16} /> Save settings</Button>
        </div>
      </div>
      <Toast msg={toast} />
    </div>
  );
}

/** Keyed by business so switching client in CA view reloads the form with that business. */
export default function SettingsPage() {
  const id = useApp((st) => st.business.id);
  return <SettingsForm key={id} />;
}
