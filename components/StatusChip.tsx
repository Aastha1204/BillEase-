import { Chip } from './ui';
import type { InvoiceStatus } from '@/lib/domain/payments';

const TONE: Record<InvoiceStatus, 'mute' | 'info' | 'paid' | 'overdue' | 'amber'> = { Draft: 'mute', Unpaid: 'info', 'Partly paid': 'amber', Paid: 'paid', Overdue: 'overdue' };

export function StatusChip({ status }: { status: InvoiceStatus }) {
  return <Chip tone={TONE[status]}>{status}</Chip>;
}
