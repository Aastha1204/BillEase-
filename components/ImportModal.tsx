'use client';
import { useMemo, useState } from 'react';
import { parseItemCsv } from '@/lib/domain/csv';
import type { Item } from '@/lib/domain/entities';
import { formatINR } from '@/lib/domain/money';
import { useApp } from '@/lib/store';
import { downloadText } from '@/lib/download';
import { Button, Chip, Modal } from './ui';

const TEMPLATE = 'name,hsn,unit,rate,gst,category\r\nModular Bell Push,8536,Pcs,85.00,18,Switches & Sockets\r\n';

/** CSV import with a preview step: nothing is saved until you confirm. */
export function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const importItems = useApp((s) => s.importItems);
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseItemCsv(text) : null), [text]);
  const good = parsed?.rows.filter((r) => !r.errors.length) ?? [];
  const bad = parsed?.rows.filter((r) => r.errors.length) ?? [];

  async function onFile(f: File | undefined) { if (f) setText(await f.text()); }
  function close() { setText(''); onClose(); }
  function confirm() {
    const items: Item[] = good.map((r, i) => ({
      id: `item-imp-${Date.now().toString(36)}-${i}`, name: r.name, hsn: r.hsn, unit: r.unit, category: r.category, caVerified: false,
      rates: [{ effectiveFrom: '2025-04-01', ratePaise: r.ratePaise, gstRate: r.gstRate }],
    }));
    importItems(items);
    onDone(`Imported ${items.length} item${items.length === 1 ? '' : 's'}`);
    close();
  }

  return (
    <Modal open={open} onClose={close} wide title="Import items from CSV"
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!good.length} onClick={confirm}>Import {good.length} valid row{good.length === 1 ? '' : 's'}</Button></>}>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose CSV file" className="text-sm" />
        <Button onClick={() => downloadText('items-template.csv', TEMPLATE, 'text/csv')}>Download template</Button>
        <Button onClick={() => setText(TEMPLATE)}>Try the sample</Button>
      </div>
      <textarea className="input font-mono text-xs" rows={4} placeholder="…or paste CSV here (columns: name, hsn, unit, rate, gst, category)" value={text} onChange={(e) => setText(e.target.value)} aria-label="CSV text" />
      {parsed?.headerError && <p className="text-sm text-overdue">{parsed.headerError}</p>}
      {parsed && !parsed.headerError && (
        <>
          <p className="text-sm"><Chip tone="paid">{good.length} valid</Chip> {bad.length > 0 && <Chip tone="overdue">{bad.length} with errors (skipped)</Chip>}</p>
          <div className="max-h-64 overflow-auto rounded-lg border border-mute/20">
            <table className="w-full text-xs">
              <thead className="text-mute"><tr><th className="p-2 text-left">Line</th><th className="p-2 text-left">Name</th><th className="p-2">HSN</th><th className="p-2">Unit</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">GST</th><th className="p-2 text-left">Status</th></tr></thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.line} className="border-t border-mute/15">
                    <td className="p-2 num">{r.line}</td><td className="p-2">{r.name}</td><td className="p-2 font-mono">{r.hsn}</td><td className="p-2">{r.unit}</td>
                    <td className="p-2 text-right num">{formatINR(r.ratePaise)}</td><td className="p-2 text-right num">{r.gstRate}%</td>
                    <td className="p-2">{r.errors.length ? <span className="text-overdue">{r.errors.join('; ')}</span> : <span className="text-paid">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
