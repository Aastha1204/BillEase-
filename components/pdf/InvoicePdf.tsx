import { Document, Font, Image, Page, Path, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { Business } from '@/lib/domain/entities';
import { formatDate, formatINR } from '@/lib/domain/money';
import { stateLabel } from '@/lib/domain/states';
import type { Invoice } from '@/lib/domain/types';
import { amountInWordsINR } from '@/lib/domain/words';

type Template = Business['settings']['pdfTemplate'];

/**
 * Registers Noto Sans (Regular/SemiBold/Bold). The built-in PDF fonts have no U+20B9 rupee glyph,
 * so this must run before rendering. `base` is '/fonts' in the browser or an absolute dir in Node.
 */
let registeredBase: string | null = null;
export function registerFonts(base: string) {
  if (registeredBase === base) return;
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: `${base}/NotoSans-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/NotoSans-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/NotoSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]); // no mid-word hyphenation
  registeredBase = base;
}

const MM = 2.8346;
const M = 12 * MM; // 12 mm margins
const CONTENT_W = 595.28 - 2 * M;

const THEMES: Record<Template, { head: string; headFg: string; accent: string; line: string; zebra: string | null; band: string; titleColor: string; rule: number }> = {
  Classic: { head: '#1E293B', headFg: '#FFFFFF', accent: '#1E293B', line: '#CBD5E1', zebra: null, band: '#F1F5F9', titleColor: '#0F172A', rule: 2 },
  Modern: { head: '#F5B544', headFg: '#1A1205', accent: '#E8892B', line: '#E7E2D6', zebra: '#FBF8F1', band: '#FFF6E5', titleColor: '#E8892B', rule: 0 },
  Minimal: { head: '#FFFFFF', headFg: '#475569', accent: '#334155', line: '#E2E8F0', zebra: null, band: '#FFFFFF', titleColor: '#334155', rule: 0.5 },
};

export interface InvoicePdfProps {
  inv: Invoice;
  business: Business;
  template?: Template;
  /** PNG data URL of the UPI QR; omitted when nothing is due. */
  qr?: string | null;
  balance: number;
  kind?: 'invoice' | 'credit';
  /** For credit notes: the invoice being credited. */
  against?: { number: string; date: string };
}

/** Pulls <rect>/<path> shapes out of the app's generated SVG data URIs so they can be drawn as vectors. */
function parseSvg(dataUri: string) {
  if (!dataUri.startsWith('data:image/svg+xml')) return null;
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(',') + 1));
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1];
  if (!vb) return null;
  const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  const fix = (c?: string) => (!c || c === 'none' ? undefined : c.startsWith('url(') ? '#F5B544' : c);
  const shapes: { type: 'rect' | 'path'; tag: string }[] = [];
  for (const m of svg.matchAll(/<(rect|path)\b[^>]*>/g)) shapes.push({ type: m[1] as 'rect' | 'path', tag: m[0] });
  return { vb, shapes, attr, fix };
}

function Vector({ uri, w, h, fallback }: { uri: string; w: number; h: number; fallback: string }): ReactElement {
  if (/^data:image\/(png|jpe?g)/.test(uri)) return <Image src={uri} style={{ width: w, height: h }} />;
  const p = parseSvg(uri);
  if (!p) {
    return (
      <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: '#0B1220', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#F5B544', fontWeight: 700, fontSize: h * 0.34 }}>{fallback}</Text>
      </View>
    );
  }
  return (
    <Svg viewBox={p.vb} style={{ width: w, height: h }}>
      {p.shapes.map((s, i) =>
        s.type === 'rect'
          ? <Rect key={i} x={Number(p.attr(s.tag, 'x') ?? 0)} y={Number(p.attr(s.tag, 'y') ?? 0)} width={Number(p.attr(s.tag, 'width'))} height={Number(p.attr(s.tag, 'height'))}
              rx={Number(p.attr(s.tag, 'rx') ?? 0)} fill={p.fix(p.attr(s.tag, 'fill')) ?? '#000'} />
          : <Path key={i} d={p.attr(s.tag, 'd') ?? ''} fill={p.fix(p.attr(s.tag, 'fill'))} stroke={p.fix(p.attr(s.tag, 'stroke'))} strokeWidth={Number(p.attr(s.tag, 'stroke-width') ?? 1)} />,
      )}
    </Svg>
  );
}

const money = (p: number) => formatINR(p, { symbol: false });

export function InvoicePdf({ inv, business, template, qr, balance, kind = 'invoice', against }: InvoicePdfProps) {
  const tpl = template ?? business.settings.pdfTemplate;
  const th = THEMES[tpl];
  const t = inv.totals;
  const inter = t.supply === 'inter';
  const credit = kind === 'credit';
  const draft = !inv.number;
  const initials = business.tradeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  // Column widths in points; description takes whatever is left so the table always fills the page.
  const fixed = { n: 18, hsn: 38, qty: 30, unit: 30, rate: 48, disc: 40, taxable: 54 };
  const taxW = inter ? 64 : 52;
  const descW = CONTENT_W - Object.values(fixed).reduce((a, b) => a + b, 0) - (inter ? taxW : taxW * 2);

  const s = StyleSheet.create({
    page: { fontFamily: 'NotoSans', fontSize: 8, color: '#0F172A', paddingTop: M + 18, paddingBottom: M + 14, paddingHorizontal: M },
    row: { flexDirection: 'row' },
    small: { fontSize: 7, color: '#64748B' },
    bold: { fontWeight: 700 },
    cell: { paddingVertical: 3, paddingHorizontal: 3 },
    r: { textAlign: 'right' },
  });
  const cols: [string, number, boolean][] = [
    ['#', fixed.n, false], ['Description', descW, false], ['HSN/SAC', fixed.hsn, false], ['Qty', fixed.qty, true], ['Unit', fixed.unit, false],
    ['Rate', fixed.rate, true], ['Discount', fixed.disc, true], ['Taxable', fixed.taxable, true],
    ...(inter ? [['IGST', taxW, true] as [string, number, boolean]] : [['CGST', taxW, true] as [string, number, boolean], ['SGST', taxW, true] as [string, number, boolean]]),
  ];
  const TableHead = () => (
    <View style={[s.row, { backgroundColor: th.head, borderBottomWidth: tpl === 'Minimal' ? 1 : 0, borderBottomColor: th.line }]}>
      {cols.map(([label, w, right]) => <Text key={label} style={[s.cell, { width: w, color: th.headFg, fontWeight: 600 }, right ? s.r : {}]}>{label}</Text>)}
    </View>
  );

  // HSN / rate-wise tax summary.
  const hsnMap = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  inv.lines.forEach((l, i) => {
    const r = t.lines[i];
    const k = `${l.hsn}|${l.gstRate}`;
    const e = hsnMap.get(k) ?? { hsn: l.hsn, rate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += r.taxable; e.cgst += r.cgst; e.sgst += r.sgst; e.igst += r.igst;
    hsnMap.set(k, e);
  });
  const hsnRows = [...hsnMap.values()];
  const title = credit ? 'CREDIT NOTE' : 'TAX INVOICE';
  const numLabel = credit ? 'Credit note no.' : 'Invoice no.';
  const shipState = inv.shipToStateCode ?? inv.placeOfSupply;
  const [bank, acct, ifsc] = [business.bankName, business.bankAccountMasked, business.ifsc];
  const meta: [string, string][] = [
    [numLabel, inv.number ?? 'Draft'],
    [credit ? 'Credit note date' : 'Invoice date', formatDate(inv.date)],
    credit && against ? ['Against invoice', `${against.number} (${formatDate(against.date)})`] : ['Due date', formatDate(inv.dueDate)],
    ['Place of supply', stateLabel(inv.placeOfSupply)],
    ['Reverse charge', inv.reverseCharge ? 'Yes' : 'No'],
  ];

  return (
    <Document title={`${title} ${inv.number ?? 'Draft'}`} author={business.tradeName} creator="BillEase by Neovia AI">
      <Page size="A4" style={s.page}>
        {/* Table header repeated on every page after the first (page margin reserves the space). */}
        <View fixed style={{ position: 'absolute', top: M, left: M, width: CONTENT_W }}
          render={({ pageNumber }) => (pageNumber > 1 ? <TableHead /> : <View />)} />
        {draft && (
          <Text fixed style={{ position: 'absolute', top: 330, left: 70, fontSize: 110, fontWeight: 700, color: '#000000', opacity: 0.05, transform: 'rotate(-30deg)' }}>DRAFT</Text>
        )}

        {tpl === 'Modern' && <View style={{ height: 6, backgroundColor: th.head, marginBottom: 10 }} />}
        <View style={[s.row, { justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: th.rule, borderBottomColor: th.accent }]}>
          <View style={[s.row, { width: '64%' }]}>
            <Vector uri={business.logoSvg} w={46} h={46} fallback={initials} />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: 700 }}>{business.tradeName}</Text>
              <Text style={s.small}>{business.legalName}</Text>
              <Text>{business.address}</Text>
              <Text style={{ fontWeight: 600 }}>GSTIN: {business.gstin}</Text>
              <Text style={s.small}>{[business.phone, business.email].filter(Boolean).join('  |  ')}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 18, fontWeight: 700, color: th.titleColor }}>{title}</Text>
            <Text style={s.small}>{credit ? 'Original for Recipient' : 'Original for Recipient'}</Text>
          </View>
        </View>

        <View style={[s.row, { marginTop: 8, padding: 6, backgroundColor: th.band, borderWidth: tpl === 'Minimal' ? 0.5 : 0, borderColor: th.line }]}>
          {meta.map(([k, v]) => (
            <View key={k} style={{ flex: k === 'Place of supply' || k === 'Against invoice' ? 1.5 : 1 }}>
              <Text style={{ fontSize: 6.5, color: '#64748B', textTransform: 'uppercase' }}>{k}</Text>
              <Text style={{ fontWeight: 600 }}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={[s.row, { marginTop: 8, gap: 8 }]}>
          {[
            ['Bill to', inv.customer.address, stateLabel(inv.customer.stateCode ?? inv.placeOfSupply)],
            ['Ship to', inv.shipToAddress ?? inv.customer.address, stateLabel(shipState)],
          ].map(([label, addr, state]) => (
            <View key={label} style={{ flex: 1, borderWidth: 0.6, borderColor: th.line, padding: 6 }}>
              <Text style={{ fontSize: 6.5, color: '#64748B', textTransform: 'uppercase' }}>{label}</Text>
              <Text style={{ fontWeight: 700 }}>{inv.customer.name}</Text>
              <Text>{addr}</Text>
              {inv.customer.gstin ? <Text>GSTIN: {inv.customer.gstin}</Text> : null}
              <Text>State: {state}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 8 }}>
          <TableHead />
          {inv.lines.map((l, i) => {
            const r = t.lines[i];
            return (
              <View key={l.id} wrap={false} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: th.line, backgroundColor: th.zebra && i % 2 ? th.zebra : undefined }]}>
                <Text style={[s.cell, { width: fixed.n }]}>{i + 1}</Text>
                <Text style={[s.cell, { width: descW }]}>{l.description}</Text>
                <Text style={[s.cell, { width: fixed.hsn }]}>{l.hsn}</Text>
                <Text style={[s.cell, s.r, { width: fixed.qty }]}>{l.qty}</Text>
                <Text style={[s.cell, { width: fixed.unit }]}>{l.unit}</Text>
                <Text style={[s.cell, s.r, { width: fixed.rate }]}>{money(l.ratePaise)}</Text>
                <Text style={[s.cell, s.r, { width: fixed.disc }]}>{r.discount ? money(r.discount) : '-'}</Text>
                <Text style={[s.cell, s.r, { width: fixed.taxable }]}>{money(r.taxable)}</Text>
                {inter ? (
                  <Text style={[s.cell, s.r, { width: taxW }]}>{money(r.igst)}{'\n'}<Text style={s.small}>{l.gstRate}%</Text></Text>
                ) : (
                  <>
                    <Text style={[s.cell, s.r, { width: taxW }]}>{money(r.cgst)}{'\n'}<Text style={s.small}>{l.gstRate / 2}%</Text></Text>
                    <Text style={[s.cell, s.r, { width: taxW }]}>{money(r.sgst)}{'\n'}<Text style={s.small}>{l.gstRate / 2}%</Text></Text>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {/* Summary + totals + bottom band stay together on one page. */}
        <View wrap={false}>
          <View style={[s.row, { marginTop: 10, justifyContent: 'space-between' }]}>
            <View style={{ width: '55%' }}>
              <Text style={[s.bold, { marginBottom: 2 }]}>HSN / rate-wise tax summary</Text>
              <View style={[s.row, { backgroundColor: th.band, borderBottomWidth: 0.5, borderBottomColor: th.line }]}>
                {['HSN/SAC', 'Rate', 'Taxable', inter ? 'IGST' : 'CGST', ...(inter ? [] : ['SGST'])].map((h, i) => (
                  <Text key={h} style={[s.cell, { flex: 1, fontWeight: 600, fontSize: 7 }, i > 0 ? s.r : {}]}>{h}</Text>
                ))}
              </View>
              {hsnRows.map((h) => (
                <View key={`${h.hsn}|${h.rate}`} style={[s.row, { borderBottomWidth: 0.4, borderBottomColor: th.line }]}>
                  <Text style={[s.cell, { flex: 1, fontSize: 7 }]}>{h.hsn}</Text>
                  <Text style={[s.cell, s.r, { flex: 1, fontSize: 7 }]}>{h.rate}%</Text>
                  <Text style={[s.cell, s.r, { flex: 1, fontSize: 7 }]}>{money(h.taxable)}</Text>
                  <Text style={[s.cell, s.r, { flex: 1, fontSize: 7 }]}>{money(inter ? h.igst : h.cgst)}</Text>
                  {!inter && <Text style={[s.cell, s.r, { flex: 1, fontSize: 7 }]}>{money(h.sgst)}</Text>}
                </View>
              ))}
            </View>
            <View style={{ width: '38%' }}>
              {([['Taxable value', money(t.taxable)], ...(inter ? [['IGST', money(t.igst)]] : [['CGST', money(t.cgst)], ['SGST', money(t.sgst)]]),
                ...(t.roundOff !== 0 ? [['Round off', formatINR(t.roundOff, { symbol: false })]] : [])] as [string, string][]).map(([k, v]) => (
                <View key={k} style={[s.row, { justifyContent: 'space-between', paddingVertical: 1.5 }]}><Text>{k}</Text><Text>{v}</Text></View>
              ))}
              <View style={[s.row, { justifyContent: 'space-between', borderTopWidth: 1.5, borderTopColor: th.accent, marginTop: 3, paddingTop: 4 }]}>
                <Text style={{ fontSize: 11, fontWeight: 700 }}>{credit ? 'Credit total' : 'Grand total'}</Text>
                <Text style={{ fontSize: 12, fontWeight: 700 }}>{formatINR(t.grandTotal)}</Text>
              </View>
            </View>
          </View>
          <Text style={{ marginTop: 6, padding: 5, backgroundColor: th.band, fontWeight: 600 }}>{amountInWordsINR(t.grandTotal)}</Text>

          <View style={[s.row, { marginTop: 12, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: th.line, justifyContent: 'space-between' }]}>
            <View style={{ width: '33%' }}>
              <Text style={s.bold}>Bank details</Text>
              <Text>{bank}</Text><Text>A/c {acct}</Text><Text>IFSC {ifsc}</Text>
              {business.upiId ? <Text>UPI {business.upiId}</Text> : null}
              <Text style={[s.bold, { marginTop: 6 }]}>Terms</Text>
              <Text style={s.small}>{credit ? 'Credit adjusted against the original invoice.' : `Payment due by ${formatDate(inv.dueDate)}.`}</Text>
              <Text style={s.small}>Subject to local jurisdiction.</Text>
            </View>
            <View style={{ width: '30%', alignItems: 'center' }}>
              {!credit && qr && balance > 0 ? (
                <>
                  <Image src={qr} style={{ width: 85, height: 85 }} />
                  <Text style={[s.small, { textAlign: 'center', marginTop: 2 }]}>Scan to pay {formatINR(balance)} with any UPI app</Text>
                  {business.settings.demoQrWatermark ? <Text style={{ fontSize: 8, fontWeight: 700, color: '#E8892B', marginTop: 1 }}>DEMO</Text> : null}
                </>
              ) : !credit && !draft && balance <= 0 ? <Text style={{ fontSize: 16, fontWeight: 700, color: '#16A34A' }}>PAID</Text> : null}
            </View>
            <View style={{ width: '33%', alignItems: 'flex-end' }}>
              <Text>For {business.tradeName}</Text>
              <View style={{ height: 40, marginVertical: 2, justifyContent: 'center' }}>
                {business.signatureSvg ? <Vector uri={business.signatureSvg} w={100} h={38} fallback="" /> : null}
              </View>
              <Text style={{ borderTopWidth: 0.6, borderTopColor: '#94A3B8', paddingTop: 2 }}>Authorised Signatory</Text>
              <Text style={s.small}>{business.signatoryName}</Text>
            </View>
          </View>
        </View>

        <View fixed style={{ position: 'absolute', bottom: M * 0.55, left: M, width: CONTENT_W, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.small}>Powered by BillEase · Neovia AI</Text>
          <Text style={s.small} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
