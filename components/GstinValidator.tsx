'use client';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { validateGstin } from '@/lib/domain/gstin';

function Check1({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1', ok ? 'text-paid' : 'text-overdue')}>
      {ok ? <Check size={13} /> : <X size={13} />}{children}
    </span>
  );
}

/** Live format / checksum / state / PAN readout while typing a GSTIN. */
export function GstinChecks({ value }: { value: string }) {
  if (!value.trim()) return <p className="text-xs text-mute">Enter the 15-character GSTIN.</p>;
  const r = validateGstin(value);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Check1 ok={r.formatOk}>Format</Check1>
        <Check1 ok={r.checksumOk}>Checksum</Check1>
        <Check1 ok={r.stateOk}>State{r.stateOk ? `: ${r.stateName} (${r.stateCode})` : ''}</Check1>
        {r.pan && <span className="font-mono text-mute">PAN: {r.pan}</span>}
      </div>
      <p className="text-mute">
        {r.valid ? 'Format and checksum valid. ' : 'Not a valid GSTIN yet. '}Live GSTN registration lookup is available in production.
      </p>
    </div>
  );
}
