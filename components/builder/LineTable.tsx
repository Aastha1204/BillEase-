'use client';
import { Command } from 'cmdk';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { lineFromItem } from '@/lib/domain/builder';
import type { Item } from '@/lib/domain/entities';
import { rateOn } from '@/lib/domain/entities';
import { formatINR } from '@/lib/domain/money';
import type { InvoiceTotals, LineInput } from '@/lib/domain/types';
import { useApp } from '@/lib/store';
import { GST_SLABS } from '../ItemEditor';
import { MoneyInput, NumberInput } from './CommitInput';

/** Type to search, arrow keys to move, Enter to add the highlighted item as a new line. */
function ItemSearch({ date, onAdd, disabled }: { date: string; onAdd: (item: Item) => void; disabled?: boolean }) {
  const items = useApp((s) => s.items);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const show = focused && !disabled;
  return (
    <Command label="Add item" className="relative" shouldFilter>
      <Command.Input ref={input} value={q} onValueChange={setQ} disabled={disabled} placeholder="Add item: type a name or HSN, press Enter" className="input"
        onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} data-testid="item-search" />
      {show && (
        <Command.List className="glass absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl p-1 shadow-2xl">
          <Command.Empty className="p-3 text-center text-xs text-mute">No item found. Add one in Items.</Command.Empty>
          {items.map((it) => {
            const r = rateOn(it, date);
            return (
              <Command.Item key={it.id} value={`${it.name} ${it.hsn}`}
                onSelect={() => { onAdd(it); setQ(''); input.current?.focus(); }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-gold/15">
                <span>{it.name}<span className="block text-xs text-mute">HSN {it.hsn} · {it.unit}</span></span>
                <span className="num text-right text-xs">{formatINR(r.ratePaise)}<span className="block text-mute">GST {r.gstRate}%</span></span>
              </Command.Item>
            );
          })}
        </Command.List>
      )}
    </Command>
  );
}

export function LineTable({ lines, totals, date, readOnly, onChange }: {
  lines: LineInput[]; totals: InvoiceTotals; date: string; readOnly?: boolean; onChange: (lines: LineInput[]) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const patch = (id: string, p: Partial<LineInput>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = (it: Item) => onChange([...lines, lineFromItem(it, date, `l-${Date.now().toString(36)}${lines.length}`)]);
  const addBlank = () => onChange([...lines, { id: `l-${Date.now().toString(36)}${lines.length}`, description: '', hsn: '', qty: 1, unit: 'Pcs', ratePaise: 0, discount: { kind: 'percent', value: 0 }, gstRate: 18 }]);

  return (
    <div className="space-y-3">
      {!readOnly && <ItemSearch date={date} onAdd={add} />}
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[820px] text-sm" data-testid="line-table">
          <thead className="text-xs text-mute">
            <tr>
              <th className="px-2 py-2 text-left font-medium">#</th><th className="px-2 py-2 text-left font-medium">Item / description</th><th className="px-2 py-2 text-left font-medium">HSN/SAC</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-2 py-2 text-left font-medium">Unit</th><th className="px-2 py-2 text-right font-medium">Rate (₹)</th>
              <th className="px-2 py-2 text-right font-medium">Discount</th><th className="px-2 py-2 text-right font-medium">GST</th><th className="px-2 py-2 text-right font-medium">Line total</th><th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              if (l.kind === 'charge') return null; // charges live in their own card
              const r = totals.lines[i];
              const last = lines.slice(i + 1).every((x) => x.kind === 'charge');
              const no = lines.slice(0, i).filter((x) => x.kind !== 'charge').length + 1;
              const hasExtra = !!(l.partNo || l.grade || l.size || l.batch);
              return (
                <Fragment key={l.id}>
                <tr className="border-t border-mute/15 align-top" data-testid="line-row">
                  <td className="px-2 py-2 text-mute num">{no}</td>
                  <td className="min-w-52 px-2 py-2"><input className="input" value={l.description} disabled={readOnly} onChange={(e) => patch(l.id, { description: e.target.value })} aria-label={`Description ${i + 1}`} /></td>
                  <td className="w-24 px-2 py-2"><input className="input font-mono" value={l.hsn} disabled={readOnly} inputMode="numeric" onChange={(e) => patch(l.id, { hsn: e.target.value })} aria-label={`HSN ${i + 1}`} /></td>
                  <td className="w-20 px-2 py-2"><NumberInput value={l.qty} disabled={readOnly} onChange={(n) => patch(l.id, { qty: n })} aria-label={`Quantity ${i + 1}`} className="text-right" /></td>
                  <td className="w-20 px-2 py-2"><input className="input" value={l.unit} disabled={readOnly} onChange={(e) => patch(l.id, { unit: e.target.value })} aria-label={`Unit ${i + 1}`} /></td>
                  <td className="w-28 px-2 py-2"><MoneyInput paise={l.ratePaise} disabled={readOnly} onChange={(p) => patch(l.id, { ratePaise: p })} aria-label={`Rate ${i + 1}`} className="text-right" /></td>
                  <td className="w-32 px-2 py-2">
                    <div className="flex gap-1">
                      {l.discount.kind === 'percent'
                        ? <NumberInput value={l.discount.value} max={100} disabled={readOnly} onChange={(n) => patch(l.id, { discount: { kind: 'percent', value: n } })} aria-label={`Discount percent ${i + 1}`} className="text-right" />
                        : <MoneyInput paise={l.discount.value} disabled={readOnly} onChange={(p) => patch(l.id, { discount: { kind: 'flat', value: p } })} aria-label={`Discount amount ${i + 1}`} className="text-right" />}
                      <button type="button" disabled={readOnly} title="Switch between % and ₹" aria-label={`Toggle discount type ${i + 1}`}
                        onClick={() => patch(l.id, { discount: l.discount.kind === 'percent' ? { kind: 'flat', value: 0 } : { kind: 'percent', value: 0 } })}
                        className="w-9 shrink-0 rounded-lg border border-mute/30 text-xs hover:bg-mute/10 disabled:opacity-50">{l.discount.kind === 'percent' ? '%' : '₹'}</button>
                    </div>
                  </td>
                  <td className="w-24 px-2 py-2">
                    <select className="input" value={l.gstRate} disabled={readOnly} aria-label={`GST rate ${i + 1}`}
                      onChange={(e) => patch(l.id, { gstRate: Number(e.target.value) })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && last && !readOnly) { e.preventDefault(); addBlank(); } }}>
                      {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </td>
                  <td className="num px-2 py-3 text-right font-medium">{r ? formatINR(r.total) : ''}</td>
                  <td className="whitespace-nowrap px-1 py-2">
                    <button type="button" className={`rounded p-2 hover:bg-mute/15 ${hasExtra ? 'text-gold' : 'text-mute'}`} aria-label={`More details for line ${no}`} title="Part no., grade, size, batch" aria-expanded={!!open[l.id]}
                      onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))} data-testid="line-more"><ChevronDown size={16} className={open[l.id] ? 'rotate-180' : ''} /></button>
                    {!readOnly && <button type="button" className="rounded p-2 text-mute hover:bg-overdue/15 hover:text-overdue" aria-label={`Remove line ${no}`} onClick={() => onChange(lines.filter((x) => x.id !== l.id))}><Trash2 size={16} /></button>}
                  </td>
                </tr>
                {open[l.id] && (
                  <tr className="bg-mute/5" data-testid="line-details">
                    <td />
                    <td colSpan={9} className="px-2 pb-3 pt-1">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {([['partNo', 'Part no.'], ['grade', 'Grade'], ['size', 'Size'], ['batch', 'Batch no.']] as const).map(([k, label]) => (
                          <label key={k} className="block text-xs text-mute">{label}
                            <input className="input mt-0.5" value={l[k] ?? ''} disabled={readOnly} onChange={(e) => patch(l.id, { [k]: e.target.value || undefined })} data-testid={`line-${k}`} />
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {!lines.some((x) => x.kind !== 'charge') && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-mute">No lines yet. Search an item above and press Enter.</td></tr>}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" onClick={addBlank} className="flex items-center gap-1 text-sm text-gold hover:underline"><Plus size={14} /> Add blank line</button>}
    </div>
  );
}
