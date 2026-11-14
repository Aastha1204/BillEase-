import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Business } from '@/lib/domain/entities';
import { formatDate, formatINR } from '@/lib/domain/money';
import { standardView, type PartyView } from '@/lib/domain/standardView';
import type { Invoice } from '@/lib/domain/types';
import { Vector } from './shared';

const MARGIN = 18;
const W = 595.28 - MARGIN * 2; // 551 pt content width
const BORDER = 0.6;
const money = (p: number) => formatINR(p, { symbol: false });
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

const s = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 7, color: '#000000', paddingTop: MARGIN + 14, paddingBottom: MARGIN + 12, paddingHorizontal: MARGIN },
  box: { borderWidth: BORDER, borderColor: '#000' },
  row: { flexDirection: 'row' },
  label: { fontSize: 5.6, color: '#444444' },
  bold: { fontWeight: 700 },
  right: { textAlign: 'right' },
  cell: { paddingVertical: 2.5, paddingHorizontal: 3, borderLeftWidth: BORDER, borderLeftColor: '#000' },
});

/** The Indian trade invoice format: bordered header grid, buyer and consignee blocks, item grid with
 *  per-line tax, charges, HSN tax summary, terms, bank details and signatures. All values come from standardView(). */
export function StandardPdf({ inv, business, qr, balance, kind = 'invoice', against, eInvQr }: {
  inv: Invoice; business: Business; qr?: string | null; balance: number; kind?: 'invoice' | 'credit'; against?: { number: string; date: string }; eInvQr?: string | null;
}) {
  const v = standardView(inv, business);
  const credit = kind === 'credit';
  const draft = !inv.number;
  const initials = business.tradeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const title = credit ? 'CREDIT NOTE' : v.title;
  const grid = v.grid.map((r) => [...r] as typeof r);
  if (credit && against) grid[1] = [['Against Invoice No.', against.number], ['Invoice Date', formatDate(against.date)]];

  // item table column widths (pt): description takes the remainder
  const c = { sr: 18, part: 34, hsn: 40, qty: 38, uom: 24, rate: 40, disc: 26, value: 50, gst: 24, tax: 44 };
  const taxCols = v.inter ? 1 : 2;
  const descW = W - (c.sr + c.part + c.hsn + c.qty + c.uom + c.rate + c.disc + c.value + c.gst + c.tax * taxCols);
  const head = [
    ['Sr.', c.sr, false], ['Part No.', c.part, false], ['Description of Goods / Services', descW, false], ['HSN / SAC', c.hsn, false], ['Quantity', c.qty, true], ['UOM', c.uom, false],
    ['Rate', c.rate, true], ['Disc %', c.disc, true], ['Value', c.value, true], ['GST %', c.gst, true],
    ...(v.inter ? [['IGST Amt', c.tax, true]] : [['CGST Amt', c.tax, true], ['SGST Amt', c.tax, true]]),
  ] as [string, number, boolean][];
  const TableHead = () => (
    <View style={[s.row, { borderBottomWidth: BORDER, borderBottomColor: '#000', backgroundColor: '#EDEDED' }]}>
      {head.map(([h, w, r], i) => <Text key={h} style={[s.cell, s.bold, { width: w, fontSize: 6.8 }, i === 0 ? { borderLeftWidth: 0 } : {}, r ? s.right : {}]}>{h}</Text>)}
    </View>
  );

  const Party = ({ title: t, p }: { title: string; p: PartyView }) => (
    <View style={{ padding: 4, borderBottomWidth: BORDER, borderBottomColor: '#000' }}>
      <Text style={s.label}>{t}</Text>
      <Text style={[s.bold, { fontSize: 8.5 }]}>{p.name}</Text>
      <Text>{p.address}</Text>
      {p.pin ? <Text>Pin Code : {p.pin}</Text> : null}
      {p.gstin ? <Text>GSTIN/UIN : {p.gstin}</Text> : null}
      {p.pan ? <Text>PAN : {p.pan}</Text> : null}
      <Text>State Name : {p.stateName}, Code : {p.stateCode}{t.startsWith('Buyer') ? `    Place of Supply : ${v.placeOfSupply}` : ''}</Text>
      {p.contact ? <Text>Contact : {p.contact}</Text> : null}
    </View>
  );

  const totalTax = v.cgst + v.sgst + v.igst;
  return (
    <Document title={`${title} ${v.number}`} author={business.tradeName} creator="BillEase by Neovia AI">
      <Page size="A4" style={s.page}>
        <View fixed style={{ position: 'absolute', top: MARGIN, left: MARGIN, width: W }} render={({ pageNumber }) => (pageNumber > 1 ? <TableHead /> : <View />)} />
        {draft && <Text fixed style={{ position: 'absolute', top: 330, left: 70, fontSize: 110, fontWeight: 700, color: '#000000', opacity: 0.05, transform: 'rotate(-30deg)' }}>DRAFT</Text>}

        {/* title */}
        <View style={[s.box, s.row, { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6 }]}>
          <Text style={{ width: 120, fontSize: 6.5, color: '#444' }}>{v.eInvoice ? 'e-Invoice (demo values)' : ''}</Text>
          <Text style={{ fontSize: 13, fontWeight: 700 }}>{title}</Text>
          <Text style={{ width: 120, fontSize: 6.5, color: '#444', textAlign: 'right' }}>(ORIGINAL FOR RECIPIENT)</Text>
        </View>

        {v.eInvoice && (
          <View style={[s.box, s.row, { borderTopWidth: 0, paddingVertical: 2, paddingHorizontal: 4, justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flex: 1 }}>
              <Text>IRN : {v.eInvoice.irn}</Text>
              <Text>Ack No. : {v.eInvoice.ackNo}    Ack Date : {formatDate(v.eInvoice.ackDate)}    <Text style={s.label}>(demo values, not registered on the e-invoice portal)</Text></Text>
            </View>
            {eInvQr ? <Image src={eInvQr} style={{ width: 36, height: 36 }} /> : null}
          </View>
        )}

        {/* supplier / buyer / consignee (left) and the reference grid (right) */}
        <View style={[s.box, s.row, { borderTopWidth: 0 }]}>
          <View style={{ width: '46%' }}>
            <View style={[s.row, { padding: 4, borderBottomWidth: BORDER, borderBottomColor: '#000' }]}>
              <Vector uri={business.logoSvg} w={38} h={38} fallback={initials} />
              <View style={{ marginLeft: 6, flex: 1 }}>
                <Text style={[s.bold, { fontSize: 9.5 }]}>{v.supplier.name}</Text>
                <Text>{v.supplier.address}</Text>
                <Text>GSTIN/UIN : {v.supplier.gstin}</Text>
                <Text>PAN : {v.supplier.pan}{v.supplier.cin ? `    CIN : ${v.supplier.cin}` : ''}</Text>
                <Text>State Name : {v.supplier.stateName}, Code : {v.supplier.stateCode}</Text>
                <Text>{[v.supplier.phone && `Phone : ${v.supplier.phone}`, v.supplier.email && `E-Mail : ${v.supplier.email}`].filter(Boolean).join('   ')}</Text>
              </View>
            </View>
            <Party title="Consignee (Ship to)" p={v.consignee} />
            <Party title="Buyer (Bill to)" p={v.buyer} />
          </View>
          <View style={{ width: '54%', borderLeftWidth: BORDER, borderLeftColor: '#000' }}>
            {grid.map((r, i) => (
              <View key={i} style={[s.row, { borderBottomWidth: i === grid.length - 1 ? 0 : BORDER, borderBottomColor: "#000", minHeight: 15 }]}>
                {r.map(([l, val], k) => (
                  <View key={k} style={{ width: '50%', padding: 3, borderLeftWidth: k ? BORDER : 0, borderLeftColor: '#000' }}>
                    <Text style={s.label}>{l}</Text>
                    <Text style={s.bold}>{val}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* items */}
        <View style={[s.box, { borderTopWidth: 0 }]}>
          <TableHead />
          <View style={{ minHeight: 56 }}>
            {v.items.map((it) => (
              <View key={it.sr} wrap={false} style={s.row}>
                <Text style={[s.cell, { width: c.sr, borderLeftWidth: 0 }]}>{it.sr}</Text>
                <Text style={[s.cell, { width: c.part }]}>{it.partNo}</Text>
                <View style={[s.cell, { width: descW }]}>
                  <Text style={s.bold}>{it.description}</Text>
                  {it.details.length ? <Text style={{ fontSize: 6.6, color: '#333' }}>{it.details.join('  |  ')}</Text> : null}
                </View>
                <Text style={[s.cell, { width: c.hsn }]}>{it.hsn}</Text>
                <Text style={[s.cell, s.right, s.bold, { width: c.qty }]}>{qtyText(it.qty)}</Text>
                <Text style={[s.cell, { width: c.uom }]}>{it.uom}</Text>
                <Text style={[s.cell, s.right, { width: c.rate }]}>{money(it.rate)}</Text>
                <Text style={[s.cell, s.right, { width: c.disc }]}>{it.discountPct ? `${it.discountPct}` : ''}</Text>
                <Text style={[s.cell, s.right, { width: c.value }]}>{money(it.value)}</Text>
                <Text style={[s.cell, s.right, { width: c.gst }]}>{it.gstRate}%</Text>
                {v.inter ? <Text style={[s.cell, s.right, { width: c.tax }]}>{money(it.igst)}</Text> : <>
                  <Text style={[s.cell, s.right, { width: c.tax }]}>{money(it.cgst)}</Text>
                  <Text style={[s.cell, s.right, { width: c.tax }]}>{money(it.sgst)}</Text></>}
              </View>
            ))}
            <View style={[s.row, { flexGrow: 1 }]}>
              {head.map(([h, w], i) => <View key={h} style={{ width: w, borderLeftWidth: i === 0 ? 0 : BORDER, borderLeftColor: '#000' }} />)}
            </View>
          </View>
          {/* total row */}
          <View wrap={false} style={[s.row, { borderTopWidth: BORDER, borderTopColor: '#000' }]}>
            <Text style={[s.cell, s.bold, { width: c.sr + c.part + descW + c.hsn, borderLeftWidth: 0, textAlign: 'right' }]}>Total</Text>
            <Text style={[s.cell, s.bold, s.right, { width: c.qty }]}>{v.totalQty !== null ? qtyText(v.totalQty) : ''}</Text>
            <Text style={[s.cell, s.bold, { width: c.uom }]}>{v.totalQty !== null ? v.totalQtyUnit : ''}</Text>
            <Text style={[s.cell, { width: c.rate + c.disc }]} />
            <Text style={[s.cell, s.bold, s.right, { width: c.value }]}>{money(v.itemValue)}</Text>
            <Text style={[s.cell, { width: c.gst }]} />
            {v.inter ? <Text style={[s.cell, s.bold, s.right, { width: c.tax }]}>{money(v.igst)}</Text> : <>
              <Text style={[s.cell, s.bold, s.right, { width: c.tax }]}>{money(v.cgst)}</Text>
              <Text style={[s.cell, s.bold, s.right, { width: c.tax }]}>{money(v.sgst)}</Text></>}
          </View>
        </View>

        {/* totals and amount in words */}
        <View wrap={false}>
          <View style={[s.box, s.row, { borderTopWidth: 0 }]}>
            <View style={{ width: '52%', padding: 4 }}>
              <Text style={s.label}>Invoice Value (In Words)</Text>
              <Text style={[s.bold, { fontSize: 8.5 }]}>{v.amountWords}</Text>
              <Text style={[s.bold, { fontSize: 7, marginTop: 5 }]}>Terms &amp; Conditions of Sale</Text>
              {v.terms.map((t, i) => <Text key={i} style={{ fontSize: 6.4 }}>{i + 1}) {t}</Text>)}
              <Text style={{ fontSize: 6.4 }}>{v.terms.length + 1}) {v.jurisdiction}.</Text>
              <Text style={[s.bold, { fontSize: 7, marginTop: 3 }]}>Declaration</Text>
              <Text style={{ fontSize: 6.4 }}>{v.declaration} E. &amp; O.E.</Text>
            </View>
            <View style={{ width: '48%', borderLeftWidth: BORDER, borderLeftColor: '#000', padding: 4 }}>
              {([['Total Item Value', money(v.itemValue)],
                ...v.charges.map((ch) => [ch.label, money(ch.value)] as [string, string]),
                ['Total Taxable Value', money(v.taxable)],
                ...(v.inter ? [[`Output IGST ${v.rateLabel}`, money(v.igst)]] : [[`Output CGST ${v.rateLabel}`, money(v.cgst)], [`Output SGST ${v.rateLabel}`, money(v.sgst)]]),
                ...(v.roundOff !== 0 ? [['Rounding Off (Sales)', formatINR(v.roundOff, { symbol: false })]] : [])] as [string, string][]).map(([k, val], i) => (
                <View key={i} style={[s.row, { justifyContent: 'space-between', paddingVertical: 1 }]}><Text style={k === 'Total Taxable Value' ? s.bold : {}}>{k}</Text><Text style={k === 'Total Taxable Value' ? s.bold : {}}>{val}</Text></View>
              ))}
              <View style={[s.row, { justifyContent: 'space-between', borderTopWidth: BORDER, borderTopColor: '#000', marginTop: 3, paddingTop: 3 }]}>
                <Text style={[s.bold, { fontSize: 10 }]}>{credit ? 'Credit Total' : 'Invoice Total'}</Text>
                <Text style={[s.bold, { fontSize: 11 }]}>{formatINR(v.grandTotal)}</Text>
              </View>
            </View>
          </View>

          {/* HSN summary */}
          <View style={[s.box, { borderTopWidth: 0 }]}>
            {(() => {
              const cols: [string, number, boolean][] = v.inter
                ? [['HSN / SAC', 90, false], ['Taxable Value', 110, true], ['IGST Rate', 70, true], ['IGST Amount', 110, true], ['Total Tax Amount', 171, true]]
                : [['HSN / SAC', 80, false], ['Taxable Value', 95, true], ['CGST Rate', 55, true], ['CGST Amount', 85, true], ['SGST Rate', 55, true], ['SGST Amount', 85, true], ['Total Tax Amount', 96, true]];
              const cellVals = (h: (typeof v.hsnRows)[number]) => v.inter
                ? [h.hsn, money(h.taxable), `${h.rate}%`, money(h.igst), money(h.totalTax)]
                : [h.hsn, money(h.taxable), `${h.rate / 2}%`, money(h.cgst), `${h.rate / 2}%`, money(h.sgst), money(h.totalTax)];
              const totals = v.inter ? ['Total', money(v.taxable), '', money(v.igst), money(totalTax)] : ['Total', money(v.taxable), '', money(v.cgst), '', money(v.sgst), money(totalTax)];
              return (
                <View>
                  <View style={[s.row, { backgroundColor: '#EDEDED', borderBottomWidth: BORDER, borderBottomColor: '#000' }]}>{cols.map(([h, w, r], i) => <Text key={h} style={[s.cell, s.bold, { width: w, fontSize: 6.8, borderLeftWidth: i ? BORDER : 0 }, r ? s.right : {}]}>{h}</Text>)}</View>
                  {v.hsnRows.map((h) => <View key={`${h.hsn}-${h.rate}`} style={s.row}>{cellVals(h).map((x, i) => <Text key={i} style={[s.cell, { width: cols[i][1], borderLeftWidth: i ? BORDER : 0 }, cols[i][2] ? s.right : {}]}>{x}</Text>)}</View>)}
                  <View style={[s.row, { borderTopWidth: BORDER, borderTopColor: '#000' }]}>{totals.map((x, i) => <Text key={i} style={[s.cell, s.bold, { width: cols[i][1], borderLeftWidth: i ? BORDER : 0 }, cols[i][2] ? s.right : {}]}>{x}</Text>)}</View>
                </View>
              );
            })()}
            <View style={{ padding: 3, borderTopWidth: BORDER, borderTopColor: '#000' }}><Text><Text style={s.label}>Tax Amount (in words) : </Text><Text style={s.bold}>{v.taxWords}</Text></Text></View>
          </View>

        </View>

        {/* terms, bank, signatures */}
        <View wrap={false}>
          <View style={[s.box, s.row, { borderTopWidth: 0 }]}>
            <View style={{ width: '52%', padding: 4 }}>
              <View style={[s.row, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bold, { fontSize: 7 }]}>Company&apos;s Bank Details</Text>
                  {v.bank.name ? <Text>Bank Name : {v.bank.name}</Text> : null}
                  {v.bank.account ? <Text>A/c No. : {v.bank.account}</Text> : null}
                  {v.bank.branch || v.bank.ifsc ? <Text>Branch &amp; IFSC : {[v.bank.branch, v.bank.ifsc].filter(Boolean).join(' & ')}</Text> : null}
                  {v.bank.upi ? <Text>UPI : {v.bank.upi}</Text> : null}
                </View>
                {!credit && qr && balance > 0 ? (
                  <View style={{ alignItems: 'center', width: 62 }}>
                    <Image src={qr} style={{ width: 44, height: 44 }} />
                    <Text style={{ fontSize: 5.4, textAlign: 'center' }}>Scan to pay {formatINR(balance)}{business.settings.demoQrWatermark ? ' · DEMO' : ''}</Text>
                  </View>
                ) : !credit && !draft && balance <= 0 ? <Text style={{ fontSize: 14, fontWeight: 700, color: '#15803D' }}>PAID</Text> : null}
              </View>
            </View>
            <View style={{ width: '48%', borderLeftWidth: BORDER, borderLeftColor: '#000' }}>
              <View style={{ padding: 4, borderBottomWidth: BORDER, borderBottomColor: '#000', alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 6.5 }}>Certified that the particulars given above are true and correct</Text>
                <Text style={[s.bold, { marginTop: 2 }]}>For {v.supplier.name}</Text>
                <View style={{ height: 28, justifyContent: 'center' }}>{business.signatureSvg ? <Vector uri={business.signatureSvg} w={80} h={26} fallback="" /> : null}</View>
                <Text>Authorised Signatory</Text>
                <Text style={s.label}>{business.signatoryName}</Text>
              </View>
              <View style={[s.row, { height: 36 }]}>
                <View style={{ width: '50%', padding: 4 }}><Text style={s.label}>Receiver&apos;s Signature</Text></View>
                <View style={{ width: '50%', padding: 4, borderLeftWidth: BORDER, borderLeftColor: '#000' }}><Text style={s.label}>Stamp</Text></View>
              </View>
            </View>
          </View>
          <Text style={{ textAlign: 'center', fontSize: 6.5, marginTop: 3, color: '#333' }}>This is a Computer Generated Invoice</Text>
        </View>

        <View fixed style={{ position: 'absolute', bottom: MARGIN * 0.55, left: MARGIN, width: W, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 6.5, color: '#555' }}>Powered by BillEase · Neovia AI</Text>
          <Text style={{ fontSize: 6.5, color: '#555' }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
