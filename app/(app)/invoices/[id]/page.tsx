'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { InvoiceBuilder } from '@/components/builder/InvoiceBuilder';
import { useApp } from '@/lib/store';

function Detail() {
  const { id } = useParams<{ id: string }>();
  const inv = useApp((s) => s.invoices.find((i) => i.id === id));
  const issued = useSearchParams().get('issued') === '1';
  if (!inv) return <p className="text-sm text-mute">Invoice not found. <Link href="/invoices" className="text-gold underline">Back to invoices</Link></p>;
  return (
    <>
      {issued && <p className="mb-4 rounded-lg bg-paid/10 p-3 text-sm text-paid">Invoice {inv.number} issued and locked. Download the PDF or copy the share link from the buttons above.</p>}
      {/* key: only a different invoice id remounts the builder with fresh state */}
      <InvoiceBuilder key={inv.id} initial={inv} />
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Detail /></Suspense>;
}
