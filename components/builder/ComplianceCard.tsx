'use client';
import clsx from 'clsx';
import { AlertTriangle, Check, Circle, Minus } from 'lucide-react';
import type { IssueReadiness } from '@/lib/domain/builder';
import { Chip } from '../ui';

const ICON = { pass: Check, fail: Circle, warn: AlertTriangle, na: Minus } as const;
const TONE = { pass: 'text-paid', fail: 'text-mute', warn: 'text-amber', na: 'text-mute/60' } as const;

export function ComplianceCard({ r }: { r: IssueReadiness }) {
  const { items, passed, total } = r.compliance;
  const all = passed === total && r.extra.length === 0;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rule 46 checklist</h3>
        <span data-testid="compliance-chip"><Chip tone={all ? 'paid' : 'amber'}>Compliance {passed}/{total}</Chip></span>
      </div>
      <ul className="space-y-1">
        {items.map((it) => {
          const Icon = ICON[it.state];
          return (
            <li key={it.id} className="flex items-start gap-2 text-xs" data-state={it.state}>
              <Icon size={14} className={clsx('mt-0.5 shrink-0', TONE[it.state])} />
              <span className={clsx(it.state === 'na' && 'text-mute/70')}>
                {it.label}{it.state === 'na' && ' (N/A)'}
                {(it.state === 'fail' || it.state === 'warn') && it.message && <span className="block text-mute">{it.message}</span>}
              </span>
            </li>
          );
        })}
        {r.extra.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-xs" data-state="fail">
            <Circle size={14} className="mt-0.5 shrink-0 text-overdue" /><span>{it.label}<span className="block text-mute">{it.message}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-mute">BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA.</p>
    </div>
  );
}
