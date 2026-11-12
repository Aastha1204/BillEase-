import { canonicalDraft } from './domain/builder';
import type { Business } from './domain/entities';
import { issueInvoice } from './domain/locking';
import type { Invoice } from './domain/types';
import { generateSeed } from './seed';

export interface HeroData { business: Business; inv: Invoice; upiUri: string }

/**
 * The landing hero draws the REAL canonical demo invoice (Patel Interiors, 41,868.00), built by the same
 * domain code as the app. Independent of what is saved in the browser.
 */
export function heroData(today: string): HeroData {
  const s = generateSeed(today);
  const draft = canonicalDraft(s.business, s.customers, s.items, today, 'hero');
  const inv = issueInvoice(draft, 'SSE/26-27/0418', `${today}T10:00:00.000Z`);
  const q = new URLSearchParams({ pa: s.business.upiId, pn: s.business.tradeName, am: '41868.00', cu: 'INR', tn: inv.number! });
  return { business: s.business, inv, upiUri: `upi://pay?${q.toString()}` };
}
