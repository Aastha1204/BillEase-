import { toPaise } from './money';

/** Minimal RFC-4180 style parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export interface ItemImportRow {
  line: number;
  name: string; hsn: string; unit: string; ratePaise: number; gstRate: number; category: string;
  errors: string[];
}
/** Expected header: name,hsn,unit,rate,gst[,category]. Returns every row with its own errors (preview step). */
export function parseItemCsv(text: string): { rows: ItemImportRow[]; headerError?: string } {
  const data = parseCsv(text);
  if (!data.length) return { rows: [], headerError: 'The file is empty' };
  const head = data[0].map((h) => h.trim().toLowerCase());
  const need = ['name', 'hsn', 'unit', 'rate', 'gst'];
  const miss = need.filter((n) => !head.includes(n));
  if (miss.length) return { rows: [], headerError: `Missing column(s): ${miss.join(', ')}` };
  const ix = (n: string) => head.indexOf(n);
  const rows = data.slice(1).map((r, i): ItemImportRow => {
    const errors: string[] = [];
    const get = (n: string) => (ix(n) >= 0 ? (r[ix(n)] ?? '').trim() : '');
    let ratePaise = 0;
    try { ratePaise = toPaise(get('rate')); } catch { errors.push('Rate is not a valid amount'); }
    if (ratePaise < 0) errors.push('Rate cannot be negative');
    const gstRate = Number(get('gst').replace('%', ''));
    if (!Number.isFinite(gstRate) || ![0, 0.25, 3, 5, 12, 18, 28].includes(gstRate)) errors.push('GST must be 0, 0.25, 3, 5, 12, 18 or 28');
    const hsn = get('hsn').replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(hsn)) errors.push('HSN/SAC must be 4-8 digits');
    if (!get('name')) errors.push('Name is required');
    if (!get('unit')) errors.push('Unit is required');
    return { line: i + 2, name: get('name'), hsn, unit: get('unit'), ratePaise, gstRate, category: get('category') || 'Imported', errors };
  });
  return { rows };
}
