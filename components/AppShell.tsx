'use client';
import clsx from 'clsx';
import { BarChart3, Briefcase, Clapperboard, FileText, LayoutDashboard, Moon, Package, PanelLeftClose, PanelLeftOpen, Receipt, Search, Settings, Sun, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CA_FIRM } from '@/lib/domain/ca';
import { useApp, WORKSPACE_ORDER } from '@/lib/store';
import { useHydrated } from '@/lib/store/useHydrated';
import { usePresenter, useUi } from '@/lib/store/ui';
import { CommandPalette } from './CommandPalette';
import { PresenterPanel } from './demo/PresenterPanel';
import { ScriptSpotlight } from './demo/ScriptSpotlight';
import { Chip } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, live: true },
  { href: '/invoices', label: 'Invoices', icon: FileText, live: true },
  { href: '/customers', label: 'Customers', icon: Users, live: true },
  { href: '/items', label: 'Items', icon: Package, live: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, live: true },
  { href: '/settings', label: 'Settings', icon: Settings, live: true },
];
const CLIENTS_NAV = { href: '/ca', label: 'Clients', icon: Briefcase, live: true };

/** Firm monogram for the CA white-label view (drawn, no external image). */
function FirmMark({ size = 32 }: { size?: number }) {
  return (
    <span aria-hidden className="flex items-center justify-center rounded-lg text-[11px] font-extrabold text-ink" style={{ width: size, height: size, background: `linear-gradient(135deg, ${CA_FIRM.accentFrom}, ${CA_FIRM.accentTo})` }}>
      {CA_FIRM.short}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const ready = useHydrated();
  const { business: biz, mode, activeId, others, enterCa, enterOwner, switchWorkspace } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const theme = useUi((u) => u.theme);
  const presentation = useUi((u) => u.presentation);
  const setUi = useUi((u) => u.set);
  const { setPanelOpen, setPaletteOpen } = usePresenter.getState();
  const ca = ready && mode === 'ca';

  const clients = useMemo(
    () => WORKSPACE_ORDER.map((id) => (id === activeId ? biz : others[id]?.business)).filter((b): b is NonNullable<typeof b> => !!b),
    [activeId, biz, others],
  );
  const nav = ca ? [CLIENTS_NAV, ...NAV] : NAV;

  // CA view re-brands the whole app by swapping the accent colour pair (see globals.css).
  useEffect(() => {
    if (ca) document.documentElement.dataset.brand = 'ca'; else delete document.documentElement.dataset.brand;
    // Next resets the title on navigation, so re-apply after each route change.
    const t = setTimeout(() => { document.title = ca ? `${CA_FIRM.name} - client books` : 'BillEase - GST billing demo'; }, 0);
    return () => clearTimeout(t);
  }, [ca, path]);
  // Shortcuts: N new invoice, Shift+D presenter panel, Ctrl/Cmd+K search. Ignored while typing.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!usePresenter.getState().paletteOpen); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      if (e.shiftKey && e.key === 'D') { e.preventDefault(); setPanelOpen(!usePresenter.getState().panelOpen); return; }
      if (e.key.toLowerCase() === 'n' && !e.shiftKey) {
        if (document.querySelector('[role=dialog]')) return;
        e.preventDefault();
        router.push('/invoices/new');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router, setPanelOpen, setPaletteOpen]);
  // Theme and presentation mode (UI at 110%) are applied on the root element.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (presentation) document.documentElement.dataset.present = '1'; else delete document.documentElement.dataset.present;
  }, [theme, presentation]);

  const viewBtn = (on: boolean) => clsx('rounded-md px-2.5 py-1 text-xs font-medium', on ? 'bg-gold/20 text-gold' : 'text-mute hover:text-fg');

  return (
    <div className="flex min-h-screen">
      <aside className={clsx('glass sticky top-0 hidden h-screen shrink-0 flex-col border-r md:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className="flex items-center gap-2 px-4 py-4" data-testid="brand">
          {ca ? <FirmMark /> : <Receipt className="text-gold" size={22} />}
          {!collapsed && (ca
            ? <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-bold">{CA_FIRM.name}</span><span className="block truncate text-[10px] text-mute">{CA_FIRM.tagline}</span></span>
            : <span className="text-lg font-bold">Bill<span className="text-gold">Ease</span></span>)}
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map(({ href, label, icon: Icon, live }) => {
            const active = path === href || path.startsWith(href + '/');
            if (!live) {
              // Screens that arrive in later phases are shown but not linked (no dead links).
              return (
                <div key={href} title={`${label} - coming in a later build phase`} aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute/50">
                  <Icon size={18} />{!collapsed && <><span className="flex-1">{label}</span><span className="text-[10px] uppercase">soon</span></>}
                </div>
              );
            }
            return (
              <Link key={href} href={href} title={label}
                className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', active ? 'bg-gold/15 text-gold' : 'text-mute hover:bg-mute/10 hover:text-fg')}>
                <Icon size={18} />
                {!collapsed && <span className="flex-1">{label}</span>}
              </Link>
            );
          })}
        </nav>
        {ca && !collapsed && <p className="px-4 pb-1 text-[10px] text-mute" data-testid="powered">Powered by Neovia AI</p>}
        <button onClick={() => setCollapsed((c) => !c)} className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-mute hover:bg-mute/10" aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Collapse</>}
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b px-4 py-3">
          {ca ? (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span className="hidden text-xs text-mute sm:inline">Client</span>
              <select className="input w-auto max-w-[16rem] truncate !py-1" value={activeId} data-testid="client-switcher" aria-label="Switch client"
                onChange={(e) => { switchWorkspace(e.target.value); if (path === '/ca') router.push('/dashboard'); }}>
                {clients.map((b) => <option key={b.id} value={b.id}>{b.tradeName}</option>)}
              </select>
            </label>
          ) : <div className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="business-name">{ready ? biz.tradeName : ' '}</div>}
          <div className="flex items-center rounded-lg border border-mute/30 p-0.5" role="group" aria-label="View as">
            <button className={viewBtn(!ca)} aria-pressed={!ca} onClick={() => { enterOwner(); router.push('/dashboard'); }} data-testid="view-owner">Owner</button>
            <button className={viewBtn(ca)} aria-pressed={ca} onClick={() => { enterCa(); router.push('/ca'); }} data-testid="view-ca">CA</button>
          </div>
          <button onClick={() => setPaletteOpen(true)} className="hidden items-center gap-2 rounded-lg border border-mute/30 px-2.5 py-1.5 text-xs text-mute hover:bg-mute/10 sm:flex" aria-label="Search" data-testid="open-search"><Search size={14} /> Search <kbd className="rounded bg-mute/20 px-1">⌘K</kbd></button>
          <button onClick={() => setPanelOpen(true)} className="rounded-lg p-2 text-mute hover:bg-mute/15 hover:text-fg" aria-label="Presenter panel (Shift+D)" title="Presenter panel (Shift+D)" data-testid="open-presenter"><Clapperboard size={18} /></button>
          <Chip tone="amber">Demo data</Chip>
          <button onClick={() => setUi({ theme: theme === 'dark' ? 'light' : 'dark' })} className="rounded-lg p-2 hover:bg-mute/15" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        {ca && path !== '/ca' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-gold/30 bg-gold/10 px-4 py-1.5 text-xs" data-testid="client-banner">
            <span>Viewing the books of <strong>{biz.tradeName}</strong> <span className="text-mute">({biz.kind ?? 'Business'})</span></span>
            <Link href="/ca" className="ml-auto text-gold underline">Back to all clients</Link>
          </div>
        )}
        <nav className="glass flex gap-1 overflow-x-auto px-2 py-1 md:hidden">
          {nav.filter((n) => n.live).map(({ href, label }) => (
            <Link key={href} href={href} className={clsx('rounded-lg px-3 py-1.5 text-sm', path.startsWith(href) ? 'bg-gold/15 text-gold' : 'text-mute')}>{label}</Link>
          ))}
        </nav>
        <main className="p-4 md:p-6">{ready ? children : <div className="text-sm text-mute">Loading your demo data…</div>}</main>
      </div>
      {ready && <><PresenterPanel /><ScriptSpotlight /><CommandPalette /></>}
    </div>
  );
}

