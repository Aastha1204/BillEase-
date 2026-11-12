'use client';
import { useEffect, useState } from 'react';
import type { Customer } from '@/lib/domain/entities';
import { normalizeGstin, validateGstin } from '@/lib/domain/gstin';
import { STATE_LIST } from '@/lib/domain/states';
import { useApp } from '@/lib/store';
import { GstinChecks } from './GstinValidator';
import { Button, Drawer, Field } from './ui';

const TERMS = [[0, 'Due on receipt'], [7, '7 days'], [15, '15 days'], [30, '30 days'], [45, '45 days'], [60, '60 days']] as const;

const blank = (): Customer => ({
  id: '', name: '', type: 'B2B', gstin: '', stateCode: '27', city: '', billingAddress: '', shippingAddress: '', phone: '', email: '', termsDays: 15,
});

export function CustomerDrawer({ customer, open, onClose, onSaved }: { customer: Customer | null; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { upsertCustomer, deleteCustomer } = useApp();
  const [c, setC] = useState<Customer>(blank());
  const [sameShip, setSameShip] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isNew = !customer;

  useEffect(() => {
    if (!open) return;
    const start = customer ?? blank();
    setC(start);
    setSameShip(start.billingAddress === start.shippingAddress);
    setErrors({});
  }, [open, customer]);

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setC((p) => ({ ...p, [k]: v }));

  function onGstin(raw: string) {
    const g = normalizeGstin(raw);
    setC((p) => {
      const v = validateGstin(g);
      return { ...p, gstin: g, stateCode: v.stateOk && STATE_LIST.some((s) => s.code === v.stateCode) ? v.stateCode! : p.stateCode };
    });
  }
  function onType(t: 'B2B' | 'B2C') {
    setC((p) => ({ ...p, type: t, termsDays: t === 'B2C' ? 0 : p.termsDays === 0 ? 15 : p.termsDays }));
  }

  function save() {
    const e: Record<string, string> = {};
    if (!c.name.trim()) e.name = 'Name is required';
    if (c.type === 'B2B') {
      const v = validateGstin(c.gstin ?? '');
      if (!v.valid) e.gstin = 'Enter a valid GSTIN (format and checksum)';
      else if (v.stateCode !== c.stateCode) e.stateCode = `State must match the GSTIN (${v.stateName})`;
    }
    if (!c.billingAddress.trim()) e.billingAddress = 'Billing address is required';
    if (c.phone && !/^(\+91[\s-]?)?[0-9][0-9\s-]{8,13}$/.test(c.phone.trim())) e.phone = 'Enter a valid phone number';
    if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) e.email = 'Enter a valid email';
    setErrors(e);
    if (Object.keys(e).length) return;
    const out: Customer = {
      ...c,
      id: c.id || `cust-${Date.now().toString(36)}`,
      name: c.name.trim(),
      gstin: c.type === 'B2B' ? normalizeGstin(c.gstin ?? '') : undefined,
      shippingAddress: sameShip ? c.billingAddress : c.shippingAddress,
    };
    upsertCustomer(out);
    onSaved(isNew ? `Added ${out.name}` : `Saved ${out.name}`);
    onClose();
  }

  function remove() {
    try { deleteCustomer(c.id); onSaved(`Deleted ${c.name}`); onClose(); }
    catch (err) { setErrors({ form: (err as Error).message }); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={isNew ? 'Add customer' : 'Edit customer'}
      footer={<>
        {!isNew && <Button variant="danger" onClick={remove} className="mr-auto">Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save customer</Button>
      </>}>
      {errors.form && <p className="rounded-lg bg-overdue/10 p-2 text-sm text-overdue">{errors.form}</p>}
      <div className="flex gap-2">
        {(['B2B', 'B2C'] as const).map((t) => (
          <button key={t} onClick={() => onType(t)} aria-pressed={c.type === t}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${c.type === t ? 'border-gold bg-gold/15 text-gold' : 'border-mute/30 text-mute'}`}>
            {t === 'B2B' ? 'Business (GST registered)' : 'Consumer (unregistered)'}
          </button>
        ))}
      </div>
      <Field label="Name" error={errors.name}><input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} /></Field>
      {c.type === 'B2B' && (
        <Field label="GSTIN" error={errors.gstin}>
          <input className="input font-mono uppercase" maxLength={17} value={c.gstin ?? ''} onChange={(e) => onGstin(e.target.value)} placeholder="27AAKFP7316N1ZN" />
          <div className="pt-1"><GstinChecks value={c.gstin ?? ''} /></div>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" error={errors.stateCode}>
          <select className="input" value={c.stateCode} onChange={(e) => set('stateCode', e.target.value)}>
            {STATE_LIST.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <Field label="City"><input className="input" value={c.city} onChange={(e) => set('city', e.target.value)} /></Field>
      </div>
      <Field label="Billing address" error={errors.billingAddress}>
        <textarea className="input" rows={2} value={c.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameShip} onChange={(e) => setSameShip(e.target.checked)} /> Shipping address same as billing</label>
      {!sameShip && (
        <Field label="Shipping address"><textarea className="input" rows={2} value={c.shippingAddress} onChange={(e) => set('shippingAddress', e.target.value)} /></Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" error={errors.phone}><input className="input" value={c.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 90000 0XXXX" /></Field>
        <Field label="Email" error={errors.email}><input className="input" value={c.email} onChange={(e) => set('email', e.target.value)} /></Field>
      </div>
      <Field label="Payment terms">
        <select className="input" value={c.termsDays} onChange={(e) => set('termsDays', Number(e.target.value))}>
          {TERMS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
        </select>
      </Field>
    </Drawer>
  );
}
