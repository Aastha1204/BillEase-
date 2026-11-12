'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { InvoiceBuilder } from '@/components/builder/InvoiceBuilder';
import { canonicalDraft, newDraft } from '@/lib/domain/builder';
import { todayIso, useApp } from '@/lib/store';

function NewInvoice() {
  const params = useSearchParams();
  const { business, customers, items } = useApp();
  const [initial] = useState(() => {
    const id = `inv-d-${Date.now().toString(36)}`;
    // ?demo=canonical pre-fills the 3-minute demo invoice (Presenter Panel step 1).
    if (params.get('demo') === 'canonical') return canonicalDraft(business, customers, items, todayIso(), id);
    return newDraft(business, todayIso(), id);
  });
  return <InvoiceBuilder initial={initial} />;
}

export default function Page() {
  return <Suspense fallback={null}><NewInvoice /></Suspense>;
}
