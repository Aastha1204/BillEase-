'use client';
import { useCallback, useState } from 'react';
import { encodeInvoice } from '@/lib/domain/share';
import type { Business } from '@/lib/domain/entities';
import type { Invoice } from '@/lib/domain/types';
import { downloadPdf } from '@/lib/pdf/client';

/** Download the PDF and copy the public share link for an issued invoice. */
export function useInvoiceActions(inv: Invoice, business: Business, balance: number, say: (m: string) => void) {
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    setBusy(true);
    try { await downloadPdf({ inv, business, balance }); say('PDF downloaded'); }
    catch (e) { say(`Could not create the PDF: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }, [inv, business, balance, say]);

  const link = useCallback(() => `${window.location.origin}/i#${encodeInvoice(inv, business, balance)}`, [inv, business, balance]);

  const copyLink = useCallback(async () => {
    const url = link();
    try { await navigator.clipboard.writeText(url); say(`Share link copied (${url.length} characters)`); }
    catch { window.prompt('Copy this share link:', url); }
  }, [link, say]);

  return { download, copyLink, link, busy };
}
