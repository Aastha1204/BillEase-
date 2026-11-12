'use client';
import { Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CustomerDrawer } from '@/components/CustomerDrawer';
import { Button, Chip, Toast } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import type { Customer } from '@/lib/domain/entities';
import { stateName } from '@/lib/domain/states';
import { useApp } from '@/lib/store';
import { downloadText } from '@/lib/download';

export default function CustomersPage() {
  const customers = useApp((s) => s.customers);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'B2B' | 'B2C'>('all');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers.filter((c) => (type === 'all' || c.type === type) &&
      (!t || [c.name, c.gstin ?? '', c.city, c.phone].some((x) => x.toLowerCase().includes(t))));
  }, [customers, q, type]);

  const exportCsv = () => downloadText('customers.csv', toCsv([
    ['Name', 'Type', 'GSTIN', 'State', 'City', 'Billing address', 'Phone', 'Email', 'Terms (days)'],
    ...rows.map((c) => [c.name, c.type, c.gstin ?? '', stateName(c.stateCode), c.city, c.billingAddress, c.phone, c.email, c.termsDays]),
  ]), 'text/csv');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Customers <span className="num text-sm font-normal text-mute">({rows.length})</span></h1>
        <Button onClick={exportCsv}><Download size={16} /> CSV</Button>
        <Button variant="primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={16} /> Add customer</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Search name, GSTIN, city, phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Filter by type">
          <option value="all">All types</option><option value="B2B">B2B</option><option value="B2C">B2C</option>
        </select>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-mute"><tr>
            {['Customer', 'Type', 'GSTIN', 'Location', 'Terms', 'Phone'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => { setEditing(c); setOpen(true); }} tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && (setEditing(c), setOpen(true))}
                className="cursor-pointer border-t border-mute/15 hover:bg-mute/10 focus:bg-mute/10 focus:outline-none">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3"><Chip tone={c.type === 'B2B' ? 'info' : 'mute'}>{c.type}</Chip></td>
                <td className="px-4 py-3 font-mono text-xs">{c.gstin ?? '—'}</td>
                <td className="px-4 py-3">{c.city}, {stateName(c.stateCode)}{c.stateCode !== '27' && <span className="ml-2"><Chip tone="igst">Inter-state</Chip></span>}</td>
                <td className="num px-4 py-3">{c.termsDays === 0 ? 'Due on receipt' : `${c.termsDays} days`}</td>
                <td className="num px-4 py-3">{c.phone}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-mute">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>
      <CustomerDrawer customer={editing} open={open} onClose={() => setOpen(false)} onSaved={say} />
      <Toast msg={toast} />
    </div>
  );
}
