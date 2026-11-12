'use client';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { formatINR } from '@/lib/domain/money';
import { useApp } from '@/lib/store';
import { usePresenter, useUi } from '@/lib/store/ui';

/** Ctrl/Cmd+K: jump to any screen, invoice, customer or item, or run a common action. */
export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, setPanelOpen } = usePresenter();
  const { invoices, customers, items, mode } = useApp();
  const theme = useUi((u) => u.theme);
  const setUi = useUi((u) => u.set);

  useEffect(() => {
    if (!paletteOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPaletteOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [paletteOpen, setPaletteOpen]);
  if (!paletteOpen) return null;

  const go = (href: string) => { setPaletteOpen(false); router.push(href); };
  const item = 'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-gold/15';
  const group = 'px-2 py-1 text-[11px] font-semibold uppercase text-mute [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1';
  const pages: [string, string][] = [['Dashboard', '/dashboard'], ['Invoices', '/invoices'], ['Customers', '/customers'], ['Items', '/items'], ['Reports', '/reports'], ['Settings', '/settings'], ...(mode === 'ca' ? [['Clients', '/ca'] as [string, string]] : [])];

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" data-testid="palette">
      <div className="absolute inset-0 bg-black/60" onClick={() => setPaletteOpen(false)} />
      <Command label="Search" className="glass relative w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl">
        <Command.Input autoFocus placeholder="Search invoices, customers, items, screens…" className="w-full border-b border-mute/20 bg-transparent px-4 py-3 text-sm outline-none" data-testid="palette-input" />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-center text-sm text-mute">Nothing found.</Command.Empty>
          <Command.Group heading="Go to" className={group}>
            {pages.map(([l, h]) => <Command.Item key={h} value={`go ${l}`} onSelect={() => go(h)} className={item}>{l}</Command.Item>)}
          </Command.Group>
          <Command.Group heading="Actions" className={group}>
            <Command.Item value="action new invoice" onSelect={() => go('/invoices/new')} className={item}>New invoice <kbd className="rounded bg-mute/20 px-1 text-xs">N</kbd></Command.Item>
            <Command.Item value="action presenter panel" onSelect={() => { setPaletteOpen(false); setPanelOpen(true); }} className={item}>Open presenter panel <kbd className="rounded bg-mute/20 px-1 text-xs">Shift D</kbd></Command.Item>
            <Command.Item value="action toggle theme" onSelect={() => { setUi({ theme: theme === 'dark' ? 'light' : 'dark' }); setPaletteOpen(false); }} className={item}>Switch to {theme === 'dark' ? 'light' : 'dark'} theme</Command.Item>
          </Command.Group>
          <Command.Group heading="Invoices" className={group}>
            {invoices.map((i) => (
              <Command.Item key={i.id} value={`invoice ${i.number ?? 'draft'} ${i.customer.name} ${i.id}`} onSelect={() => go(`/invoices/${i.id}`)} className={item}>
                <span><span className="font-mono text-xs text-gold">{i.number ?? 'Draft'}</span> <span className="text-mute">{i.customer.name}</span></span>
                <span className="num text-xs">{formatINR(i.totals.grandTotal)}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Customers" className={group}>
            {customers.map((c) => <Command.Item key={c.id} value={`customer ${c.name} ${c.gstin ?? ''} ${c.city}`} onSelect={() => go('/customers')} className={item}>{c.name}<span className="text-xs text-mute">{c.city}</span></Command.Item>)}
          </Command.Group>
          <Command.Group heading="Items" className={group}>
            {items.map((i) => <Command.Item key={i.id} value={`item ${i.name} ${i.hsn}`} onSelect={() => go('/items')} className={item}>{i.name}<span className="font-mono text-xs text-mute">{i.hsn}</span></Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
