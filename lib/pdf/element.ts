import QRCode from 'qrcode';
import { createElement } from 'react';
import type { Business } from '../domain/entities';
import type { Invoice } from '../domain/types';
import { buildUpiUri } from '../domain/upi';
import { demoEInvoice } from '../domain/standardView';

export interface PdfArgs {
  inv: Invoice;
  business: Business;
  /** Balance due in paise; the UPI QR is for this amount. */
  balance: number;
  template?: Business['settings']['pdfTemplate'];
  kind?: 'invoice' | 'credit';
  against?: { number: string; date: string };
}

export function upiUriFor(inv: Invoice, business: Business, balance: number) {
  return buildUpiUri({ vpa: business.upiId, payeeName: business.tradeName, amount: balance, note: inv.number ?? '' });
}

/** Builds the react-pdf element (with the QR as a PNG data URL). Works in the browser and in Node. */
export async function makePdfElement(a: PdfArgs, fontBase: string) {
  const { InvoicePdf, registerFonts } = await import('@/components/pdf/InvoicePdf');
  registerFonts(fontBase);
  const wantQr = a.kind !== 'credit' && !!a.inv.number && a.balance > 0 && !!a.business.upiId;
  const qr = wantQr ? await QRCode.toDataURL(upiUriFor(a.inv, a.business, a.balance), { margin: 1, width: 360, errorCorrectionLevel: 'M' }) : null;
  const eInv = a.business.eInvoice && a.inv.number && a.inv.isB2B ? demoEInvoice(a.inv, a.business.gstin) : null;
  const eInvQr = eInv ? await QRCode.toDataURL('DEMO-IRN:' + eInv.irn, { margin: 1, width: 240 }) : null;
  return createElement(InvoicePdf, { inv: a.inv, business: a.business, template: a.template, qr, balance: a.balance, kind: a.kind, against: a.against, eInvQr });
}
