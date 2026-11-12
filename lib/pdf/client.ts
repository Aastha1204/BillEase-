'use client';
import { creditNoteAsInvoice } from '../domain/creditNote';
import type { Business } from '../domain/entities';
import type { CreditNote, Invoice } from '../domain/types';
import { downloadBlob } from '../download';
import { makePdfElement, type PdfArgs } from './element';

/** Browser-only. Loads react-pdf lazily so it never ships with the pages that don't need it. */
export async function buildPdfBlob(a: PdfArgs): Promise<Blob> {
  const { pdf } = await import('@react-pdf/renderer');
  const el = await makePdfElement(a, '/fonts');
  // react-pdf's types want a <Document> element; ours renders one at its root.
  return pdf(el as Parameters<typeof pdf>[0]).toBlob();
}

export const pdfFileName = (inv: { number: string | null }, kind: 'invoice' | 'credit' = 'invoice') =>
  `${(inv.number ?? 'draft').replace(/\//g, '-')}${kind === 'credit' ? '-credit-note' : ''}.pdf`;

export async function downloadPdf(a: PdfArgs) {
  downloadBlob(pdfFileName(a.inv, a.kind), await buildPdfBlob(a));
}

/** Credit note PDF: same layout, titled CREDIT NOTE, quoting the original invoice number and date. */
export async function downloadCreditNotePdf(cn: CreditNote, original: Invoice, business: Business) {
  const inv = creditNoteAsInvoice(cn, original);
  const blob = await buildPdfBlob({ inv, business, balance: 0, kind: 'credit', against: { number: cn.invoiceNumber, date: cn.invoiceDate } });
  downloadBlob(pdfFileName(inv, 'credit'), blob);
}
