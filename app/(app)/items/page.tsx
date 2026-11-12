'use client';
import clsx from 'clsx';
import { CalendarClock, Download, History, Pencil, Plus, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ItemEditor } from '@/components/ItemEditor';
import { ItemHistoryModal, GstChangeModal } from '@/components/ItemModals';
import { ImportModal } from '@/components/ImportModal';
import { Button, Chip, Toast } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { rateOn, type Item } from '@/lib/domain/entities';
import { formatINR, toDecimalString } from '@/lib/domain/money';
import { useApp, todayIso } from '@/lib/store';
import { downloadText } from '@/lib/download';

export default function ItemsPage() {
  const { items, setCaVerified } = useApp();
  const today = todayIso();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [edit, setEdit] = useState<Item | null | 'new'>(null);
  const [hist, setHist] = useState<Item | null>(null);
  const [gst, setGst] = useState<Item | null>(null);
  const [imp, setImp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const cats = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => (cat === 'all' || i.category === cat) && (!t || i.name.toLowerCase().includes(t) || i.hsn.includes(t)));
  }, [items, q, cat]);

  const exportCsv = () => downloadText('items.csv', toCsv([
    ['name', 'hsn', 'unit', 'rate', 'gst', 'category'],
    ...rows.map((i) => { const r = rateOn(i, today); return [i.name, i.hsn, i.unit, toDecimalString(r.ratePaise), r.gstRate, i.category]; }),
  ]), 'text/csv');

  // The history modal must reflect store updates, so look the item up live.
  const live = (i: Item | null) => (i ? items.find((x) => x.id === i.id) ?? null : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Items <span className="num text-sm font-normal text-mute">({rows.length})</span></h1>
        <Button onClick={exportCsv}><Download size={16} /> CSV</Button>
        <Button onClick={() => setImp(true)}><Upload size={16} /> Import CSV</Button>
        <Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Add item</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Search item or HSN/SAC" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
        </div>
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs text-mute"><tr>
            {['Item', 'HSN/SAC', 'Unit', 'Rate', 'GST', 'CA review', ''].map((h, i) => <th key={i} className={clsx('px-4 py-3 font-medium', (h === 'Rate' || h === 'GST') && 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((i) => {
              const r = rateOn(i, today);
              const scheduled = i.rates.some((x) => x.effectiveFrom > today);
              return (
                <tr key={i.id} className="border-t border-mute/15">
                  <td className="px-4 py-3"><div className="font-medium">{i.name}</div><div className="text-xs text-mute">{i.category}</div></td>
                  <td className="px-4 py-3 font-mono text-xs">{i.hsn}{i.category === 'Services' && <span className="ml-1 text-mute">(SAC)</span>}</td>
                  <td className="px-4 py-3">{i.unit}</td>
                  <td className="num px-4 py-3 text-right">{formatINR(r.ratePaise)}</td>
                  <td className="num px-4 py-3 text-right">{r.gstRate}%{scheduled && <span title="A future rate change is scheduled" className="ml-1 text-info"><CalendarClock size={13} className="inline" /></span>}</td>
                  <td className="px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input type="checkbox" checked={i.caVerified} onChange={(e) => { setCaVerified(i.id, e.target.checked); say(e.target.checked ? 'Marked CA verified' : 'Marked CA to confirm'); }} aria-label={`CA verified: ${i.name}`} />
                      {i.caVerified ? <Chip tone="paid">CA verified</Chip> : <Chip tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-amber" />CA to confirm</Chip>}
                    </label>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className="rounded p-1.5 hover:bg-mute/15" title="Edit" aria-label={`Edit ${i.name}`} onClick={() => setEdit(i)}><Pencil size={16} /></button>
                    <button className="rounded p-1.5 hover:bg-mute/15" title="Rate history" aria-label={`Rate history for ${i.name}`} onClick={() => setHist(i)}><History size={16} /></button>
                    <button className="rounded p-1.5 hover:bg-mute/15" title="Change GST rate from date…" aria-label={`Change GST rate for ${i.name}`} onClick={() => setGst(i)}><CalendarClock size={16} /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-mute">No items match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-mute">Amber dot: seeded rates and HSN/SAC codes are for demo only. BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA.</p>

      <ItemEditor item={edit === 'new' ? null : edit} open={edit !== null} onClose={() => setEdit(null)} onSaved={say} />
      <ItemHistoryModal item={live(hist)} onClose={() => setHist(null)} onSaved={say} />
      <GstChangeModal item={live(gst)} onClose={() => setGst(null)} onSaved={say} />
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={say} />
      <Toast msg={toast} />
    </div>
  );
}
