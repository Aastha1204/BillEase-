'use client';
import { Download, Eye, Link2, Lock, Pencil, Receipt, Save, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePresenter } from '@/lib/store/ui';
import { applyCustomer, issueReadiness, recompute, routeLabel } from '@/lib/domain/builder';
import type { Customer } from '@/lib/domain/entities';
import { formatDate, formatINR } from '@/lib/domain/money';
import { addDays, daysBetween, invoiceBalance, remainingQty } from '@/lib/domain/payments';
import { CreditNoteModal } from '../credit/CreditNoteModal';
import { STATE_LIST, stateName } from '@/lib/domain/states';
import type { Invoice, LineInput } from '@/lib/domain/types';
import { todayIso, useApp } from '@/lib/store';
import { Button, Chip, Field, Modal, Toast } from '../ui';
import { ChargesCard } from './ChargesCard';
import { ComplianceCard } from './ComplianceCard';
import { TransportCard } from './TransportCard';
import { CustomerPicker } from './CustomerPicker';
import { InvoicePreview } from './InvoicePreview';
import { LineTable } from './LineTable';
import { RouteChip, TaxFlipCard } from './TaxFlipCard';
import { DeliveryButtons } from '../delivery/DeliveryButtons';
import { InvoiceSidePanel } from '../delivery/InvoiceSidePanel';
import { PaidStamp } from '../delivery/paid';
import { IssueSequence } from './IssueSequence';
import { PdfPreviewModal } from './PdfPreviewModal';
import { useInvoiceActions } from './useInvoiceActions';

export function InvoiceBuilder({ initial }: { initial: Invoice }) {
  const router = useRouter();
  const { business, customers, invoices, payments, creditNotes, saveDraft, issueDraft, discardDraft, log } = useApp();
  const [inv, setInv] = useState<Invoice>(initial);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [cnOpen, setCnOpen] = useState(false);
  const [issued, setIssued] = useState<Invoice | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const locked = !!inv.lockedAt;
  const today = todayIso();
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const lastIssuedDate = useMemo(
    () => invoices.filter((i) => i.lockedAt && i.id !== inv.id).reduce<string | null>((m, i) => (!m || i.date > m ? i.date : m), null),
    [invoices, inv.id],
  );
  const ready = useMemo(() => issueReadiness(inv, business, { today, lastIssuedDate }), [inv, business, today, lastIssuedDate]);
  const route = routeLabel(inv, business);
  const balance = inv.lockedAt ? invoiceBalance(inv, payments, creditNotes) : inv.totals.grandTotal;
  const actions = useInvoiceActions(inv, business, balance, say);
  const paid = locked && balance <= 0;
  const creditable = locked && Object.values(remainingQty(inv, creditNotes)).some((q) => q > 0);
  const paidAtMount = useRef(paid); // the stamp animates only when payment lands during this visit
  const edit = (fn: (i: Invoice) => Invoice) => setInv((p) => (p.lockedAt ? p : recompute(fn(p), business)));

  const pickCustomer = (c: Customer) => setInv((p) => applyCustomer(p, c, business));
  const setLines = (lines: LineInput[]) => edit((p) => ({ ...p, lines }));
  const setDate = (date: string) => edit((p) => ({ ...p, date, dueDate: addDays(date, Math.max(0, daysBetween(p.date, p.dueDate))) }));
  function setPos(code: string) {
    if (code === inv.placeOfSupply) return;
    log('place-of-supply', 'invoice', `${inv.number ?? inv.id}: ${stateName(inv.placeOfSupply)} -> ${stateName(code)} (manual)`);
    edit((p) => ({ ...p, placeOfSupply: code, posManual: true }));
  }
  const shipDiffers = !!inv.shipToStateCode && inv.shipToStateCode !== inv.placeOfSupply;

  function save() {
    try { saveDraft(inv); say('Draft saved'); if (initial.id === inv.id && !invoices.some((i) => i.id === inv.id)) router.replace(`/invoices/${inv.id}`); }
    catch (e) { say((e as Error).message); }
  }
  function discard() {
    if (!confirm_('Discard this draft?')) return;
    try { discardDraft(inv.id); } catch { /* not stored yet */ }
    router.push('/invoices');
  }
  function issue() {
    try {
      saveDraft(inv);
      const out = issueDraft(inv.id);
      setInv(out); // switch this screen to the locked view underneath the overlay
      setIssued(out); // the sequence overlay takes over; it navigates on Done
      setConfirm(false);
    } catch (e) { say((e as Error).message); setConfirm(false); }
  }

  // Presenter Panel commands (step 2: switch customer; step 3: issue, then open the WhatsApp send).
  const cmd = usePresenter((p) => p.cmd);
  const ack = usePresenter((p) => p.ack);
  useEffect(() => {
    if (!cmd || locked) return;
    if (cmd.type === 'select-customer') {
      const c = customers.find((x) => x.name === cmd.name);
      if (c) pickCustomer(c); else say(`Customer "${cmd.name}" not found`);
      ack(cmd.id);
    } else if (cmd.type === 'issue-send') {
      if (!inv.customerId || !inv.lines.length) return; // the demo invoice is still loading
      if (ready.canIssue) { setAutoSend(true); issue(); } else say(`Can't issue yet: ${ready.missing.join('; ')}`);
      ack(cmd.id);
    }
  }, [cmd]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto flex items-center gap-2 text-xl font-bold">
          {locked && <Lock size={18} className="text-gold" aria-label="Locked" />}
          <span className="font-mono">{inv.number ?? 'Draft invoice'}</span>
          {locked ? <Chip tone="gold">Issued · locked</Chip> : <Chip tone="mute">Draft</Chip>}
        </h1>
        <Button onClick={() => setPdfOpen(true)} data-testid="preview-pdf"><Eye size={16} /> Preview PDF</Button>
        {locked && <><Button onClick={actions.download} disabled={actions.busy} data-testid="download-pdf"><Download size={16} /> Download PDF</Button><Button onClick={actions.copyLink} data-testid="copy-link"><Link2 size={16} /> Copy share link</Button><DeliveryButtons inv={inv} business={business} balance={balance} say={say} />
          {creditable && <Button onClick={() => setCnOpen(true)} data-testid="create-cn"><Receipt size={16} /> Create credit note</Button>}</>}
        {locked ? (
          <span title="Issued invoices can't be edited. Create a credit note instead." className="inline-flex">
            <Button disabled><Pencil size={16} /> Edit</Button>
          </span>
        ) : (
          <>
            <Button variant="danger" onClick={discard}><Trash2 size={16} /> Discard</Button>
            <Button onClick={save}><Save size={16} /> Save draft</Button>
            <span title={ready.canIssue ? 'Issue this invoice' : `Can't issue yet:\n• ${ready.missing.join('\n• ')}`} className="inline-flex">
              <Button variant="primary" disabled={!ready.canIssue} onClick={() => setConfirm(true)} data-testid="issue-btn"><Send size={16} /> Issue</Button>
            </span>
          </>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,500px)]">
        <div className="min-w-0 space-y-5">
          <section className="glass space-y-4 rounded-2xl p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer" as="div"><CustomerPicker customerId={inv.customerId} disabled={locked} onPick={pickCustomer} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice date"><input type="date" className="input" value={inv.date} max={today} min={lastIssuedDate ?? undefined} disabled={locked} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
                <Field label="Due date"><input type="date" className="input" value={inv.dueDate} min={inv.date} disabled={locked} onChange={(e) => e.target.value && edit((p) => ({ ...p, dueDate: e.target.value }))} /></Field>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Place of supply">
                <select className="input" value={inv.placeOfSupply} disabled={locked} onChange={(e) => setPos(e.target.value)} data-testid="pos-select">
                  {STATE_LIST.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                </select>
                {inv.posManual && <span className="mt-1 inline-block"><Chip tone="amber">Manually set</Chip></span>}
              </Field>
              <Field label="Reverse charge applicable?">
                <select className="input" value={inv.reverseCharge ? 'yes' : 'no'} disabled={locked} onChange={(e) => edit((p) => ({ ...p, reverseCharge: e.target.value === 'yes' }))}>
                  <option value="no">No</option><option value="yes">Yes</option>
                </select>
              </Field>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-mute">Ship-to differs from the bill-to? {shipDiffers && <Chip tone="info">Ship-to: {stateName(inv.shipToStateCode)}</Chip>}</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Ship-to state">
                  <select className="input" value={inv.shipToStateCode ?? ''} disabled={locked} onChange={(e) => edit((p) => ({ ...p, shipToStateCode: e.target.value || undefined }))}>
                    <option value="">Same as place of supply</option>
                    {STATE_LIST.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                  </select>
                </Field>
                <Field label="Consignee name"><input className="input" value={inv.shipToName ?? ''} disabled={locked} onChange={(e) => edit((p) => ({ ...p, shipToName: e.target.value || undefined }))} data-testid="ship-name" /></Field>
                <Field label="Consignee GSTIN"><input className="input font-mono uppercase" maxLength={15} value={inv.shipToGstin ?? ''} disabled={locked} onChange={(e) => edit((p) => ({ ...p, shipToGstin: e.target.value.toUpperCase() || undefined }))} data-testid="ship-gstin" /></Field>
                <div className="md:col-span-2"><Field label="Delivery address (include PIN code)"><textarea className="input" rows={2} value={inv.shipToAddress ?? ''} disabled={locked} onChange={(e) => edit((p) => ({ ...p, shipToAddress: e.target.value || undefined }))} /></Field></div>
              </div>
            </details>
            {shipDiffers && <p className="rounded-lg bg-info/10 p-2 text-xs text-info">Bill-to/ship-to case — confirm place of supply with your CA.</p>}
            <RouteChip from={route.from} to={route.to} inter={route.inter} />
          </section>

          <LineTable lines={inv.lines} totals={inv.totals} date={inv.date} readOnly={locked} onChange={setLines} />
          <ChargesCard lines={inv.lines} totals={inv.totals} readOnly={locked} onChange={setLines} />
          <TransportCard meta={inv.meta} readOnly={locked} onChange={(meta) => edit((p) => ({ ...p, meta }))} />

          <div className="grid gap-5 lg:grid-cols-2">
            <TaxFlipCard totals={inv.totals} />
            <ComplianceCard r={ready} />
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="mb-2 flex items-center justify-between text-xs text-mute"><span>Live preview (A4)</span><span className="num">Total {formatINR(inv.totals.grandTotal)}</span></div>
          <div className="relative">
            <InvoicePreview inv={inv} business={business} />
            {paid && <PaidStamp fresh={!paidAtMount.current} />}
          </div>
          {locked && <div className="mt-4"><InvoiceSidePanel inv={inv} business={business} balance={balance} /></div>}
        </aside>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Issue this invoice?"
        footer={<><Button onClick={() => setConfirm(false)}>Back</Button><Button variant="primary" onClick={issue} data-testid="confirm-issue"><Send size={16} /> Issue invoice</Button></>}>
        <dl className="space-y-1 text-sm">
          <Row k="Customer" v={inv.customer.name} /><Row k="Date" v={formatDate(inv.date)} /><Row k="Due" v={formatDate(inv.dueDate)} />
          <Row k="Place of supply" v={`${stateName(inv.placeOfSupply)} (${inv.placeOfSupply})`} /><Row k="Tax" v={inv.totals.supply === 'inter' ? 'IGST' : 'CGST + SGST'} />
          <Row k="Grand total" v={formatINR(inv.totals.grandTotal)} strong />
        </dl>
        <p className="rounded-lg bg-amber/10 p-2 text-xs text-amber">Issuing assigns the next invoice number and locks this invoice. Changes after this need a credit note.</p>
      </Modal>
      {locked && <CreditNoteModal open={cnOpen} onClose={() => setCnOpen(false)} inv={inv} onCreated={(cn) => say(`Credit note ${cn.number} created`)} />}
      <PdfPreviewModal open={pdfOpen} onClose={() => setPdfOpen(false)} inv={inv} business={business} balance={balance} />
      {issued && <IssueSequence autoSend={autoSend} inv={issued} business={business} balance={issued.totals.grandTotal} onDone={() => router.push(`/invoices/${issued.id}?issued=1`)} />}
      <Toast msg={toast} />
    </div>
  );
}

const confirm_ = (m: string) => (typeof window === 'undefined' ? false : window.confirm(m));
const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className="flex justify-between"><dt className="text-mute">{k}</dt><dd className={`num ${strong ? 'text-lg font-bold text-gold' : ''}`}>{v}</dd></div>
);
