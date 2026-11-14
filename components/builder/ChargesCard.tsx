'use client';
import { Plus, Trash2 } from 'lucide-react';
import { CHARGE_PRESETS } from '@/lib/domain/standardView';
import { formatINR } from '@/lib/domain/money';
import type { InvoiceTotals, LineInput } from '@/lib/domain/types';
import { GST_SLABS } from '../ItemEditor';
import { MoneyInput } from './CommitInput';

/** Loading, freight, transport and similar charges. They are taxable lines, printed in the totals block of the invoice. */
export function ChargesCard({ lines, totals, readOnly, onChange }: { lines: LineInput[]; totals: InvoiceTotals; readOnly?: boolean; onChange: (lines: LineInput[]) => void }) {
  const charges = lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === 'charge');
  const patch = (id: string, p: Partial<LineInput>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = (label: string, hsn: string, gstRate: number) =>
    onChange([...lines, { id: `ch-${Date.now().toString(36)}${lines.length}`, description: label, hsn, qty: 1, unit: 'Job', ratePaise: 0, discount: { kind: 'percent', value: 0 }, gstRate, kind: 'charge' }]);

  if (readOnly && !charges.length) return null;
  return (
    <section className="glass space-y-3 rounded-2xl p-4" data-testid="charges-card">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Charges <span className="font-normal text-mute">(loading, freight, transport…)</span></h3>
        {!readOnly && CHARGE_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => add(p.label, p.hsn, p.gstRate)} data-testid={`add-charge-${p.hsn}`}
            className="inline-flex items-center gap-1 rounded-lg border border-mute/30 px-2 py-1 text-xs hover:bg-mute/10"><Plus size={12} /> {p.short}</button>
        ))}
      </div>
      {charges.length === 0 ? <p className="text-xs text-mute">No charges. Add the ones that apply; each is taxed like any other line and listed under the item table on the invoice.</p> : (
        <ul className="space-y-2">
          {charges.map(({ l, i }) => (
            <li key={l.id} className="grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[1fr_6rem_8rem_5rem_6rem_auto] md:items-center" data-testid="charge-row">
              <input className="input" value={l.description} disabled={readOnly} onChange={(e) => patch(l.id, { description: e.target.value })} aria-label="Charge description" />
              <input className="input font-mono" value={l.hsn} disabled={readOnly} inputMode="numeric" onChange={(e) => patch(l.id, { hsn: e.target.value })} aria-label="Charge SAC" placeholder="SAC" />
              <MoneyInput paise={l.ratePaise} disabled={readOnly} onChange={(p) => patch(l.id, { ratePaise: p })} aria-label="Charge amount" className="text-right" data-testid="charge-amount" />
              <select className="input" value={l.gstRate} disabled={readOnly} onChange={(e) => patch(l.id, { gstRate: Number(e.target.value) })} aria-label="Charge GST rate">{GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}</select>
              <span className="num text-right text-sm">{formatINR(totals.lines[i]?.total ?? 0)}</span>
              {!readOnly && <button type="button" className="rounded p-2 text-mute hover:bg-overdue/15 hover:text-overdue" aria-label="Remove charge" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}><Trash2 size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
