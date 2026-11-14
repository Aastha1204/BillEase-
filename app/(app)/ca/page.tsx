'use client';
import { Archive, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, FolderOpen, Plus, XCircle } from 'lucide-react';
import { AddBusinessModal } from '@/components/business/AddBusinessModal';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Toast } from '@/components/ui';
import { buildAllPacks, CA_FIRM, clientRow } from '@/lib/domain/ca';
import { caPackBuffer, caPackFileName } from '@/lib/domain/exports';
import { formatDate, formatINR } from '@/lib/domain/money';
import { buildReports } from '@/lib/domain/reportTables';
import { invoicesForMonth } from '@/lib/domain/reports';
import { downloadBlob } from '@/lib/download';
import { todayIso, useApp, workspacesOf } from '@/lib/store';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The CA's client list: only businesses linked to the firm. Opening one switches the whole app to that business. */
export default function ClientsPage() {
  const router = useRouter();
  const state = useApp();
  const thisMonth = todayIso().slice(0, 7);
  const [ym, setYm] = useState(thisMonth);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const spaces = workspacesOf(state);
  const rows = useMemo(() => spaces.map((w) => clientRow(w, ym)), [spaces, ym]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.mode !== 'ca') {
    return (
      <div className="glass mx-auto mt-10 max-w-md space-y-3 rounded-2xl p-6 text-center">
        <Briefcase className="mx-auto text-gold" />
        <h1 className="text-lg font-bold">CA view is off</h1>
        <p className="text-sm text-mute">Switch to the CA view to see the clients linked to {CA_FIRM.name}.</p>
        <Button variant="primary" onClick={state.enterCa} data-testid="enter-ca">Enter as CA</Button>
      </div>
    );
  }

  const open = (id: string) => { state.switchWorkspace(id); router.push('/dashboard'); };

  async function packFor(id: string) {
    const w = spaces.find((x) => x.business.id === id)!;
    setBusy(id);
    try {
      const reports = buildReports({ invoices: w.invoices, creditNotes: w.creditNotes, ym, b2clThreshold: w.business.settings.b2clThreshold });
      const buf = await caPackBuffer({ business: w.business, ym, reports, invoices: invoicesForMonth(w.invoices, ym), generatedOn: todayIso() });
      downloadBlob(caPackFileName(w.business, ym), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      say(`Pack downloaded for ${w.business.tradeName}`);
    } catch (e) { say(`Could not build the pack: ${(e as Error).message}`); } finally { setBusy(null); }
  }

  async function zipAll() {
    setBusy('zip');
    try {
      const bytes = await buildAllPacks(spaces, ym, todayIso());
      downloadBlob(`${CA_FIRM.name.replace(/\s+/g, '-')}-client-packs-${ym}.zip`, new Blob([bytes as BlobPart], { type: 'application/zip' }));
      say(`${spaces.length} client packs downloaded`);
    } catch (e) { say(`Could not build the zip: ${(e as Error).message}`); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><h1 className="text-xl font-bold">Clients</h1><p className="text-xs text-mute">{CA_FIRM.name} · {spaces.length} linked businesses</p></div>
        <div className="flex items-center gap-1">
          <button className="rounded-lg border border-mute/30 p-2 hover:bg-mute/10" onClick={() => setYm(shift(ym, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <input type="month" className="input w-auto" value={ym} max={thisMonth} onChange={(e) => e.target.value && setYm(e.target.value)} aria-label="Month" data-testid="ca-month" />
          <button className="rounded-lg border border-mute/30 p-2 hover:bg-mute/10 disabled:opacity-40" onClick={() => setYm(shift(ym, 1))} disabled={ym >= thisMonth} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <Button onClick={() => setAdding(true)} data-testid="ca-add-business"><Plus size={16} /> Add business</Button>
        <Button variant="primary" onClick={zipAll} disabled={busy !== null} data-testid="zip-all"><Archive size={16} /> {busy === 'zip' ? 'Building…' : 'Download all client packs (.zip)'}</Button>
      </div>
      <p className="text-xs text-mute">{label(ym)}. You only see the businesses linked to your firm; opening one switches the whole app to that business&apos;s books.</p>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[860px] text-left text-sm" data-testid="client-table">
          <thead className="text-xs text-mute"><tr>
            <th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 text-right font-medium">Invoices</th><th className="px-4 py-3 text-right font-medium">Taxable value</th>
            <th className="px-4 py-3 text-right font-medium">Output tax</th><th className="px-4 py-3 font-medium">Export</th><th className="px-4 py-3 font-medium">Last activity</th><th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-mute/15" data-testid="client-row" data-client={r.id}>
                <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-xs text-mute">{r.kind || 'Trader'} · <span className="font-mono">{r.gstin}</span></div></td>
                <td className="num px-4 py-3 text-right">{r.invoices}</td>
                <td className="num px-4 py-3 text-right">{formatINR(r.taxable)}</td>
                <td className="num px-4 py-3 text-right">{formatINR(r.outputTax)}</td>
                <td className="px-4 py-3">
                  {r.exportReady ? <span className="inline-flex items-center gap-1 text-xs font-medium text-paid"><CheckCircle2 size={14} /> Export ready ✓</span>
                    : r.reconDiffs.length ? <span className="inline-flex items-center gap-1 text-xs text-overdue" title={r.reconDiffs.join('; ')}><XCircle size={14} /> Needs review</span>
                      : <span className="text-xs text-mute">No invoices this month</span>}
                </td>
                <td className="num px-4 py-3 text-xs text-mute">{r.lastActivity ? formatDate(r.lastActivity) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <Button className="!px-2.5 !py-1 text-xs" onClick={() => packFor(r.id)} disabled={busy !== null} data-testid={`pack-${r.id}`}><FileSpreadsheet size={14} /> Pack</Button>
                  <Button variant="primary" className="ml-2 !px-2.5 !py-1 text-xs" onClick={() => open(r.id)} data-testid={`open-${r.id}`}><FolderOpen size={14} /> Open books</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBusinessModal open={adding} onClose={() => setAdding(false)} onCreated={(_id, name) => say('Added ' + name + ' to your clients')} />
      <Toast msg={toast} />
    </div>
  );
}
