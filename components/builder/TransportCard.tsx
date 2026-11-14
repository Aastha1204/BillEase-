'use client';
import type { InvoiceMeta } from '@/lib/domain/types';

type Field = [keyof InvoiceMeta, string, 'text' | 'date'];
const FIELDS: Field[] = [
  ['paymentTerms', 'Mode / terms of payment', 'text'], ['challanNo', 'Delivery challan no.', 'text'], ['challanDate', 'Challan date', 'date'],
  ['buyerOrderNo', "Buyer's order no.", 'text'], ['buyerOrderDate', 'Order date', 'date'], ['referenceNo', 'Reference no.', 'text'],
  ['otherReferences', 'Other reference(s)', 'text'], ['dispatchDocNo', 'Dispatch doc no.', 'text'], ['dispatchedThrough', 'Dispatched through', 'text'],
  ['destination', 'Destination', 'text'], ['vehicleNo', 'Vehicle no.', 'text'], ['transporter', 'Transporter name', 'text'],
  ['lrNo', 'LR / RR no.', 'text'], ['lrDate', 'LR date', 'date'], ['ewayBill', 'E-way bill no.', 'text'],
  ['brokerName', 'Broker / agent name', 'text'], ['brokerMobile', 'Broker / agent mobile', 'text'], ['termsOfDelivery', 'Terms of delivery', 'text'],
  ['contactPerson', 'Buyer contact person', 'text'],
];

/** Transport and reference details, printed in the header grid of the invoice. Everything is optional. */
export function TransportCard({ meta, readOnly, onChange }: { meta: InvoiceMeta | undefined; readOnly?: boolean; onChange: (m: InvoiceMeta) => void }) {
  const m = meta ?? {};
  const filled = FIELDS.filter(([k]) => m[k]).length;
  return (
    <details className="glass rounded-2xl p-4" data-testid="transport-card" open={filled > 0 && readOnly}>
      <summary className="cursor-pointer text-sm font-semibold">Transport and references <span className="font-normal text-mute">({filled} filled; printed in the invoice header)</span></summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="block text-xs text-mute">{label}
            <input className="input mt-0.5" type={type} value={m[k] ?? ''} disabled={readOnly} onChange={(e) => onChange({ ...m, [k]: e.target.value || undefined })} data-testid={`meta-${k}`} />
          </label>
        ))}
      </div>
    </details>
  );
}
