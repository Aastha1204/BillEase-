'use client';
import clsx from 'clsx';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Toast } from '@/components/ui';
import { allReconciled, buildReports, cellText, TABS, type ReportTable, type TabId } from '@/lib/domain/reportTables';
import { invoicesForMonth } from '@/lib/domain/reports';
import { downloadBlob, downloadText } from '@/lib/download';
import { todayIso, useApp } from '@/lib/store';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Table({ t, onCsv }: { t: ReportTable; onCsv: () => void }) {
  return (
    <section className="glass rounded-2xl" data-testid={`table-${t.id}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <h2 className="mr-auto text-sm font-semibold">{t.title} <span className="num font-normal text-mute">({t.rows.length})</span></h2>
        <Button className="!px-2.5 !py-1 text-xs" onClick={onCsv} data-testid={`csv-${t.id}`}><Download size={14} /> CSV</Button>
      </div>
      {t.note && <p className="px-4 text-xs text-mute">{t.note}</p>}
      <div className="mt-2 max-h-[60vh] overflow-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="sticky top-0 bg-panel text-mute">
            <tr>{t.columns.map((c) => <th key={c.key} className={clsx('whitespace-nowrap px-3 py-2 font-medium', c.type !== 'text' && 'text-right')}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="border-t border-mute/15">
                {r.map((v, k) => <td key={k} className={clsx('whitespace-nowrap px-3 py-1.5', t.columns[k].type !== 'text' ? 'num text-right' : k === 0 && 'font-mono')}>{cellText(t.columns[k], v)}</td>)}
              </tr>
            ))}
            {!t.rows.length && <tr><td colSpan={t.columns.length} className="px-3 py-6 text-center text-mute">Nothing in this period.</td></tr>}
          </tbody>
          {t.totals && t.rows.length > 0 && (
            <tfoot><tr className="border-t-2 border-mute/40 font-semibold">
              {t.totals.map((v, k) => <td key={k} className={clsx('whitespace-nowrap px-3 py-2', t.columns[k].type !== 'text' && 'num text-right')}>{v === null ? '' : cellText(t.columns[k], v)}</td>)}
            </tr></tfoot>
          )}
        </table>
      </div>
      <div className={clsx('flex items-start gap-2 border-t border-mute/15 px-4 py-2 text-xs', t.recon.ok ? 'text-paid' : 'text-overdue')} data-testid={`recon-${t.id}`} data-ok={t.recon.ok}>
        {t.recon.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
        <span>{t.recon.ok ? 'Totals reconcile with invoice lines ✓' : `Does not reconcile with invoice lines: ${t.recon.diffs.join('; ')}`}</span>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { invoices, creditNotes, business } = useApp();
  const thisMonth = todayIso().slice(0, 7);
  const [ym, setYm] = useState(thisMonth);
  const [tab, setTab] = useState<TabId>('sales');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const reports = useMemo(() => buildReports({ invoices, creditNotes, ym, b2clThreshold: business.settings.b2clThreshold }), [invoices, creditNotes, ym, business.settings.b2clThreshold]);
  const monthInvs = useMemo(() => invoicesForMonth(invoices, ym), [invoices, ym]);
  const recon = useMemo(() => allReconciled(reports, monthInvs, business.settings.b2clThreshold), [reports, monthInvs, business.settings.b2clThreshold]);

  async function csv(t: ReportTable) {
    const { tableCsv } = await import('@/lib/domain/exports');
    downloadText(`${t.id}-${ym}.csv`, tableCsv(t), 'text/csv');
  }
  async function pack() {
    setBusy(true);
    try {
      const { caPackBuffer, caPackFileName } = await import('@/lib/domain/exports'); // exceljs is loaded only when needed
      const buf = await caPackBuffer({ business, ym, reports, invoices: monthInvs, generatedOn: todayIso() });
      downloadBlob(caPackFileName(business, ym), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      say('CA pack downloaded');
    } catch (e) { say(`Could not build the CA pack: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Reports</h1>
        <div className="flex items-center gap-1">
          <button className="rounded-lg border border-mute/30 p-2 hover:bg-mute/10" onClick={() => setYm(shift(ym, -1))} aria-label="Previous month" data-testid="prev-month"><ChevronLeft size={16} /></button>
          <input type="month" className="input w-auto" value={ym} max={thisMonth} onChange={(e) => e.target.value && setYm(e.target.value)} aria-label="Month" data-testid="month" />
          <button className="rounded-lg border border-mute/30 p-2 hover:bg-mute/10 disabled:opacity-40" onClick={() => setYm(shift(ym, 1))} disabled={ym >= thisMonth} aria-label="Next month" data-testid="next-month"><ChevronRight size={16} /></button>
        </div>
        <Button variant="primary" onClick={pack} disabled={busy} data-testid="ca-pack"><FileSpreadsheet size={16} /> {busy ? 'Building…' : 'Download CA pack (.xlsx)'}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-mute">{label(ym)} · <span className="num">{monthInvs.length}</span> invoices</span>
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', recon.ok ? 'bg-paid/15 text-paid' : 'bg-overdue/15 text-overdue')} data-testid="recon-all" data-ok={recon.ok}>
          {recon.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {recon.ok ? 'All reports reconcile' : 'Reconciliation failed'}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-mute/20" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            className={clsx('whitespace-nowrap border-b-2 px-3 py-2 text-sm', tab === t.id ? 'border-gold text-gold' : 'border-transparent text-mute hover:text-fg')}>{t.label}</button>
        ))}
      </div>

      <div className="space-y-4">{reports[tab].map((t) => <Table key={t.id} t={t} onCsv={() => csv(t)} />)}</div>
      <p className="text-xs text-mute">BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA.</p>
      <Toast msg={toast} />
    </div>
  );
}
