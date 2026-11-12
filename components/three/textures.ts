import QRCode from 'qrcode';
import type { HeroData } from '@/lib/heroData';
import { formatDate, formatINR } from '@/lib/domain/money';

const PX = 2; // draw at 2x for crisp text when the card is large

/** Paints a mini version of the real invoice onto a canvas (used as a texture on the front card). */
export function drawMiniInvoice(canvas: HTMLCanvasElement, { business: b, inv }: HeroData) {
  const W = 300, H = 410;
  canvas.width = W * PX; canvas.height = H * PX;
  const c = canvas.getContext('2d')!;
  c.scale(PX, PX);
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  const t = inv.totals;
  const txt = (s: string, x: number, y: number, size = 9, weight = 400, color = '#0f172a', align: CanvasTextAlign = 'left') => {
    c.font = `${weight} ${size}px "Plus Jakarta Sans", "Noto Sans", Arial, sans-serif`; c.fillStyle = color; c.textAlign = align; c.fillText(s, x, y);
  };
  // header
  c.fillStyle = '#0B1220'; c.fillRect(0, 0, W, 54);
  c.fillStyle = '#F5B544'; c.beginPath(); c.moveTo(30, 12); c.lineTo(20, 31); c.lineTo(28, 31); c.lineTo(24, 44); c.lineTo(38, 25); c.lineTo(30, 25); c.closePath(); c.fill();
  txt(b.tradeName, 48, 26, 11, 700, '#ffffff');
  txt(`GSTIN ${b.gstin}`, 48, 40, 7, 400, '#94A0B8');
  txt('TAX INVOICE', W - 14, 30, 11, 800, '#F5B544', 'right');
  // meta
  txt(`${inv.number}`, 14, 74, 8, 700); txt(formatDate(inv.date), W - 14, 74, 8, 400, '#475569', 'right');
  txt(`Bill to: ${inv.customer.name}`, 14, 90, 8, 600);
  txt(`Place of supply: Maharashtra (27)`, 14, 102, 7, 400, '#64748b');
  // table
  let y = 120;
  c.fillStyle = '#1E293B'; c.fillRect(10, y - 10, W - 20, 15);
  txt('Item', 14, y, 7, 700, '#fff'); txt('Qty', 168, y, 7, 700, '#fff', 'right'); txt('Taxable', 222, y, 7, 700, '#fff', 'right'); txt('Total', W - 14, y, 7, 700, '#fff', 'right');
  y += 17;
  inv.lines.forEach((l, i) => {
    const r = t.lines[i];
    txt(l.description.length > 30 ? `${l.description.slice(0, 29)}…` : l.description, 14, y, 7.5, 400);
    txt(String(l.qty), 168, y, 7.5, 400, '#0f172a', 'right'); txt(formatINR(r.taxable, { symbol: false }), 222, y, 7.5, 400, '#0f172a', 'right'); txt(formatINR(r.total, { symbol: false }), W - 14, y, 7.5, 400, '#0f172a', 'right');
    c.fillStyle = '#e2e8f0'; c.fillRect(10, y + 5, W - 20, 0.6);
    y += 17;
  });
  // totals
  y += 8;
  const row = (k: string, v: string, bold = false) => { txt(k, 150, y, bold ? 10 : 8, bold ? 800 : 400); txt(v, W - 14, y, bold ? 11 : 8, bold ? 800 : 400, '#0f172a', 'right'); y += bold ? 18 : 13; };
  row('Taxable value', formatINR(t.taxable));
  row('CGST', formatINR(t.cgst)); row('SGST', formatINR(t.sgst)); row('Round off', formatINR(t.roundOff));
  c.fillStyle = '#0f172a'; c.fillRect(146, y - 8, W - 160, 1.5); y += 6;
  row('Grand total', formatINR(t.grandTotal), true);
  txt('Rupees Forty-One Thousand Eight Hundred', 14, H - 40, 7, 600, '#334155'); txt('Sixty-Eight Only', 14, H - 30, 7, 600, '#334155');
  txt('Powered by BillEase · Neovia AI', W / 2, H - 10, 6.5, 400, '#94a3b8', 'center');
}

export function drawRupeeCoin(canvas: HTMLCanvasElement) {
  const S = 256; canvas.width = S; canvas.height = S;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#FFD98A'); g.addColorStop(1, '#E8A33A');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(120,70,0,.55)'; c.lineWidth = 8; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#7A4A00'; c.font = '700 150px "Noto Sans", "Plus Jakarta Sans", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('₹', S / 2, S / 2 + 8);
}

/** A real, scannable QR of the canonical UPI link, drawn module by module. */
export function drawQr(canvas: HTMLCanvasElement, text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, cell = 8, pad = 16, S = n * cell + pad * 2;
  canvas.width = S; canvas.height = S;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, S, S); c.fillStyle = '#0B1220';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) c.fillRect(pad + x * cell, pad + y * cell, cell, cell);
}

/** WebGL probe (also false when the browser blocks it). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
