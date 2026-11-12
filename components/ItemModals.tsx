'use client';
import { useEffect, useState } from 'react';
import { rateOn, type Item } from '@/lib/domain/entities';
import { formatDate, formatINR, toDecimalString, toPaise } from '@/lib/domain/money';
import { useApp, todayIso } from '@/lib/store';
import { GST_SLABS } from './ItemEditor';
import { Button, Chip, Field, Modal } from './ui';

/** Rate history list plus "new rate from date". */
export function ItemHistoryModal({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: (m: string) => void }) {
  const changeRateFrom = useApp((s) => s.changeRateFrom);
  const [date, setDate] = useState(todayIso());
  const [rate, setRate] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (item) { setDate(todayIso()); setRate(toDecimalString(rateOn(item, todayIso()).ratePaise)); setErr(''); } }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const today = todayIso();
  const cur = rateOn(item, today);
  const sorted = [...item.rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  function add() {
    try {
      const p = toPaise(rate);
      if (p < 0) throw new Error();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('Pick an effective date'); return; }
      changeRateFrom(item!.id, date, p);
      onSaved(`New rate effective ${formatDate(date)}`);
      setErr('');
    } catch { setErr('Enter a valid rate'); }
  }

  return (
    <Modal open onClose={onClose} title={`Rate history: ${item.name}`}>
      <table className="w-full text-sm">
        <thead className="text-xs text-mute"><tr><th className="py-1 text-left">Effective from</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">GST</th><th /></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.effectiveFrom} className="border-t border-mute/15">
              <td className="py-2 num">{formatDate(r.effectiveFrom)}</td>
              <td className="py-2 text-right num">{formatINR(r.ratePaise)}</td>
              <td className="py-2 text-right num">{r.gstRate}%</td>
              <td className="py-2 pl-2 text-right">{r === cur ? <Chip tone="paid">Current</Chip> : r.effectiveFrom > today ? <Chip tone="info">Scheduled</Chip> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-mute">An invoice uses the rate effective on its invoice date.</p>
      <div className="grid grid-cols-2 gap-3 border-t border-mute/20 pt-3">
        <Field label="New rate (₹)" error={err}><input className="input num" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Effective from"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end"><Button variant="primary" onClick={add}>Add rate change</Button></div>
    </Modal>
  );
}

/** "Change GST rate from date…": a future GST change needs no code change. */
export function GstChangeModal({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: (m: string) => void }) {
  const changeGstRateFrom = useApp((s) => s.changeGstRateFrom);
  const [date, setDate] = useState(todayIso());
  const [gst, setGst] = useState(18);
  useEffect(() => { if (item) { setDate(todayIso()); setGst(rateOn(item, todayIso()).gstRate); } }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const cur = rateOn(item, date);
  return (
    <Modal open onClose={onClose} title="Change GST rate from date…"
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!date || gst === cur.gstRate} onClick={() => { changeGstRateFrom(item.id, date, gst); onSaved(`GST ${gst}% from ${formatDate(date)}`); onClose(); }}>Apply change</Button></>}>
      <p className="text-sm">{item.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Effective from"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="New GST %"><select className="input" value={gst} onChange={(e) => setGst(Number(e.target.value))}>{GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
      </div>
      <p className="text-xs text-mute">Rate on that date today: {cur.gstRate}%. Invoices dated before it keep the old rate. The item goes back to “CA to confirm”.</p>
    </Modal>
  );
}
