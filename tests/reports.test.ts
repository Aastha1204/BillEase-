// @vitest-environment node
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { dashboardData } from '@/lib/domain/dashboard';
import { buildCaPack, caPackBuffer, INR_FORMAT, tableCsv } from '@/lib/domain/exports';
import { invoiceBalance, invoiceStatus } from '@/lib/domain/payments';
import { allReconciled, allTables, buildReports, crossCheck, TABS } from '@/lib/domain/reportTables';
import { invoicesForMonth } from '@/lib/domain/reports';
import { generateSeed } from '@/lib/seed';
import { parseCsv } from '@/lib/domain/csv';

const TODAY = '2026-11-12';
const s = generateSeed(TODAY);
const T = s.business.settings.b2clThreshold;
const months = [...new Set([...s.invoices.map((i) => i.date.slice(0, 7)), ...s.creditNotes.map((c) => c.date.slice(0, 7))])].sort();
const input = (ym: string) => ({ invoices: s.invoices, creditNotes: s.creditNotes, ym, b2clThreshold: T });

describe('report tables reconcile to the paisa', () => {
  it('has several months to test', () => expect(months.length).toBeGreaterThanOrEqual(3));
  for (const ym of months) {
    it(`every table and the cross-check pass for ${ym}`, () => {
      const r = buildReports(input(ym));
      const invs = invoicesForMonth(s.invoices, ym);
      for (const t of allTables(r)) expect(t.recon, `${t.title} ${ym}`).toEqual({ ok: true, diffs: [] });
      expect(crossCheck(r, invs, T).ok).toBe(true);
      expect(allReconciled(r, invs, T).ok).toBe(true);
    });
  }
  it('catches a tampered invoice (a failed check must show, never be hidden)', () => {
    const ym = TODAY.slice(0, 7);
    const bad = structuredClone(s.invoices);
    const victim = bad.find((i) => i.date.startsWith(ym) && i.totals.cgst > 0)!;
    victim.totals.cgst += 1;
    const r = buildReports({ ...input(ym), invoices: bad });
    expect(r.sales[0].recon.ok).toBe(false);
    expect(allReconciled(r, invoicesForMonth(bad, ym), T).ok).toBe(false);
  });
});

describe('report contents', () => {
  const ym = TODAY.slice(0, 7);
  const r = buildReports(input(ym));
  const invs = invoicesForMonth(s.invoices, ym);
  it('sales register has one row per invoice and the right totals', () => {
    const t = r.sales[0];
    expect(t.rows).toHaveLength(invs.length);
    const iTotal = t.columns.findIndex((c) => c.key === 'total');
    expect(t.totals![iTotal]).toBe(invs.reduce((a, i) => a + i.totals.grandTotal, 0));
  });
  it('GST by rate lists only rates that appear', () => {
    const rates = new Set(invs.flatMap((i) => i.lines.map((l) => l.gstRate)));
    expect(r['gst-rate'][0].rows.map((x) => x[0])).toEqual([...rates].sort((a, b) => a - b));
  });
  it('HSN is split B2B / B2C and the segments add up to the whole', () => {
    const [b2b, b2c] = r.hsn;
    const k = (t: typeof b2b) => t.totals![t.columns.findIndex((c) => c.key === 'taxable')] as number;
    expect(k(b2b) + k(b2c)).toBe(invs.reduce((a, i) => a + i.totals.taxable, 0));
  });
  it('B2B rows are rate-wise per invoice; B2CS is by place of supply and rate', () => {
    const b2bInvs = invs.filter((i) => i.isB2B);
    expect(r['b2b-b2cl-b2cs'][0].rows).toHaveLength(b2bInvs.reduce((a, i) => a + i.totals.byRate.length, 0));
    expect(r['b2b-b2cl-b2cs'][2].rows.every((x) => typeof x[0] === 'string' && typeof x[1] === 'number')).toBe(true);
  });
  it('docs issued shows one gap-free series for the month', () => {
    expect(r.docs[0].rows[0][3]).toBe(invs.length);
    expect(r.docs[0].recon.ok).toBe(true);
  });
  it('the credit notes tab lists the credit notes dated in the month', () => {
    const total = months.reduce((a, m) => a + buildReports(input(m))['credit-notes'][0].rows.length, 0);
    expect(total).toBe(s.creditNotes.length);
  });
  it('CSV round-trips with headers, rupee decimals and a totals row', () => {
    const csv = parseCsv(tableCsv(r.sales[0]));
    expect(csv[0][0]).toBe('Invoice no.');
    expect(csv).toHaveLength(invs.length + 2);
    expect(csv[csv.length - 1][0]).toBe('Total');
    expect(csv[1][6]).toMatch(/^\d+\.\d{2}$/);
    expect(parseCsv(tableCsv(r['gst-rate'][0])).pop()![0]).toBe('Total');
  });
});

describe('CA pack workbook', () => {
  const ym = TODAY.slice(0, 7);
  const r = buildReports(input(ym));
  const invs = invoicesForMonth(s.invoices, ym);
  const pack = { business: s.business, ym, reports: r, invoices: invs, generatedOn: TODAY };
  it('has a cover plus one sheet per table, styled as specified', async () => {
    const buf = await caPackBuffer(pack);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Cover', 'Sales register', 'GST summary by rate', 'HSN summary (B2B)', 'HSN summary (B2C)', 'B2B invoices', 'B2C large (B2CL)', 'B2C small (B2CS)', 'Credit notes register', 'Documents issued']);
    const ws = wb.getWorksheet('Sales register')!;
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getColumn(3).width).toBeGreaterThan(20);
    // ExcelJS strips the backslashes when reading back, so check the raw file: Indian grouping must be stored escaped.
    const styles = await (await JSZip.loadAsync(buf)).file('xl/styles.xml')!.async('string');
    expect(styles).toContain('formatCode="' + INR_FORMAT.replace('>=', '&gt;=').replace('>=', '&gt;=') + '"');
    expect(INR_FORMAT.includes('\\,')).toBe(true); // literal commas, so digits group as 12,34,567.00
    expect(ws.getCell('G2').numFmt).toContain('[>=100000]');
    expect(ws.getCell('B2').numFmt).toBe('dd-mmm-yyyy');
    const first = invs.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? '').localeCompare(b.number ?? ''))[0];
    expect(ws.getCell('A2').value).toBe(first.number);
    expect(ws.getCell('G2').value).toBeCloseTo(first.totals.taxable / 100, 2);
    const last = ws.getRow(invs.length + 2);
    expect(last.getCell(1).value).toBe('Total');
    expect(last.font?.bold).toBe(true);
  });
  it('cover states the business, period and reconciliation', async () => {
    const wb = await buildCaPack(pack);
    const c = wb.getWorksheet('Cover')!;
    const text = (c.getSheetValues() as unknown[]).flat().filter(Boolean).join(' | ');
    expect(text).toContain('27ABJFS4821K1ZT');
    expect(text).toContain('November 2026');
    expect(text).toContain('Totals reconcile with invoice lines ✓');
    expect(text).toContain('12-Nov-2026');
  });
  it('every sheet carries its own reconciliation line', async () => {
    const wb = await buildCaPack(pack);
    for (const w of wb.worksheets.slice(1)) {
      const lines = (w.getSheetValues() as unknown[]).flat().filter((v) => typeof v === 'string') as string[];
      expect(lines.some((l) => l.startsWith('Totals reconcile with invoice lines')), w.name).toBe(true);
    }
  });
  it('a failed reconciliation is written in red on the cover, not hidden', async () => {
    const bad = structuredClone(s.invoices);
    bad.find((i) => i.date.startsWith(ym) && i.totals.cgst > 0)!.totals.cgst += 1;
    const rr = buildReports({ ...input(ym), invoices: bad });
    const wb = await buildCaPack({ ...pack, reports: rr, invoices: invoicesForMonth(bad, ym) });
    const cell = wb.getWorksheet('Cover')!.getRow(9).getCell(2);
    expect(String(cell.value)).toMatch(/FAILED/);
    expect(cell.font?.color?.argb).toBe('FFDC2626');
  });
});

describe('dashboard data', () => {
  const d = dashboardData(s.invoices, s.payments, s.creditNotes, TODAY);
  it('receivables equal the sum of balances and ageing adds up to it', () => {
    const rec = s.invoices.reduce((a, i) => a + Math.max(0, invoiceBalance(i, s.payments, s.creditNotes)), 0);
    expect(d.receivables).toBe(rec);
    expect(d.ageing.reduce((a, b) => a + b.amount, 0)).toBe(rec);
    expect(d.ageing.map((b) => b.label)).toEqual(['0–15 days', '16–30 days', '31–60 days', '60+ days']);
  });
  it('overdue matches the status computation', () => {
    const od = s.invoices.filter((i) => invoiceStatus(i, s.payments, s.creditNotes, TODAY) === 'Overdue');
    expect(d.overdue.count).toBe(od.length);
    expect(d.overdue.amount).toBe(od.reduce((a, i) => a + invoiceBalance(i, s.payments, s.creditNotes), 0));
  });
  it('month sales and output GST are net of that month credit notes', () => {
    const ym = TODAY.slice(0, 7);
    const inv = invoicesForMonth(s.invoices, ym);
    const cn = s.creditNotes.filter((c) => c.date.startsWith(ym));
    expect(d.month.sales).toBe(inv.reduce((a, i) => a + i.totals.grandTotal, 0) - cn.reduce((a, c) => a + c.totals.grandTotal, 0));
    expect(d.month.outputGst).toBe(inv.reduce((a, i) => a + i.totals.totalTax, 0) - cn.reduce((a, c) => a + c.totals.totalTax, 0));
    expect(d.month.invoices).toBe(inv.length);
  });
  it('trend is 90 consecutive days ending today and sums to the 90-day sales', () => {
    expect(d.trend).toHaveLength(90);
    expect(d.trend[89].date).toBe(TODAY);
    expect(d.trend.reduce((a, p) => a + p.sales, 0)).toBe(s.invoices.reduce((a, i) => a + i.totals.grandTotal, 0));
    expect(d.gstByRate.reduce((a, g) => a + g.tax, 0)).toBe(s.invoices.reduce((a, i) => a + i.totals.totalTax, 0));
  });
  it('recent and top customers are ordered', () => {
    expect(d.recent).toHaveLength(6);
    expect(d.recent[0].date >= d.recent[5].date).toBe(true);
    expect(d.topCustomers.map((c) => c.total)).toEqual([...d.topCustomers.map((c) => c.total)].sort((a, b) => b - a));
  });
  it('TABS has the six specified tabs', () => expect(TABS.map((t) => t.label)).toEqual(['Sales register', 'GST by rate', 'HSN summary', 'B2B / B2CL / B2CS', 'Credit notes', 'Documents issued']));
});
