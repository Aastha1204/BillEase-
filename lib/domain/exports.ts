import ExcelJS from 'exceljs';
import type { Business } from './entities';
import { toCsv } from './csv';
import { formatDate } from './money';
import { stateLabel } from './states';
import { allReconciled, allTables, tableToCsvRows, type Recon, type ReportTable, type TabId } from './reportTables';
import type { Invoice } from './types';

/** Indian digit grouping (1,25,000.00) as an Excel number format; the last section handles small and negative numbers. */
export const INR_FORMAT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';

export const tableCsv = (t: ReportTable) => toCsv(tableToCsvRows(t));

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

export interface PackInput {
  business: Business;
  ym: string;
  reports: Record<TabId, ReportTable[]>;
  invoices: Invoice[]; // month's issued invoices, for the cross-check
  generatedOn: string; // ISO date
}

/**
 * One workbook for the CA: a cover sheet plus one styled sheet per report table
 * (bold header, frozen top row, en-IN number format, column widths set).
 */
export async function buildCaPack(inp: PackInput): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BillEase by Neovia AI';
  wb.created = new Date(`${inp.generatedOn}T00:00:00.000Z`);
  const tables = allTables(inp.reports);
  const recon: Recon = allReconciled(inp.reports, inp.invoices, inp.business.settings.b2clThreshold);

  const cover = wb.addWorksheet('Cover');
  cover.columns = [{ width: 26 }, { width: 70 }];
  const rows: [string, string][] = [
    ['BillEase · CA pack', ''],
    ['Business', inp.business.legalName],
    ['Trade name', inp.business.tradeName],
    ['GSTIN', inp.business.gstin],
    ['State', stateLabel(inp.business.stateCode)],
    ['Period', monthLabel(inp.ym)],
    ['Invoices in period', String(inp.invoices.length)],
    ['Generated on', formatDate(inp.generatedOn)],
    ['Reconciliation', recon.ok ? 'Totals reconcile with invoice lines ✓' : `FAILED: ${recon.diffs.join('; ')}`],
    ['', ''],
    ['Note', 'BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA. Demo data.'],
  ];
  rows.forEach((r, i) => {
    const row = cover.addRow(r);
    if (i === 0) { row.font = { bold: true, size: 14 }; }
    else row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  const rc = cover.getRow(9).getCell(2);
  rc.font = { bold: true, color: { argb: recon.ok ? 'FF15803D' : 'FFDC2626' } };
  cover.getRow(11).height = 48;

  const used = new Set<string>(['Cover']);
  for (const t of tables) {
    let name = sheetName(t.title);
    for (let n = 2; used.has(name); n++) name = sheetName(`${t.title} ${n}`);
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = t.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 22;

    const fmt = (v: unknown, type: string) => {
      if (v === null || v === undefined || v === '') return null;
      if (type === 'money') return (v as number) / 100; // paise -> rupees, exact for 2 decimals
      if (type === 'date' && typeof v === 'string') { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
      if (type === 'rate' && typeof v === 'number') return v / 100;
      return v as string | number;
    };
    const apply = (row: ExcelJS.Row) => t.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.type === 'money') cell.numFmt = INR_FORMAT;
      else if (c.type === 'date') cell.numFmt = 'dd-mmm-yyyy';
      else if (c.type === 'rate') cell.numFmt = '0.##%';
      else if (c.type === 'qty') cell.numFmt = '#,##0.###';
      else if (c.type === 'int') cell.numFmt = '#,##0';
      if (c.type !== 'text') cell.alignment = { horizontal: 'right' };
    });
    for (const r of t.rows) apply(ws.addRow(r.map((v, i) => fmt(v, t.columns[i].type))));
    if (t.totals && t.rows.length) {
      const tr = ws.addRow(t.totals.map((v, i) => (v === null ? null : typeof v === 'string' ? v : fmt(v, t.columns[i].type))));
      apply(tr);
      tr.font = { bold: true };
      tr.border = { top: { style: 'thin' } };
    }
    ws.addRow([]);
    const foot = ws.addRow([t.recon.ok ? 'Totals reconcile with invoice lines ✓' : `Reconciliation FAILED: ${t.recon.diffs.join('; ')}`]);
    foot.font = { italic: true, color: { argb: t.recon.ok ? 'FF15803D' : 'FFDC2626' } };
    if (t.note) ws.addRow([t.note]).font = { italic: true, color: { argb: 'FF64748B' } };
  }
  return wb;
}

export async function caPackBuffer(inp: PackInput): Promise<ArrayBuffer> {
  const wb = await buildCaPack(inp);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export const caPackFileName = (b: Business, ym: string) => `${b.tradeName.replace(/[^A-Za-z0-9]+/g, '-')}-CA-pack-${ym}.xlsx`;
