'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { formatDate, formatINR } from '@/lib/domain/money';
import { stateLabel } from '@/lib/domain/states';
import type { Invoice } from '@/lib/domain/types';
import { amountInWordsINR } from '@/lib/domain/words';

const A4_W = 794; // px at 96 dpi
const A4_H = 1123;

/** On-screen A4 preview (HTML). The downloadable vector PDF is built separately in Phase 4. */
export function InvoicePreview({ inv, business }: { inv: Invoice; business: Business }) {
  const wrap = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [h, setH] = useState(A4_H);

  useEffect(() => {
    const w = wrap.current, p = page.current;
    if (!w || !p) return;
    const ro = new ResizeObserver(() => { setScale(Math.min(1, w.clientWidth / A4_W)); setH(p.scrollHeight); });
    ro.observe(w); ro.observe(p);
    return () => ro.disconnect();
  }, []);

  const t = inv.totals;
  const inter = t.supply === 'inter';
  const draft = !inv.number;
  const shipState = inv.shipToStateCode ?? inv.placeOfSupply;
  return (
    <div ref={wrap} className="w-full" data-testid="invoice-preview">
      <div style={{ height: h * scale }} className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10">
        <div ref={page} style={{ width: A4_W, minHeight: A4_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          className="relative bg-white p-[45px] text-[11px] leading-snug text-slate-800">
          {draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[120px] font-black tracking-widest text-slate-900/[0.04] rotate-[-30deg]">DRAFT</div>}
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
            <div className="flex gap-3">
              {business.logoSvg ? <img src={business.logoSvg} alt="" className="h-14 w-14" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-amber-300">{business.tradeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()}</div>}
              <div>
                <div className="text-base font-bold">{business.tradeName}</div>
                <div className="text-slate-500">{business.legalName}</div>
                <div>{business.address}, {business.city} {business.pincode}</div>
                <div className="font-mono">GSTIN: {business.gstin}</div>
                <div>{business.phone} · {business.email}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-extrabold tracking-wide">TAX INVOICE</div>
              <div className="text-slate-500">Original for Recipient</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2 rounded bg-slate-50 p-2">
            <Meta k="Invoice No." v={inv.number ?? 'Draft'} mono />
            <Meta k="Invoice date" v={formatDate(inv.date)} />
            <Meta k="Due date" v={formatDate(inv.dueDate)} />
            <Meta k="Place of supply" v={stateLabel(inv.placeOfSupply)} />
            <Meta k="Reverse charge" v={inv.reverseCharge ? 'Yes' : 'No'} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <Party title="Bill to" name={inv.customer.name} addr={inv.customer.address} gstin={inv.customer.gstin} state={stateLabel(inv.customer.stateCode ?? inv.placeOfSupply)} />
            <Party title="Ship to" name={inv.customer.name} addr={inv.shipToAddress ?? inv.customer.address} gstin={inv.customer.gstin} state={stateLabel(shipState)} />
          </div>

          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                {['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Disc.', 'Taxable'].map((x, i) => <th key={x} className={`px-1.5 py-1 font-semibold ${i > 2 && i !== 4 ? 'text-right' : 'text-left'}`}>{x}</th>)}
                {inter ? <th className="px-1.5 py-1 text-right font-semibold">IGST</th> : <><th className="px-1.5 py-1 text-right font-semibold">CGST</th><th className="px-1.5 py-1 text-right font-semibold">SGST</th></>}
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => {
                const r = t.lines[i];
                return (
                  <tr key={l.id} className="border-b border-slate-200 align-top">
                    <td className="px-1.5 py-1">{i + 1}</td><td className="px-1.5 py-1">{l.description || '—'}</td><td className="px-1.5 py-1 font-mono">{l.hsn}</td>
                    <td className="num px-1.5 py-1 text-right">{l.qty}</td><td className="px-1.5 py-1">{l.unit}</td>
                    <td className="num px-1.5 py-1 text-right">{formatINR(l.ratePaise, { symbol: false })}</td>
                    <td className="num px-1.5 py-1 text-right">{r.discount ? formatINR(r.discount, { symbol: false }) : '—'}</td>
                    <td className="num px-1.5 py-1 text-right">{formatINR(r.taxable, { symbol: false })}</td>
                    {inter
                      ? <td className="num px-1.5 py-1 text-right">{formatINR(r.igst, { symbol: false })}<div className="text-slate-400">{l.gstRate}%</div></td>
                      : <><td className="num px-1.5 py-1 text-right">{formatINR(r.cgst, { symbol: false })}<div className="text-slate-400">{l.gstRate / 2}%</div></td>
                        <td className="num px-1.5 py-1 text-right">{formatINR(r.sgst, { symbol: false })}<div className="text-slate-400">{l.gstRate / 2}%</div></td></>}
                  </tr>
                );
              })}
              {!inv.lines.length && <tr><td colSpan={inter ? 9 : 10} className="py-6 text-center text-slate-400">Add items to see them here</td></tr>}
            </tbody>
          </table>

          <div className="mt-3 flex justify-between gap-6">
            <div className="flex-1">
              <div className="mb-1 font-semibold">Tax summary</div>
              <table className="w-full border-collapse text-[10px]">
                <thead><tr className="bg-slate-100"><th className="px-1 py-0.5 text-left">Rate</th><th className="px-1 py-0.5 text-right">Taxable</th><th className="px-1 py-0.5 text-right">{inter ? 'IGST' : 'CGST + SGST'}</th></tr></thead>
                <tbody>{t.byRate.map((b) => (
                  <tr key={b.gstRate} className="border-b border-slate-100"><td className="px-1 py-0.5">{b.gstRate}%</td><td className="num px-1 py-0.5 text-right">{formatINR(b.taxable, { symbol: false })}</td><td className="num px-1 py-0.5 text-right">{formatINR(b.totalTax, { symbol: false })}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="w-64 space-y-0.5">
              <T k="Taxable value" v={formatINR(t.taxable)} />
              {inter ? <T k="IGST" v={formatINR(t.igst)} /> : <><T k="CGST" v={formatINR(t.cgst)} /><T k="SGST" v={formatINR(t.sgst)} /></>}
              {t.roundOff !== 0 && <T k="Round off" v={formatINR(t.roundOff)} />}
              <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 text-base font-extrabold"><span>Grand total</span><span className="num">{formatINR(t.grandTotal)}</span></div>
            </div>
          </div>
          <div className="mt-2 rounded bg-slate-50 p-2 font-medium">{amountInWordsINR(t.grandTotal)}</div>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-200 pt-3">
            <div>
              <div className="font-semibold">Bank details</div>
              <div>{business.bankName}</div><div>A/c {business.bankAccountMasked}</div><div>IFSC {business.ifsc}</div><div>UPI {business.upiId}</div>
              <div className="mt-1 text-slate-400">UPI QR appears on the issued PDF</div>
            </div>
            <div>
              <div className="font-semibold">Terms</div>
              <div>Payment due by {formatDate(inv.dueDate)}.</div><div>Goods once sold will not be taken back.</div>
            </div>
            <div className="text-right">
              <div>For {business.tradeName}</div>
              {business.signatureSvg ? <img src={business.signatureSvg} alt="" className="ml-auto h-12" /> : <div className="h-12" />}
              <div className="border-t border-slate-300 pt-0.5">Authorised Signatory</div>
              <div className="text-slate-500">{business.signatoryName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Meta = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <div><div className="text-[9px] uppercase text-slate-400">{k}</div><div className={`font-semibold ${mono ? 'font-mono' : ''}`}>{v}</div></div>
);
const T = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span>{k}</span><span className="num">{v}</span></div>;
const Party = ({ title, name, addr, gstin, state }: { title: string; name: string; addr: string; gstin?: string; state: string }) => (
  <div className="rounded border border-slate-200 p-2">
    <div className="text-[9px] font-semibold uppercase text-slate-400">{title}</div>
    <div className="font-semibold">{name || '—'}</div><div>{addr}</div>
    {gstin && <div className="font-mono">GSTIN: {gstin}</div>}<div>State: {state}</div>
  </div>
);
