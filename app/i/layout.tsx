import type { Metadata } from 'next';

// A shared invoice carries customer data in the URL hash: keep it out of search indexes.
export const metadata: Metadata = {
  title: 'Invoice - BillEase',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PublicInvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
