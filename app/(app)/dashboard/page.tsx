'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Plus, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui';
import { dashboardData } from '@/lib/domain/dashboard';
import { formatDate, formatINR } from '@/lib/domain/money';
import { invoiceStatus } from '@/lib/domain/payments';
import { todayIso, useApp } from '@/lib/store';

const SalesTrend = dynamic(() => import('@/components/dashboard/DashboardCharts').then((m) => m.SalesTrend), { ssr: false, loading: () => <div className="h-64" aria-hidden /> });
const GstByRate = dynamic(() => import('@/components/dashboard/DashboardCharts').then((m) => m.GstByRate), { ssr: false, loading: () => <div className="h-64" aria-hidden /> });
const Ageing = dynamic(() => import('@/components/dashboard/DashboardCharts').then((m) => m.Ageing), { ssr: false, loading: () => <div className="h-56" aria-hidden /> });

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Dashboard() {
  const { invoices, payments, creditNotes, resetDemo } = useApp();
  const today = todayIso();
  const d = useMemo(() => dashboardData(invoices, payments, creditNotes, today), [invoices, payments, creditNotes, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><h1 className="text-xl font-bold">Dashboard</h1><p className="text-xs text-mute">{monthName(d.month.ym)} · today {formatDate(today)}</p></div>
        <Button onClick={() => { if (confirm('Reset all demo data to the original dataset?')) resetDemo(); }}><RotateCcw size={16} /> Reset demo data</Button>
        <Link href="/invoices/new"><Button variant="primary"><Plus size={16} /> New invoice <kbd className="rounded bg-black/15 px-1 text-xs">N</kbd></Button></Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile testId="kpi-sales" label="Sales this month" value={d.month.sales} kind="money" sub={`${d.month.invoices} invoices · net of credit notes`} />
        <KpiTile testId="kpi-receivables" label="Receivables" value={d.receivables} kind="money" sub="Unpaid balance across all invoices" />
        <KpiTile testId="kpi-overdue" label="Overdue" value={d.overdue.amount} kind="money" tone="text-overdue" sub={`${d.overdue.count} invoice${d.overdue.count === 1 ? '' : 's'} past due date`} />
        <KpiTile testId="kpi-gst" label="Output GST this month" value={d.month.outputGst} kind="money" sub="Before input tax credit" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-2xl p-4 lg:col-span-2"><h2 className="mb-2 text-sm font-semibold">Sales, last 90 days</h2><SalesTrend data={d.trend} /></section>
        <section className="glass rounded-2xl p-4"><h2 className="mb-2 text-sm font-semibold">GST collected by rate <span className="font-normal text-mute">(90 days)</span></h2><GstByRate data={d.gstByRate} /></section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-2xl p-4"><h2 className="mb-1 text-sm font-semibold">Receivables ageing</h2><p className="mb-2 text-xs text-mute">Days since invoice date</p><Ageing data={d.ageing} /></section>
        <section className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent invoices</h2><Link href="/invoices" className="text-xs text-gold hover:underline">View all</Link></div>
          <ul className="divide-y divide-mute/15 text-sm" data-testid="recent">
            {d.recent.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><Link href={`/invoices/${i.id}`} className="block truncate font-mono text-xs text-gold hover:underline">{i.number}</Link><span className="block truncate text-xs text-mute">{i.customer.name}</span></div>
                <div className="text-right"><div className="num font-medium">{formatINR(i.totals.grandTotal)}</div><StatusChip status={invoiceStatus(i, payments, creditNotes, today)} /></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="glass rounded-2xl p-4">
          <h2 className="mb-2 text-sm font-semibold">Top customers <span className="font-normal text-mute">(90 days)</span></h2>
          <ol className="space-y-2 text-sm" data-testid="top-customers">
            {d.topCustomers.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="num w-5 text-mute">{i + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate">{c.name}</span><span className="text-xs text-mute">{c.count} invoices</span></span>
                <span className="num font-medium">{formatINR(c.total)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
