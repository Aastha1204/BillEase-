'use client';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { validateGstin } from '@/lib/domain/gstin';
import { seriesPreview, validateProfile, type ProfileFields } from '@/lib/domain/settings';
import { stateLabel } from '@/lib/domain/states';
import { BUSINESS_KINDS, CONSTITUTIONS, buildWorkspace, makeBusinessId, suggestPrefix } from '@/lib/seed/newBusiness';
import { todayIso, useApp } from '@/lib/store';
import { GstinChecks } from '../GstinValidator';
import { Button, Field, Modal } from '../ui';

const blank = (): ProfileFields & { constitution: string; kind: string; bankBranch: string; withSample: boolean } => ({
  tradeName: '', legalName: '', address: '', city: '', pincode: '', gstin: '', phone: '', email: '', seriesPrefix: '', bankName: '', bankAccountMasked: '', ifsc: '', upiId: '',
  signatoryName: '', constitution: CONSTITUTIONS[0], kind: BUSINESS_KINDS[0], bankBranch: '', withSample: true,
});

/**
 * Creates a new business as its own isolated workspace. It is linked to the CA list straight away,
 * so the CA view shows it with no extra step.
 */
export function AddBusinessModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const { addBusiness, workspaceOrder, activeId } = useApp();
  const [f, setF] = useState(blank);
  const [touchedPrefix, setTouchedPrefix] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setF(blank()); setTouchedPrefix(false); setShowErrors(false); setErr(''); } }, [open]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const effective = useMemo(() => ({ ...f, legalName: f.legalName.trim() || f.tradeName.trim() }), [f]);
  const errors = useMemo(() => {
    const e = validateProfile(effective);
    if (!effective.upiId.trim()) delete e.upiId; // UPI is optional for a new business (no QR is printed without it)
    return e;
  }, [effective]);
  const gst = validateGstin(f.gstin);
  const series = seriesPreview(f.seriesPrefix.trim());
  const show = (k: string) => (showErrors ? errors[k] : undefined);
  const cls = (k: string) => clsx('input', show(k) && '!border-overdue');

  function save() {
    setShowErrors(true);
    if (Object.keys(errors).length) { setErr('Please fix the highlighted fields.'); return; }
    try {
      const id = makeBusinessId(f.tradeName, [...workspaceOrder, activeId]);
      const ws = buildWorkspace({ ...f, ...effective }, id, todayIso());
      addBusiness(ws);
      onCreated(id, ws.business.tradeName);
      onClose();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Add a new business"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} data-testid="ab-create">Create business</Button></>}>
      <p className="text-xs text-mute">The business gets its own books (customers, items, invoices). It appears in the CA client list automatically. Demo prototype: use fictional details.</p>
      <div className="grid gap-3 md:grid-cols-2" data-testid="add-business-form">
        <Field label="Trade name" error={show('tradeName')}>
          <input className={cls('tradeName')} value={f.tradeName} data-testid="ab-name"
            onChange={(e) => { set('tradeName', e.target.value); if (!touchedPrefix) setF((p) => ({ ...p, tradeName: e.target.value, seriesPrefix: suggestPrefix(e.target.value) })); }} />
        </Field>
        <Field label="Legal name (optional)" hint="Defaults to the trade name"><input className="input" value={f.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
        <Field label="Constitution"><select className="input" value={f.constitution} onChange={(e) => set('constitution', e.target.value)}>{CONSTITUTIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Business type"><select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)} data-testid="ab-kind">{BUSINESS_KINDS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="md:col-span-2">
          <Field label="GSTIN" error={show('gstin')} hint={gst.valid ? `Supplier state: ${stateLabel(gst.stateCode)} · PAN ${gst.pan}` : undefined}>
            <input className={clsx(cls('gstin'), 'font-mono uppercase')} maxLength={17} value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" data-testid="ab-gstin" />
            <div className="pt-1"><GstinChecks value={f.gstin} /></div>
          </Field>
        </div>
        <div className="md:col-span-2"><Field label="Address" error={show('address')}><textarea className={cls('address')} rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} data-testid="ab-address" /></Field></div>
        <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} data-testid="ab-city" /></Field>
        <Field label="PIN code" error={show('pincode')}><input className={cls('pincode')} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value)} data-testid="ab-pin" /></Field>
        <Field label="Phone" error={show('phone')}><input className={cls('phone')} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 90000 0XXXX" /></Field>
        <Field label="Email" error={show('email')}><input className={cls('email')} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Authorised signatory" error={show('signatoryName')}><input className={cls('signatoryName')} value={f.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} placeholder="Name, designation" data-testid="ab-signatory" /></Field>
        <Field label="Invoice series prefix" error={show('seriesPrefix')} hint={`${series.invoice} · ${series.invoiceLen}/16 characters`}>
          <input className={clsx(cls('seriesPrefix'), 'font-mono uppercase')} value={f.seriesPrefix} onChange={(e) => { setTouchedPrefix(true); set('seriesPrefix', e.target.value.toUpperCase()); }} data-testid="ab-prefix" />
        </Field>
        <Field label="Bank name"><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} /></Field>
        <Field label="Account number"><input className="input" value={f.bankAccountMasked} onChange={(e) => set('bankAccountMasked', e.target.value)} /></Field>
        <Field label="IFSC" error={show('ifsc')}><input className={clsx(cls('ifsc'), 'font-mono uppercase')} value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></Field>
        <Field label="Branch"><input className="input" value={f.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="UPI ID (optional)" error={show('upiId')} hint="Drives the payment QR. Leave empty to print no QR."><input className={cls('upiId')} value={f.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="name@bank" data-testid="ab-upi" /></Field></div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={f.withSample} onChange={(e) => set('withSample', e.target.checked)} data-testid="ab-sample" />
        <span>Start with a few fictional items and customers <span className="block text-xs text-mute">So you can create the first invoice straight away. You can edit or delete them.</span></span>
      </label>
      {err && <p className="text-sm text-overdue" role="alert">{err}</p>}
    </Modal>
  );
}
