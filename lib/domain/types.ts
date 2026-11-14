import type { Paise } from './money';

export type Supply = 'intra' | 'inter';
export type Discount = { kind: 'percent' | 'flat'; value: number }; // flat value in paise

export interface LineInput {
  id: string;
  description: string;
  hsn: string;
  qty: number; // up to 3 decimals
  unit: string;
  ratePaise: Paise;
  discount: Discount;
  gstRate: number; // percent, e.g. 18
  // Optional trade-format details (shown under the description on the invoice).
  partNo?: string;
  grade?: string;
  size?: string;
  batch?: string;
  /** 'charge' = loading, freight, transport etc.; printed in the totals block, taxed like any other line. */
  kind?: 'item' | 'charge';
}

/** Transport and reference details printed in the invoice header grid. All optional. */
export interface InvoiceMeta {
  paymentTerms?: string; // "30 days", "Due on receipt"
  challanNo?: string; challanDate?: string;
  ewayBill?: string; vehicleNo?: string; lrNo?: string; lrDate?: string; transporter?: string;
  brokerName?: string; brokerMobile?: string;
  buyerOrderNo?: string; buyerOrderDate?: string;
  referenceNo?: string; otherReferences?: string;
  dispatchDocNo?: string; dispatchedThrough?: string; destination?: string; termsOfDelivery?: string;
  contactPerson?: string;
}
export interface LineResult {
  gross: Paise; discount: Paise; taxable: Paise;
  cgst: Paise; sgst: Paise; igst: Paise; total: Paise;
  gstRate: number;
}
export interface RateBucket {
  gstRate: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; totalTax: Paise;
}
export interface InvoiceTotals {
  supply: Supply;
  lines: LineResult[];
  taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; totalTax: Paise;
  beforeRound: Paise; roundOff: Paise; grandTotal: Paise;
  byRate: RateBucket[];
}

export interface Party {
  name: string;
  address: string;
  gstin?: string;
  stateCode?: string;
}
export interface Invoice {
  id: string;
  number: string | null; // null while draft
  date: string; // ISO yyyy-mm-dd
  dueDate: string;
  customerId: string;
  customer: Party; // snapshot
  isB2B: boolean;
  placeOfSupply: string; // state code
  shipToStateCode?: string;
  shipToAddress?: string;
  shipToName?: string; // consignee name when different from the buyer
  shipToGstin?: string;
  meta?: InvoiceMeta;
  reverseCharge: boolean;
  lines: LineInput[];
  totals: InvoiceTotals;
  posManual?: boolean; // place of supply was changed by hand
  notes?: string;
  lockedAt: string | null;
  cancelled?: boolean;
}
export interface Payment {
  id: string; invoiceId: string; amount: Paise; method: string; reference?: string; date: string;
}
export interface CreditNote {
  id: string; number: string; date: string; invoiceId: string; invoiceNumber: string; invoiceDate: string;
  reason: string; lines: LineInput[]; totals: InvoiceTotals; isB2B: boolean; placeOfSupply: string;
  customerName: string; customerGstin?: string;
}
