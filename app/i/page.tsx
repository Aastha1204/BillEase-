'use client';
import { Download, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { decodeInvoice, type Decoded } from '@/lib/domain/share';
import { formatDate, formatINR } from '@/lib/domain/money';
import { stateLabel } from '@/lib/domain/states';
import { amountInWordsINR } from '@/lib/domain/words';
import { downloadPdf } from '@/lib/pdf/client';
import { upiUriFor } from '@/lib/pdf/element';

/**
 * Public invoice: everything comes from the URL hash (lz-string), so it works on any phone with no backend.
 * PRODUCTION: swap for signed short links so links can expire/revoke and no customer data sits in the URL.
 */
export default function PublicInvoice() {
  const [state, setState] = useState<{ d?: Decoded; error?: string } | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = () => {
      try { setState({ d: decodeInvoice(window.location.hash) }); }
      catch (e) { setState({ error: (e as Error).message }); }
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const d = state?.d;
  const upi = d && d.balance > 0 && d.business.upiId ? upiUriFor(d.invoice, d.business, d.balance) : null;
  useEffect(() => {
    if (!upi) { setQr(''); return; }
    QRCode.toString(upi, { type: 'svg', margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
  }, [upi]);

  if (!state) return <main className="min-h-screen bg-slate-50" />;
  if (!d) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <div className="max-w-sm text-center"><h1 className="text-lg font-bold">Invoice not available</h1><p className="mt-2 text-sm text-slate-600">{state.error}</p></div>
      </main>
    );
  }

  const { invoice: inv, business: b, balance } = d;
  const t = inv.totals;
  const inter = t.supply === 'inter';
  const paid = balance <= 0;

  return (
    <main className="min-h-screen bg-slate-50 pb-10 text-slate-900" data-testid="public-invoice">
      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax invoice</p>
          <h1 className="text-xl font-extrabold">{b.tradeName}</h1>
          <p className="text-xs text-slate-600">{b.address}</p>
          <p className="font-mono text-xs text-slate-600">GSTIN {b.gstin}</p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-bold" data-testid="pub-number">{inv.number}</p>
              <p className="text-xs text-slate-500">Dated {formatDate(inv.date)} · Due {formatDate(inv.dueDate)}</p>
            </div>
            {paid ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Paid</span>
              : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Payment due</span>}
          </div>
          <p className="mt-3 text-xs text-slate-500">{paid ? 'Invoice total' : 'Amount due'}</p>
          <p className="text-3xl font-extrabold tabular-nums" data-testid="pub-amount">{formatINR(paid ? t.grandTotal : balance)}</p>

          {upi && (
            <div className="mt-4 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              {/* Phones: the upi:// link opens the UPI app chooser. */}
              <a href={upi} data-testid="pay-upi" className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-bold text-amber-950 shadow sm:hidden"
                style={{ background: 'linear-gradient(135deg,#F5B544,#FF8A3D)' }}>
                <Smartphone size={18} /> Pay {formatINR(balance)} with UPI
              </a>
              {/* Desktop: scan with a phone. */}
              <div className="hidden items-center gap-4 sm:flex">
                {qr && <div className="h-36 w-36 shrink-0 rounded-lg bg-white p-1 ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: qr }} data-testid="pub-qr" />}
                <div className="text-sm text-slate-600">Scan with any UPI app to pay {formatINR(balance)}.<br /><span className="font-mono text-xs">{b.upiId}</span>
                  {b.settings.demoQrWatermark && <span className="mt-1 block text-xs font-bold text-orange-600">DEMO</span>}</div>
              </div>
            </div>
          )}
          <button onClick={async () => { setBusy(true); try { await downloadPdf({ inv, business: b, balance }); } finally { setBusy(false); } }} disabled={busy}
            data-testid="pub-pdf" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
            <Download size={16} /> {busy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </section>

        <section className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase text-slate-500">Billed to</p>
          <p className="font-semibold">{inv.customer.name}</p>
          <p className="text-slate-600">{inv.customer.address}</p>
          {inv.customer.gstin && <p className="font-mono text-xs text-slate-600">GSTIN {inv.customer.gstin}</p>}
          <p className="mt-1 text-xs text-slate-500">Place of supply: {stateLabel(inv.placeOfSupply)}</p>
        </section>

        <section className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {inv.lines.map((l, i) => {
            const r = t.lines[i];
            return (
              <div key={l.id} className="p-4 text-sm">
                <div className="flex justify-between gap-3"><p className="font-medium">{l.description}</p><p className="font-semibold tabular-nums">{formatINR(r.total)}</p></div>
                <p className="mt-0.5 text-xs text-slate-500">{l.qty} {l.unit} × {formatINR(l.ratePaise)} · HSN {l.hsn} · GST {l.gstRate}%{r.discount ? ` · discount ${formatINR(r.discount)}` : ''}</p>
              </div>
            );
          })}
        </section>

        <section className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200 tabular-nums">
          <Row k="Taxable value" v={formatINR(t.taxable)} />
          {inter ? <Row k="IGST" v={formatINR(t.igst)} /> : <><Row k="CGST" v={formatINR(t.cgst)} /><Row k="SGST" v={formatINR(t.sgst)} /></>}
          {t.roundOff !== 0 && <Row k="Round off" v={formatINR(t.roundOff)} />}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><span>Grand total</span><span>{formatINR(t.grandTotal)}</span></div>
          <p className="pt-1 text-xs text-slate-500">{amountInWordsINR(t.grandTotal)}</p>
        </section>

        <footer className="pt-2 text-center text-xs text-slate-500">
          <p>Powered by BillEase · Neovia AI</p>
          <p className="mt-1">Demo data. This is a prototype invoice.</p>
        </footer>
      </div>
    </main>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span className="text-slate-600">{k}</span><span>{v}</span></div>;
