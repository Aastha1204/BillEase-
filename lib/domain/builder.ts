import type { Business, Customer, Item } from './entities';
import { rateOn } from './entities';
import { stateFromGstin } from './gstin';
import { addDays } from './payments';
import { evaluateCompliance, type Compliance, type Issue } from './rules';
import { stateName } from './states';
import { computeInvoice, supplyType } from './tax';
import type { Invoice, LineInput } from './types';

/** Re-derive supply type and totals from the current lines and place of supply. */
export function recompute(inv: Invoice, business: Business): Invoice {
  const supply = supplyType(inv.placeOfSupply, business.stateCode);
  return { ...inv, totals: computeInvoice(inv.lines, supply, business.settings.roundOff) };
}

export function newDraft(business: Business, today: string, id: string): Invoice {
  return recompute({
    id, number: null, date: today, dueDate: addDays(today, business.settings.defaultTermsDays), customerId: '',
    customer: { name: '', address: '' }, isB2B: true, placeOfSupply: business.stateCode, reverseCharge: false,
    lines: [], totals: computeInvoice([], 'intra', true), lockedAt: null,
  }, business);
}

/** B2B: state from the GSTIN. B2C: the customer's selected state. */
export function defaultPlaceOfSupply(c: Customer, supplierState: string): string {
  if (c.type === 'B2B' && c.gstin) return stateFromGstin(c.gstin) ?? c.stateCode;
  return c.stateCode || supplierState;
}

/** Choosing a customer snapshots their details and resets place of supply and due date. */
export function applyCustomer(inv: Invoice, c: Customer, business: Business): Invoice {
  return recompute({
    ...inv,
    customerId: c.id,
    customer: { name: c.name, address: c.billingAddress, gstin: c.gstin, stateCode: c.stateCode },
    isB2B: c.type === 'B2B',
    placeOfSupply: defaultPlaceOfSupply(c, business.stateCode),
    posManual: false,
    shipToStateCode: undefined,
    shipToAddress: c.shippingAddress && c.shippingAddress !== c.billingAddress ? c.shippingAddress : undefined,
    dueDate: addDays(inv.date, c.termsDays),
  }, business);
}

export function lineFromItem(item: Item, date: string, id: string, qty = 1): LineInput {
  const r = rateOn(item, date);
  return { id, description: item.name, hsn: item.hsn, qty, unit: item.unit, ratePaise: r.ratePaise, discount: { kind: 'percent', value: 0 }, gstRate: r.gstRate };
}

/** The canonical demo invoice (Presenter Panel step 1 and a test fixture). */
export function canonicalDraft(business: Business, customers: Customer[], items: Item[], today: string, id: string): Invoice {
  const patel = customers.find((c) => c.name.startsWith('Patel Interiors'));
  if (!patel) throw new Error('Demo customer not found');
  const spec: [string, number, number][] = [
    ['FR PVC Wire 1.5 sq mm', 10, 5], ['Modular Switch 6A 1-Way', 120, 0], ['MCB 32A Double Pole', 8, 0], ['Solar Street Light 30W', 2, 0],
  ];
  const lines = spec.map(([name, qty, disc], i) => {
    const it = items.find((x) => x.name.startsWith(name));
    if (!it) throw new Error(`Demo item not found: ${name}`);
    return { ...lineFromItem(it, today, `${id}-l${i + 1}`, qty), discount: { kind: 'percent' as const, value: disc } };
  });
  return applyCustomer(recompute({ ...newDraft(business, today, id), lines }, business), patel, business);
}

export interface IssueContext { today: string; lastIssuedDate: string | null }
export interface IssueReadiness { compliance: Compliance; extra: Issue[]; canIssue: boolean; missing: string[] }

/** Rule 46 compliance plus the builder's own blockers (customer chosen, lines present, date window). */
export function issueReadiness(inv: Invoice, business: Business, ctx: IssueContext): IssueReadiness {
  const compliance = evaluateCompliance({
    supplier: { name: business.tradeName, address: `${business.address}, ${business.city} ${business.pincode}`, gstin: business.gstin },
    date: inv.date, isB2B: inv.isB2B, customer: inv.customer, placeOfSupply: inv.placeOfSupply,
    shipToStateCode: inv.shipToStateCode, shipToAddress: inv.shipToAddress, reverseCharge: inv.reverseCharge,
    lines: inv.lines, totals: inv.totals, signatory: business.signatoryName || business.signatureSvg || null,
    b2cThreshold: business.settings.b2cThreshold, b2cBasis: business.settings.b2cBasis,
  });
  const extra: Issue[] = [];
  const add = (id: string, label: string, message: string) => extra.push({ id, label, state: 'fail', blocking: true, message });
  if (!inv.customerId) add('customer', 'Customer selected', 'Choose a customer');
  if (inv.date > ctx.today) add('date-future', 'Invoice date', 'Invoice date cannot be in the future');
  else if (ctx.lastIssuedDate && inv.date < ctx.lastIssuedDate) add('date-order', 'Invoice date', `Date cannot be before the last issued invoice (${ctx.lastIssuedDate}); numbers stay in date order`);
  if (inv.dueDate < inv.date) add('due', 'Due date', 'Due date is before the invoice date');
  const missing = [...compliance.missing, ...extra].map((i) => i.message ?? i.label);
  return { compliance, extra, canIssue: missing.length === 0, missing };
}

export function routeLabel(inv: Pick<Invoice, 'placeOfSupply'>, business: Pick<Business, 'stateCode'>) {
  const from = `${stateName(business.stateCode)} (${business.stateCode})`;
  const to = `${stateName(inv.placeOfSupply)} (${inv.placeOfSupply})`;
  return { from, to, inter: inv.placeOfSupply !== business.stateCode };
}
