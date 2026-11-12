'use client';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AuditEntry, Business, Customer, InvoiceEvent, Item, Prospect } from '../domain/entities';
import { withRateChange } from '../domain/entities';
import { assertEditable, issueInvoice, updateInvoice } from '../domain/locking';
import { nextCreditNoteNumber, nextNumber } from '../domain/numbering';
import { CREDIT_REASONS, createCreditNote, validatePayment } from '../domain/payments';
import type { Workspace } from '../domain/ca';
import type { CreditNote, Invoice, Payment } from '../domain/types';
import type { Counters } from '../domain/numbering';
import { generateSeed, type SeedData } from '../seed';
import { generateClientWorkspaces } from '../seed/clients';

export const SCHEMA_VERSION = 3;
export const OWNER_ID = 'biz-sse';
/** Order the businesses appear in the CA view. */
export const WORKSPACE_ORDER = [OWNER_ID, 'biz-aarambh', 'biz-pixelkraft', 'biz-omhardware'];
export const STORAGE_KEY = 'billease-demo';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Top-level fields (business, customers, invoices ...) are always the ACTIVE business. The other linked
 * businesses sit untouched in `others`; switching swaps them atomically, so data never mixes.
 */
export type AppData = SeedData & { activeId: string; others: Record<string, Workspace>; mode: 'owner' | 'ca' };

export interface AppState extends AppData {
  // actions
  upsertCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;
  upsertItem: (i: Item) => void;
  setCaVerified: (id: string, v: boolean) => void;
  changeGstRateFrom: (id: string, effectiveFrom: string, gstRate: number) => void;
  changeRateFrom: (id: string, effectiveFrom: string, ratePaise: number) => void;
  importItems: (items: Item[]) => void;
  /** Every invoice mutation goes through here; a locked invoice throws. */
  patchInvoice: (id: string, patch: Partial<Invoice>) => void;
  addInvoice: (inv: Invoice) => void;
  saveDraft: (inv: Invoice) => void;
  discardDraft: (id: string) => void;
  issueDraft: (id: string) => Invoice;
  addPayment: (p: Payment) => void;
  /** Validates (amount <= balance, dates, method), stores the payment and returns it. Throws on invalid input. */
  recordPayment: (invoiceId: string, input: { amount: number; date: string; method: string; reference?: string }) => Payment;
  addEvent: (invoiceId: string, type: InvoiceEvent['type'], detail?: string, step?: string) => void;
  setProspect: (p: Prospect) => void;
  addCreditNote: (c: CreditNote) => void;
  /** Raises a credit note against an issued invoice (own series, qty limited to what is left to credit). */
  issueCreditNote: (invoiceId: string, input: { reason: string; qtyByLine?: Record<string, number>; date?: string }) => CreditNote;
  enterCa: () => void;
  enterOwner: () => void;
  /** CA view: make a linked client the active business. */
  switchWorkspace: (id: string) => void;
  updateBusiness: (b: Partial<Business>) => void;
  log: (action: string, entity: string, detail: string) => void;
  resetDemo: () => void;
}

/** localStorage wrapper that never throws (private mode, blocked storage, quota). */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const pickWorkspace = (s: Workspace): Workspace => ({
  business: s.business, customers: s.customers, items: s.items, invoices: s.invoices, payments: s.payments,
  creditNotes: s.creditNotes, counters: s.counters, auditLog: s.auditLog, events: s.events,
});

/** The business list in a fixed order, with the active one taken from the top level. */
export function workspacesOf(s: AppData): Workspace[] {
  const all: Record<string, Workspace> = { ...s.others, [s.activeId]: pickWorkspace(s) };
  return WORKSPACE_ORDER.filter((id) => all[id]).map((id) => all[id]);
}

const freshAll = (): AppData => {
  const today = todayIso();
  return { ...generateSeed(today), activeId: OWNER_ID, others: generateClientWorkspaces(today), mode: 'owner' };
};

/** Old/unknown saved data is replaced by a fresh seed rather than risking a broken app. */
export function migrateState(persisted: unknown, version: number): AppData {
  const p = persisted as Partial<AppData> | null;
  const usable = p && Array.isArray(p.invoices) && Array.isArray(p.customers) && Array.isArray(p.items) && p.business;
  if (!usable) return freshAll();
  let s = p as AppData;
  if (version === SCHEMA_VERSION) return s;
  // v1 -> v2 added invoice events and the demo prospect.
  if (version === 1) s = { ...s, events: [], prospect: { name: '', phone: '' } };
  // v2 -> v3 added the linked client businesses and the owner/CA mode; the owner's own data carries over.
  if (version === 1 || version === 2) return { ...s, activeId: s.business.id, others: generateClientWorkspaces(todayIso()), mode: 'owner' };
  return freshAll();
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const initial = (): AppData => freshAll();

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initial(),
      log: (action, entity, detail) =>
        set((s) => ({ auditLog: [{ id: uid('log'), at: new Date().toISOString(), actor: 'Owner', action, entity, detail } as AuditEntry, ...s.auditLog].slice(0, 500) })),
      upsertCustomer: (c) => {
        set((s) => ({ customers: s.customers.some((x) => x.id === c.id) ? s.customers.map((x) => (x.id === c.id ? c : x)) : [...s.customers, c] }));
        get().log('upsert', 'customer', c.name);
      },
      deleteCustomer: (id) => {
        if (get().invoices.some((i) => i.customerId === id)) throw new Error('This customer has invoices and cannot be deleted.');
        set((s) => ({ customers: s.customers.filter((c) => c.id !== id) }));
      },
      upsertItem: (i) => {
        set((s) => ({ items: s.items.some((x) => x.id === i.id) ? s.items.map((x) => (x.id === i.id ? i : x)) : [...s.items, i] }));
        get().log('upsert', 'item', i.name);
      },
      setCaVerified: (id, v) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, caVerified: v } : i)) })),
      changeGstRateFrom: (id, effectiveFrom, gstRate) => {
        set((s) => ({ items: s.items.map((i) => (i.id === id ? withRateChange(i, { effectiveFrom, gstRate }) : i)) }));
        get().log('gst-rate-change', 'item', `${id} -> ${gstRate}% from ${effectiveFrom}`);
      },
      changeRateFrom: (id, effectiveFrom, ratePaise) => {
        set((s) => ({ items: s.items.map((i) => (i.id === id ? withRateChange(i, { effectiveFrom, ratePaise }) : i)) }));
        get().log('rate-change', 'item', `${id} -> ${ratePaise} paise from ${effectiveFrom}`);
      },
      importItems: (items) => {
        set((s) => ({ items: [...s.items, ...items] }));
        get().log('import', 'item', `${items.length} items`);
      },
      patchInvoice: (id, patch) => {
        const inv = get().invoices.find((i) => i.id === id);
        if (!inv) throw new Error(`Invoice ${id} not found`);
        const next = updateInvoice(inv, patch); // throws if locked
        set((s) => ({ invoices: s.invoices.map((i) => (i.id === id ? next : i)) }));
      },
      addInvoice: (inv) => set((s) => ({ invoices: [...s.invoices, inv] })),
      saveDraft: (inv) => {
        const existing = get().invoices.find((i) => i.id === inv.id);
        if (existing) {
          const next = updateInvoice(existing, inv); // throws if the stored invoice is locked
          set((s) => ({ invoices: s.invoices.map((i) => (i.id === inv.id ? next : i)) }));
        } else set((s) => ({ invoices: [...s.invoices, { ...inv, number: null, lockedAt: null }] }));
      },
      discardDraft: (id) => {
        const inv = get().invoices.find((i) => i.id === id);
        if (inv) assertEditable(inv);
        set((s) => ({ invoices: s.invoices.filter((i) => i.id !== id) }));
      },
      /** Assigns the next consecutive number for the invoice date's FY and locks, in one atomic update. */
      issueDraft: (id) => {
        const s = get();
        const inv = s.invoices.find((i) => i.id === id);
        if (!inv) throw new Error(`Invoice ${id} not found`);
        assertEditable(inv);
        const n = nextNumber(s.counters.invoice, s.business.seriesPrefix, inv.date);
        const issued = issueInvoice(inv, n.number, new Date().toISOString());
        set((st) => ({ invoices: st.invoices.map((i) => (i.id === id ? issued : i)), counters: { ...st.counters, invoice: n.counters } }));
        get().log('issue', 'invoice', n.number);
        return issued;
      },
      addPayment: (p) => set((s) => ({ payments: [...s.payments, p] })),
      recordPayment: (invoiceId, input) => {
        const s = get();
        const inv = s.invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
        const err = validatePayment(inv, s.payments, s.creditNotes, input, todayIso());
        if (err) throw new Error(err);
        const p: Payment = { id: uid('pay'), invoiceId, amount: input.amount, method: input.method, date: input.date, reference: input.reference?.trim() || undefined };
        set((st) => ({ payments: [...st.payments, p] }));
        get().log('payment', 'invoice', `${inv.number}: ${input.amount} paise via ${input.method}`);
        return p;
      },
      addEvent: (invoiceId, type, detail, step) =>
        set((s) => ({ events: [...s.events, { id: uid('ev'), invoiceId, at: new Date().toISOString(), type, detail, step }] })),
      setProspect: (prospect) => set(() => ({ prospect })),
      addCreditNote: (c) => set((s) => ({ creditNotes: [...s.creditNotes, c] })),
      issueCreditNote: (invoiceId, input) => {
        const s = get();
        const inv = s.invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
        const date = input.date ?? todayIso();
        if (date > todayIso()) throw new Error('Credit note date cannot be in the future');
        if (date < inv.date) throw new Error('Credit note date is before the invoice date');
        if (!(CREDIT_REASONS as readonly string[]).includes(input.reason)) throw new Error('Choose a reason');
        const prior = s.creditNotes.filter((c) => c.invoiceId === invoiceId);
        const n = nextCreditNoteNumber(s.counters.creditNote, s.business.seriesPrefix, date); // throws if the number would exceed 16 characters
        const cn = createCreditNote(inv, { id: uid('cn'), number: n.number, date, reason: input.reason, qtyByLine: input.qtyByLine, roundOff: s.business.settings.roundOff }, prior);
        set((st) => ({ creditNotes: [...st.creditNotes, cn], counters: { ...st.counters, creditNote: n.counters } }));
        get().log('credit-note', 'invoice', `${n.number} against ${inv.number}`);
        return cn;
      },
      enterCa: () => set({ mode: 'ca' }),
      enterOwner: () => {
        get().switchWorkspace(OWNER_ID);
        set({ mode: 'owner' });
      },
      switchWorkspace: (id) =>
        set((s) => {
          if (id === s.activeId) return {};
          const target = s.others[id];
          if (!target) throw new Error(`Unknown business ${id}`);
          const others = { ...s.others, [s.activeId]: pickWorkspace(s) };
          delete others[id];
          return { ...target, activeId: id, others };
        }),
      updateBusiness: (b) => set((s) => ({ business: { ...s.business, ...b } })),
      resetDemo: () => set((s) => ({ ...freshAll(), mode: s.mode, prospect: s.prospect })), // the prospect and the view mode survive a reset
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true, // hydrated on the client (see useHydrated) to avoid SSR mismatches
      migrate: (persisted, version) => migrateState(persisted, version) as unknown as AppState,
      partialize: (s) => ({
        business: s.business, customers: s.customers, items: s.items, invoices: s.invoices, payments: s.payments,
        creditNotes: s.creditNotes, counters: s.counters, auditLog: s.auditLog, events: s.events, prospect: s.prospect, generatedFor: s.generatedFor, activeId: s.activeId, others: s.others, mode: s.mode,
      }) as unknown as AppState,
    },
  ),
);

export type { Counters };
