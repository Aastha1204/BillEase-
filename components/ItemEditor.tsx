'use client';
import { useEffect, useState } from 'react';
import { rateOn, type Item } from '@/lib/domain/entities';
import { toDecimalString, toPaise } from '@/lib/domain/money';
import { useApp, todayIso } from '@/lib/store';
import { Button, Drawer, Field } from './ui';

export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const UNITS = ['Pcs', 'Coil', 'Length', 'Metre', 'Box', 'Set', 'Kg', 'Point', 'Job'];

export function ItemEditor({ item, open, onClose, onSaved }: { item: Item | null; open: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const { upsertItem, items } = useApp();
  const [f, setF] = useState({ name: '', hsn: '', unit: 'Pcs', category: 'Wires & Cables', rate: '', gst: 18 });
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    if (item) {
      const r = rateOn(item, todayIso());
      setF({ name: item.name, hsn: item.hsn, unit: item.unit, category: item.category, rate: toDecimalString(r.ratePaise), gst: r.gstRate });
    } else setF({ name: '', hsn: '', unit: 'Pcs', category: 'Wires & Cables', rate: '', gst: 18 });
  }, [open, item]);

  const cats = [...new Set(items.map((i) => i.category))].sort();

  function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Name is required';
    if (!/^\d{4,8}$/.test(f.hsn.trim())) e.hsn = 'HSN/SAC must be 4 to 8 digits';
    let ratePaise = 0;
    try { ratePaise = toPaise(f.rate); if (ratePaise < 0) throw new Error(); } catch { e.rate = 'Enter a valid rate'; }
    setErr(e);
    if (Object.keys(e).length) return;
    if (item) {
      // Editing the current rate/GST adds a history point effective today so old invoices keep their rates.
      const cur = rateOn(item, todayIso());
      let rates = item.rates;
      if (cur.ratePaise !== ratePaise || cur.gstRate !== f.gst) {
        rates = [...item.rates.filter((r) => r.effectiveFrom !== todayIso()), { effectiveFrom: todayIso(), ratePaise, gstRate: f.gst }]
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      }
      upsertItem({ ...item, name: f.name.trim(), hsn: f.hsn.trim(), unit: f.unit, category: f.category, rates, caVerified: rates === item.rates ? item.caVerified : false });
      onSaved(`Saved ${f.name.trim()}`);
    } else {
      upsertItem({ id: `item-${Date.now().toString(36)}`, name: f.name.trim(), hsn: f.hsn.trim(), unit: f.unit, category: f.category, caVerified: false,
        rates: [{ effectiveFrom: '2025-04-01', ratePaise, gstRate: f.gst }] });
      onSaved(`Added ${f.name.trim()}`);
    }
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title={item ? 'Edit item' : 'Add item'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save item</Button></>}>
      <Field label="Name" error={err.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="HSN/SAC" error={err.hsn} hint="Confirm with your CA"><input className="input font-mono" value={f.hsn} onChange={(e) => setF({ ...f, hsn: e.target.value })} inputMode="numeric" /></Field>
        <Field label="Unit"><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
      </div>
      <Field label="Category">
        <input className="input" list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate (₹, excluding GST)" error={err.rate}><input className="input num" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} inputMode="decimal" /></Field>
        <Field label="GST %"><select className="input" value={f.gst} onChange={(e) => setF({ ...f, gst: Number(e.target.value) })}>{GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
      </div>
      {item && <p className="text-xs text-mute">Changing the rate or GST here takes effect today; earlier invoices keep the rate that applied on their date.</p>}
    </Drawer>
  );
}
