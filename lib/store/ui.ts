'use client';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Presenter preferences that survive a reload (not business data, so Reset demo data leaves them alone). */
export interface UiPrefs {
  threeD: boolean;        // landing hero uses WebGL
  presentation: boolean;  // UI at 110% with larger numbers
  spotlight: boolean;     // script spotlight overlay
  theme: 'dark' | 'light';
  set: (p: Partial<Pick<UiPrefs, 'threeD' | 'presentation' | 'spotlight' | 'theme'>>) => void;
}
export const useUi = create<UiPrefs>()(
  persist(
    (set) => ({ threeD: true, presentation: false, spotlight: true, theme: 'dark', set: (p) => set(p) }),
    { name: 'billease-ui', version: 1, storage: createJSONStorage(() => safeStorage), skipHydration: true, partialize: (s) => ({ threeD: s.threeD, presentation: s.presentation, spotlight: s.spotlight, theme: s.theme }) as UiPrefs },
  ),
);

/** A one-shot instruction from the Presenter Panel to the screen that can carry it out. */
export type PresenterCommand =
  | { id: number; type: 'select-customer'; name: string }
  | { id: number; type: 'issue-send' };

export interface Spot { selector: string; caption: string }

/** Session-only presenter state (never persisted). */
export interface PresenterState {
  panelOpen: boolean;
  paletteOpen: boolean;
  cmd: PresenterCommand | null;
  spot: Spot | null;
  setPanelOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  send: (c: { type: 'select-customer'; name: string } | { type: 'issue-send' }) => void;
  /** The screen that handled the command calls this so it is not run twice. */
  ack: (id: number) => void;
  setSpot: (s: Spot | null) => void;
}
let seq = 0;
export const usePresenter = create<PresenterState>((set, get) => ({
  panelOpen: false, paletteOpen: false, cmd: null, spot: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  send: (c) => set({ cmd: { ...c, id: ++seq } as PresenterCommand }),
  ack: (id) => { if (get().cmd?.id === id) set({ cmd: null }); },
  setSpot: (spot) => set({ spot }),
}));
