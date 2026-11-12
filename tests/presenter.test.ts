// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { heroData } from '@/lib/heroData';
import { usePresenter, useUi } from '@/lib/store/ui';

describe('presenter store', () => {
  beforeEach(() => usePresenter.setState({ panelOpen: false, paletteOpen: false, cmd: null, spot: null }));
  it('sends one-shot commands with increasing ids and clears only the acknowledged one', () => {
    const p = usePresenter.getState();
    p.send({ type: 'select-customer', name: 'Surat Lighting House' });
    const first = usePresenter.getState().cmd!;
    expect(first).toMatchObject({ type: 'select-customer', name: 'Surat Lighting House' });
    p.send({ type: 'issue-send' });
    const second = usePresenter.getState().cmd!;
    expect(second.id).toBeGreaterThan(first.id);
    usePresenter.getState().ack(first.id); // stale ack must not clear the newer command
    expect(usePresenter.getState().cmd?.id).toBe(second.id);
    usePresenter.getState().ack(second.id);
    expect(usePresenter.getState().cmd).toBeNull();
  });
  it('panel, palette and spotlight state', () => {
    const p = usePresenter.getState();
    p.setPanelOpen(true); p.setPaletteOpen(true); p.setSpot({ selector: '[data-testid=ca-pack]', caption: 'x' });
    const s = usePresenter.getState();
    expect([s.panelOpen, s.paletteOpen, s.spot?.selector]).toEqual([true, true, '[data-testid=ca-pack]']);
  });
  it('display preferences default to 3D on, presentation off, spotlight on, dark theme', () => {
    const u = useUi.getState();
    expect([u.threeD, u.presentation, u.spotlight, u.theme]).toEqual([true, false, true, 'dark']);
    u.set({ presentation: true, theme: 'light' });
    expect(useUi.getState()).toMatchObject({ presentation: true, theme: 'light', threeD: true });
    u.set({ presentation: false, theme: 'dark' });
  });
});

describe('landing hero data', () => {
  it('is the real canonical demo invoice, independent of saved data', () => {
    const h = heroData('2026-11-12');
    expect(h.inv.number).toBe('SSE/26-27/0418');
    expect(h.inv.totals.grandTotal).toBe(4186800);
    expect(h.inv.totals.cgst).toBe(243869);
    expect(h.inv.customer.name).toMatch(/^Patel Interiors/);
    const q = new URLSearchParams(h.upiUri.split('?')[1]);
    expect(q.get('am')).toBe('41868.00');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('tn')).toBe('SSE/26-27/0418');
    expect(JSON.stringify(heroData('2026-11-12'))).toBe(JSON.stringify(h));
  });
});
