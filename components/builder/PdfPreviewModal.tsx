'use client';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Business } from '@/lib/domain/entities';
import type { Invoice } from '@/lib/domain/types';
import { buildPdfBlob, downloadPdf } from '@/lib/pdf/client';
import { useApp } from '@/lib/store';
import { Button, Field, Modal } from '../ui';

/** Renders the real vector PDF (the same file you download) in an inline viewer. */
export function PdfPreviewModal({ open, onClose, inv, business, balance }: { open: boolean; onClose: () => void; inv: Invoice; business: Business; balance: number }) {
  const updateBusiness = useApp((s) => s.updateBusiness);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { pdfTemplate, demoQrWatermark } = business.settings;

  useEffect(() => {
    if (!open) return;
    let dead = false;
    let made: string | null = null;
    setErr(null);
    const t = setTimeout(() => {
      buildPdfBlob({ inv, business, balance })
        .then((b) => { if (!dead) { made = URL.createObjectURL(b); setUrl(made); } })
        .catch((e) => !dead && setErr((e as Error).message));
    }, 250); // debounce template/toggle changes
    return () => { dead = true; clearTimeout(t); if (made) URL.revokeObjectURL(made); };
  }, [open, inv, business, balance]);

  const setSetting = (patch: Partial<Business['settings']>) => updateBusiness({ settings: { ...business.settings, ...patch } });

  return (
    <Modal open={open} onClose={onClose} wide title={inv.number ? `PDF: ${inv.number}` : 'PDF preview (draft)'}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => downloadPdf({ inv, business, balance })}><Download size={16} /> Download PDF</Button></>}>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Template">
          <select className="input" value={pdfTemplate} onChange={(e) => setSetting({ pdfTemplate: e.target.value as Business['settings']['pdfTemplate'] })} data-testid="pdf-template">
            {['Classic', 'Modern', 'Minimal'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={demoQrWatermark} onChange={(e) => setSetting({ demoQrWatermark: e.target.checked })} /> Demo watermark under QR</label>
      </div>
      {err ? <p className="text-sm text-overdue">Could not render the PDF: {err}</p>
        : url ? <iframe title="Invoice PDF" src={url} className="h-[70vh] w-full rounded-lg bg-white" data-testid="pdf-frame" />
          : <p className="py-16 text-center text-sm text-mute">Rendering PDF…</p>}
    </Modal>
  );
}
