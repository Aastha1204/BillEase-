'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import { formatDate, formatINR } from '@/lib/domain/money';
import { standardView, type PartyView } from '@/lib/domain/standardView';
import type { Invoice } from '@/lib/domain/types';

const A4_W = 794;
const A4_H = 1123;
const money = (p: number) => formatINR(p, { symbol: false });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));
const B = 'border-black';
const lab = 'text-[7px] leading-none text-neutral-500';

function Party({ title, p, supply }: { title: string; p: PartyView; supply?: string }) {
  return (
    <div className={`border-b ${B} p-1.5`}>
      <div className={lab}>{title}</div>
      <div className="text-[11px] font-bold">{p.name || '—'}</div>
      <div>{p.address}</div>
      {p.pin && <div>Pin Code : {p.pin}</div>}
      {p.gstin && <div>GSTIN/UIN : {p.gstin}</div>}
      {p.pan && <div>PAN : {p.pan}</div>}
      <div>State Name : {p.stateName}, Code : {p.stateCode}{supply ? `    Place of Supply : ${supply}` : ''}</div>
      {p.contact && <div>Contact : {p.contact}</div>}
    </div>
  );
}

/** On-screen A4 preview of the Standard (Indian trade) invoice. Same data as the PDF (standardView). */
export function StandardPreview({ inv, business }: { inv: Invoice; business: Business }) {
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

  const v = standardView(inv, business);
  const draft = !inv.number;
  const initials = business.tradeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const totalTax = v.cgst + v.sgst + v.igst;
  const cols = v.inter ? '24px 46px 1fr 56px 52px 32px 54px 34px 62px 32px 56px' : '24px 46px 1fr 56px 52px 32px 54px 34px 62px 32px 56px 56px';
  const heads = ['Sr.', 'Part No.', 'Description of Goods / Services', 'HSN / SAC', 'Quantity', 'UOM', 'Rate', 'Disc %', 'Value', 'GST %', ...(v.inter ? ['IGST Amt'] : ['CGST Amt', 'SGST Amt'])];
  const right = new Set([4, 6, 7, 8, 9, 10, 11]);

  return (
    <div ref={wrap} className="w-full" data-testid="invoice-preview" data-format="standard">
      <div style={{ height: h * scale }} className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10">
        <div ref={page} style={{ width: A4_W, minHeight: A4_H, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="relative bg-white p-[24px] text-[9.5px] leading-snug text-black">
          {draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[130px] font-black tracking-widest text-black/[0.05] rotate-[-30deg]">DRAFT</div>}
          <div className={`flex items-center justify-between border ${B} px-2 py-1.5`}>
            <span className="w-40 text-[8px] text-neutral-500">{v.eInvoice ? 'e-Invoice (demo values)' : ''}</span>
            <span className="text-[16px] font-extrabold">{v.title}</span>
            <span className="w-40 text-right text-[8px] text-neutral-500">(ORIGINAL FOR RECIPIENT)</span>
          </div>
          {v.eInvoice && (
            <div className={`border border-t-0 ${B} px-2 py-1`}>
              <div className="break-all">IRN : {v.eInvoice.irn}</div>
              <div>Ack No. : {v.eInvoice.ackNo}    Ack Date : {formatDate(v.eInvoice.ackDate)} <span className="text-neutral-500">(demo values, not registered on the e-invoice portal)</span></div>
            </div>
          )}

          <div className={`flex border border-t-0 ${B}`}>
            <div className="w-[46%]">
              <div className={`flex gap-2 border-b ${B} p-1.5`}>
                {business.logoSvg ? <img src={business.logoSvg} alt="" className="h-11 w-11" /> : <div className="flex h-11 w-11 items-center justify-center rounded bg-slate-900 text-xs font-bold text-amber-300">{initials}</div>}
                <div>
                  <div className="text-[12px] font-bold">{v.supplier.name}</div>
                  <div>{v.supplier.address}</div>
                  <div>GSTIN/UIN : {v.supplier.gstin}</div>
                  <div>PAN : {v.supplier.pan}{v.supplier.cin ? `    CIN : ${v.supplier.cin}` : ''}</div>
                  <div>State Name : {v.supplier.stateName}, Code : {v.supplier.stateCode}</div>
                  <div>{[v.supplier.phone && `Phone : ${v.supplier.phone}`, v.supplier.email && `E-Mail : ${v.supplier.email}`].filter(Boolean).join('   ')}</div>
                </div>
              </div>
              <Party title="Consignee (Ship to)" p={v.consignee} />
              <Party title="Buyer (Bill to)" p={v.buyer} supply={v.placeOfSupply} />
            </div>
            <div className={`w-[54%] border-l ${B}`}>
              {v.grid.map((row, i) => (
                <div key={i} className={`grid grid-cols-2 ${i < v.grid.length - 1 ? `border-b ${B}` : ''}`}>
                  {row.map(([l, val], k) => (
                    <div key={k} className={`min-h-[22px] p-1 ${k ? `border-l ${B}` : ''}`}><div className={lab}>{l}</div><div className="font-bold">{val}</div></div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className={`border border-t-0 ${B}`}>
            <div className={`grid border-b ${B} bg-neutral-200 font-bold`} style={{ gridTemplateColumns: cols }}>
              {heads.map((h2, i) => <div key={h2} className={`px-1 py-0.5 ${i ? `border-l ${B}` : ''} ${right.has(i) ? 'text-right' : ''}`}>{h2}</div>)}
            </div>
            <div className="min-h-[120px]">
              {v.items.map((it) => (
                <div key={it.sr} className="grid" style={{ gridTemplateColumns: cols }}>
                  <div className="px-1 py-0.5">{it.sr}</div>
                  <div className={`border-l ${B} px-1 py-0.5`}>{it.partNo}</div>
                  <div className={`border-l ${B} px-1 py-0.5`}><div className="font-bold">{it.description || '—'}</div>{it.details.length > 0 && <div className="text-[8px] text-neutral-700">{it.details.join('  |  ')}</div>}</div>
                  <div className={`border-l ${B} px-1 py-0.5`}>{it.hsn}</div>
                  <div className={`border-l ${B} px-1 py-0.5 text-right font-bold`}>{qty(it.qty)}</div>
                  <div className={`border-l ${B} px-1 py-0.5`}>{it.uom}</div>
                  <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(it.rate)}</div>
                  <div className={`border-l ${B} px-1 py-0.5 text-right`}>{it.discountPct || ''}</div>
                  <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(it.value)}</div>
                  <div className={`border-l ${B} px-1 py-0.5 text-right`}>{it.gstRate}%</div>
                  {v.inter ? <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(it.igst)}</div> : <>
                    <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(it.cgst)}</div><div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(it.sgst)}</div></>}
                </div>
              ))}
              {!v.items.length && <div className="px-2 py-6 text-center text-neutral-400">Add items to see them here</div>}
            </div>
            <div className={`grid border-t ${B} font-bold`} style={{ gridTemplateColumns: cols }}>
              <div className="col-span-4 px-1 py-0.5 text-right">Total</div>
              <div className={`border-l ${B} px-1 py-0.5 text-right`}>{v.totalQty !== null ? qty(v.totalQty) : ''}</div>
              <div className={`border-l ${B} px-1 py-0.5`}>{v.totalQty !== null ? v.totalQtyUnit : ''}</div>
              <div className={`col-span-2 border-l ${B}`} />
              <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(v.itemValue)}</div>
              <div className={`border-l ${B}`} />
              {v.inter ? <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(v.igst)}</div> : <>
                <div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(v.cgst)}</div><div className={`border-l ${B} px-1 py-0.5 text-right`}>{money(v.sgst)}</div></>}
            </div>
          </div>

          <div className={`flex border border-t-0 ${B}`}>
            <div className="w-[52%] p-1.5">
              <div className={lab}>Invoice Value (In Words)</div>
              <div className="text-[11px] font-bold">{v.amountWords}</div>
              <div className="mt-1.5 font-bold">Terms &amp; Conditions of Sale</div>
              {v.terms.map((t, i) => <div key={i} className="text-[8.5px]">{i + 1}) {t}</div>)}
              <div className="text-[8.5px]">{v.terms.length + 1}) {v.jurisdiction}.</div>
              <div className="mt-1 font-bold">Declaration</div>
              <div className="text-[8.5px]">{v.declaration} E. &amp; O.E.</div>
            </div>
            <div className={`w-[48%] border-l ${B} p-1.5`}>
              {[['Total Item Value', money(v.itemValue)], ...v.charges.map((c) => [c.label, money(c.value)]), ['Total Taxable Value', money(v.taxable)],
                ...(v.inter ? [[`Output IGST ${v.rateLabel}`, money(v.igst)]] : [[`Output CGST ${v.rateLabel}`, money(v.cgst)], [`Output SGST ${v.rateLabel}`, money(v.sgst)]]),
                ...(v.roundOff !== 0 ? [['Rounding Off (Sales)', formatINR(v.roundOff, { symbol: false })]] : [])].map(([k, val], i) => (
                <div key={i} className={`flex justify-between py-px ${k === 'Total Taxable Value' ? 'font-bold' : ''}`}><span>{k}</span><span className="num">{val}</span></div>
              ))}
              <div className={`mt-1 flex items-baseline justify-between border-t ${B} pt-1`}><span className="text-[12px] font-bold">Invoice Total</span><span className="num text-[14px] font-extrabold">{formatINR(v.grandTotal)}</span></div>
            </div>
          </div>

          <div className={`border border-t-0 ${B}`}>
            <table className="w-full border-collapse text-[9px]">
              <thead className="bg-neutral-200">
                <tr>{(v.inter ? ['HSN / SAC', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total Tax Amount'] : ['HSN / SAC', 'Taxable Value', 'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount', 'Total Tax Amount']).map((x, i) => <th key={x} className={`px-1 py-0.5 ${i ? `border-l ${B} text-right` : 'text-left'} font-bold`}>{x}</th>)}</tr>
              </thead>
              <tbody>
                {v.hsnRows.map((h2) => (
                  <tr key={`${h2.hsn}-${h2.rate}`} className={`border-t ${B}`}>
                    <td className="px-1 py-0.5">{h2.hsn}</td><td className={`border-l ${B} px-1 text-right`}>{money(h2.taxable)}</td>
                    {v.inter ? <><td className={`border-l ${B} px-1 text-right`}>{h2.rate}%</td><td className={`border-l ${B} px-1 text-right`}>{money(h2.igst)}</td></>
                      : <><td className={`border-l ${B} px-1 text-right`}>{h2.rate / 2}%</td><td className={`border-l ${B} px-1 text-right`}>{money(h2.cgst)}</td><td className={`border-l ${B} px-1 text-right`}>{h2.rate / 2}%</td><td className={`border-l ${B} px-1 text-right`}>{money(h2.sgst)}</td></>}
                    <td className={`border-l ${B} px-1 text-right`}>{money(h2.totalTax)}</td>
                  </tr>
                ))}
                <tr className={`border-t ${B} font-bold`}>
                  <td className="px-1 py-0.5">Total</td><td className={`border-l ${B} px-1 text-right`}>{money(v.taxable)}</td>
                  {v.inter ? <><td className={`border-l ${B}`} /><td className={`border-l ${B} px-1 text-right`}>{money(v.igst)}</td></>
                    : <><td className={`border-l ${B}`} /><td className={`border-l ${B} px-1 text-right`}>{money(v.cgst)}</td><td className={`border-l ${B}`} /><td className={`border-l ${B} px-1 text-right`}>{money(v.sgst)}</td></>}
                  <td className={`border-l ${B} px-1 text-right`}>{money(totalTax)}</td>
                </tr>
              </tbody>
            </table>
            <div className={`border-t ${B} px-1.5 py-1`}><span className={lab}>Tax Amount (in words) : </span><span className="font-bold">{v.taxWords}</span></div>
          </div>

          <div className={`flex border border-t-0 ${B}`}>
            <div className="w-[52%] p-1.5">
              <div className="font-bold">Company&apos;s Bank Details</div>
              {v.bank.name && <div>Bank Name : {v.bank.name}</div>}{v.bank.account && <div>A/c No. : {v.bank.account}</div>}
              {(v.bank.branch || v.bank.ifsc) && <div>Branch &amp; IFSC : {[v.bank.branch, v.bank.ifsc].filter(Boolean).join(' & ')}</div>}
              {!v.bank.name && !v.bank.account && !v.bank.upi && <div className="text-neutral-500">Add bank details in Settings</div>}
              {v.bank.upi && <div>UPI : {v.bank.upi}</div>}
              <div className="mt-0.5 text-[8px] text-neutral-500">UPI QR is printed on the issued PDF</div>
            </div>
            <div className={`w-[48%] border-l ${B}`}>
              <div className={`border-b ${B} p-1.5 text-right`}>
                <div className="text-[8.5px]">Certified that the particulars given above are true and correct</div>
                <div className="mt-0.5 font-bold">For {v.supplier.name}</div>
                <div className="flex h-9 items-center justify-end">{business.signatureSvg && <img src={business.signatureSvg} alt="" className="h-8" />}</div>
                <div>Authorised Signatory</div>
              </div>
              <div className="grid h-10 grid-cols-2"><div className="p-1.5"><span className={lab}>Receiver&apos;s Signature</span></div><div className={`border-l ${B} p-1.5`}><span className={lab}>Stamp</span></div></div>
            </div>
          </div>
          <div className="mt-1 text-center text-[8.5px] text-neutral-600">This is a Computer Generated Invoice</div>
        </div>
      </div>
    </div>
  );
}
