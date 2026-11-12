'use client';
import { Command } from 'cmdk';
import { ChevronDown, Plus, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Customer } from '@/lib/domain/entities';
import { normalizeGstin, validateGstin } from '@/lib/domain/gstin';
import { stateName } from '@/lib/domain/states';
import { useApp } from '@/lib/store';
import { GstinChecks } from '../GstinValidator';
import { Button, Chip } from '../ui';

export function CustomerPicker({ customerId, disabled, onPick }: { customerId: string; disabled?: boolean; onPick: (c: Customer) => void }) {
  const customers = useApp((s) => s.customers);
  const upsertCustomer = useApp((s) => s.upsertCustomer);
  const selected = customers.find((c) => c.id === customerId);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [g, setG] = useState('');
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const v = validateGstin(g);
  const existing = v.valid ? customers.find((c) => c.gstin === v.normalized) : undefined;

  function createFromGstin() {
    if (!v.valid || !name.trim() || !addr.trim()) return;
    const c: Customer = {
      id: `cust-${Date.now().toString(36)}`, name: name.trim(), type: 'B2B', gstin: v.normalized, stateCode: v.stateCode!, city: '',
      billingAddress: addr.trim(), shippingAddress: addr.trim(), phone: '', email: '', termsDays: 15,
    };
    upsertCustomer(c);
    onPick(c);
    setAdding(false); setOpen(false); setG(''); setName(''); setAddr('');
  }

  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="input flex items-center justify-between text-left disabled:opacity-70" data-testid="customer-picker">
        <span className={selected ? '' : 'text-mute'}>
          {selected ? <>{selected.name} <Chip tone={selected.type === 'B2B' ? 'info' : 'mute'}>{selected.type}</Chip></> : 'Choose a customer…'}
        </span>
        <ChevronDown size={16} className="text-mute" />
      </button>
      {open && (
        <div className="glass absolute z-30 mt-1 w-full rounded-xl p-2 shadow-2xl">
          {!adding ? (
            <Command label="Customers">
              <Command.Input autoFocus placeholder="Search customers" className="input mb-2" />
              <Command.List className="max-h-64 overflow-y-auto">
                <Command.Empty className="p-3 text-center text-xs text-mute">No customer found.</Command.Empty>
                {customers.map((c) => (
                  <Command.Item key={c.id} value={`${c.name} ${c.gstin ?? ''} ${c.city}`} onSelect={() => { onPick(c); setOpen(false); }}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-gold/15">
                    <span>{c.name}<span className="block text-xs text-mute">{c.city}, {stateName(c.stateCode)}{c.gstin ? ` · ${c.gstin}` : ''}</span></span>
                    <Chip tone={c.type === 'B2B' ? 'info' : 'mute'}>{c.type}</Chip>
                  </Command.Item>
                ))}
              </Command.List>
              <button type="button" onClick={() => setAdding(true)} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-mute/40 px-3 py-2 text-sm text-gold hover:bg-gold/10">
                <UserPlus size={16} /> Add by GSTIN
              </button>
            </Command>
          ) : (
            <div className="space-y-2 p-1">
              <p className="text-xs font-medium">Add a customer by GSTIN</p>
              <input autoFocus className="input font-mono uppercase" maxLength={17} placeholder="Paste GSTIN" value={g} onChange={(e) => setG(normalizeGstin(e.target.value))} aria-label="GSTIN" />
              <GstinChecks value={g} />
              {existing && <p className="text-xs text-info">Already a customer: <button className="underline" onClick={() => { onPick(existing); setAdding(false); setOpen(false); }}>use {existing.name}</button></p>}
              {v.valid && !existing && (
                <>
                  <p className="text-xs text-mute">State detected: {v.stateName} ({v.stateCode}). Enter the name and address as per the buyer.</p>
                  <input className="input" placeholder="Business name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Business name" />
                  <textarea className="input" rows={2} placeholder="Address" value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="Address" />
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAdding(false)}>Back</Button>
                <Button variant="primary" disabled={!v.valid || !!existing || !name.trim() || !addr.trim()} onClick={createFromGstin}><Plus size={14} /> Add customer</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
