'use client';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Button({ variant = 'ghost', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'btn-primary hover:brightness-105',
        variant === 'ghost' && 'border border-mute/30 hover:bg-mute/10',
        variant === 'danger' && 'border border-overdue/50 text-overdue hover:bg-overdue/10',
        className,
      )}
    />
  );
}

export function Field({ label, hint, error, children, as: Tag = 'label' }: { label: string; hint?: string; error?: string; children: ReactNode; as?: 'label' | 'div' }) {
  return (
    <Tag className="block space-y-1">
      <span className="text-xs font-medium text-mute">{label}</span>
      {children}
      {error ? <span className="block text-xs text-overdue">{error}</span> : hint ? <span className="block text-xs text-mute">{hint}</span> : null}
    </Tag>
  );
}

export function Chip({ tone = 'mute', children }: { tone?: 'mute' | 'paid' | 'overdue' | 'igst' | 'info' | 'amber' | 'gold'; children: ReactNode }) {
  const t = { mute: 'bg-mute/15 text-mute', paid: 'bg-paid/15 text-paid', overdue: 'bg-overdue/15 text-overdue', igst: 'bg-igst/20 text-indigo-300', info: 'bg-info/15 text-info', amber: 'bg-amber/15 text-amber', gold: 'bg-gold/15 text-gold' }[tone];
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEsc(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="glass relative flex h-full w-full max-w-lg flex-col shadow-2xl">
        <div className="flex items-center justify-between border-b border-mute/20 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-mute/15"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-mute/20 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEsc(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={clsx('glass relative flex max-h-[90vh] w-full flex-col rounded-2xl shadow-2xl', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-mute/20 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-mute/15"><X size={18} /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-mute/20 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div role="status" className="glass fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-xl">{msg}</div>;
}
