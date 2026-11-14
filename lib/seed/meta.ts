import type { InvoiceMeta } from '../domain/types';
import { addDays } from '../domain/payments';
import type { Rng } from './prng';

const TRANSPORTERS = ['Swift Roadlines', 'Shree Ganesh Transport', 'Metro Cargo Carriers', 'Sai Krupa Logistics', 'Western Freight Lines', 'Om Sai Transport'];
const SERIES = ['AB', 'CD', 'EF', 'GH', 'JK'];

/**
 * Fictional transport and reference details for a seeded invoice. Uses its own PRNG so adding these
 * details never changes the numbers, dates or amounts of the main seed.
 */
export function seedMeta(rng: Rng, o: { prefix: string; date: string; termsDays: number; b2b: boolean; destination: string; seq: number; bigOrInter: boolean }): InvoiceMeta {
  const pay = o.termsDays === 0 ? 'Due on receipt' : `${o.termsDays} days`;
  if (!o.b2b) return { paymentTerms: pay, dispatchedThrough: 'Counter sale', destination: o.destination };
  const vehicle = `MH ${String(rng.int(1, 48)).padStart(2, '0')} ${rng.pick(SERIES)} ${rng.int(1000, 9999)}`;
  return {
    paymentTerms: pay,
    challanNo: `${o.prefix}/CH/${String(o.seq).padStart(4, '0')}`, challanDate: o.date,
    buyerOrderNo: `PO-${rng.int(1000, 9999)}`, buyerOrderDate: addDays(o.date, -rng.int(2, 12)),
    referenceNo: `REF-${rng.int(100, 999)}`,
    dispatchDocNo: `DD-${rng.int(100, 999)}`, dispatchedThrough: 'Road', destination: o.destination,
    vehicleNo: vehicle, transporter: rng.pick(TRANSPORTERS), lrNo: `LR-${rng.int(1000, 9999)}`, lrDate: o.date,
    ewayBill: o.bigOrInter ? String(rng.int(381000000000, 381999999999)) : undefined,
    termsOfDelivery: 'Ex-works, freight to pay',
  };
}
