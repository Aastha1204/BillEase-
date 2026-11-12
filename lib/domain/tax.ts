import { divRound, roundToRupee } from './money';
import type { InvoiceTotals, LineInput, LineResult, RateBucket, Supply } from './types';

/** intra if place of supply equals the supplier's state, else inter. */
export function supplyType(placeOfSupply: string, supplierState: string): Supply {
  return placeOfSupply === supplierState ? 'intra' : 'inter';
}

/**
 * One line. Every step rounds half-up to paise:
 *   gross = qty x rate; discount = gross x disc% (or flat); taxable = gross - discount
 *   intra: cgst = round(taxable x rate/2 /100), sgst = cgst   (never a remainder)
 *   inter: igst = round(taxable x rate /100)
 * qty is held in thousandths and percentages in basis points so all math is integer.
 */
export function computeLine(l: LineInput, supply: Supply): LineResult {
  const qtyMilli = Math.round(l.qty * 1000);
  const gross = divRound(qtyMilli * l.ratePaise, 1000);
  let discount: number;
  if (l.discount.kind === 'percent') {
    discount = divRound(gross * Math.round(l.discount.value * 100), 10000);
  } else {
    discount = Math.min(Math.max(0, Math.round(l.discount.value)), gross);
  }
  const taxable = gross - discount;
  const rateBp = Math.round(l.gstRate * 100);
  let cgst = 0, sgst = 0, igst = 0;
  if (supply === 'intra') {
    cgst = divRound(taxable * rateBp, 20000);
    sgst = cgst;
  } else {
    igst = divRound(taxable * rateBp, 10000);
  }
  return { gross, discount, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst, gstRate: l.gstRate };
}

/** Invoice totals are sums of line values; tax is never recomputed on the total. */
export function computeInvoice(lines: LineInput[], supply: Supply, roundOffEnabled = true): InvoiceTotals {
  const results = lines.map((l) => computeLine(l, supply));
  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => results.reduce((a, r) => a + r[k], 0);
  const taxable = sum('taxable'), cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
  const totalTax = cgst + sgst + igst;
  const beforeRound = taxable + totalTax;
  const grandTotal = roundOffEnabled ? roundToRupee(beforeRound) : beforeRound;
  const buckets = new Map<number, RateBucket>();
  for (const r of results) {
    const b = buckets.get(r.gstRate) ?? { gstRate: r.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    b.taxable += r.taxable; b.cgst += r.cgst; b.sgst += r.sgst; b.igst += r.igst;
    b.totalTax += r.cgst + r.sgst + r.igst;
    buckets.set(r.gstRate, b);
  }
  return {
    supply, lines: results, taxable, cgst, sgst, igst, totalTax,
    beforeRound, roundOff: grandTotal - beforeRound, grandTotal,
    byRate: [...buckets.values()].sort((a, b) => a.gstRate - b.gstRate),
  };
}
