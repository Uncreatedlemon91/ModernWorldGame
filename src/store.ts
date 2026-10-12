import { create } from 'zustand';
import type { StaticWorld } from './data/static';
import type { Session, AnyCommand } from './net/session';
import type { Order } from './sim/types';

export type Panel = 'overview' | 'politics' | 'laws' | 'economy' | 'military' | 'diplomacy' | 'news' | 'chat' | 'menu' | null;
export type MapMode = 'political' | 'satellite' | 'economy' | 'prosperity' | 'unrest' | 'elections' | 'relations' | 'alliances' | 'terrain';

export interface Selection { kind: 'region'; id: number }

export type OrderMode = { formation: string; kind: Order['kind'] } | null;

interface UIState {
  world: StaticWorld | null;
  session: Session | null;
  version: number; // bumps whenever game state changes
  screen: 'loading' | 'menu' | 'lobby' | 'game';
  panel: Panel;
  mapMode: MapMode;
  selectedRegion: number | null;
  selectedCountry: string | null;
  selectedFormation: string | null;
  orderMode: OrderMode;
  toasts: { id: number; text: string; kind: 'error' | 'info' }[];
  flyTo: { lon: number; lat: number; zoom?: number; seq: number } | null;
  showTraffic: boolean;
  showLabels: boolean;
  showTutorial: boolean;
  setWorld: (w: StaticWorld) => void;
  setSession: (s: Session | null) => void;
  set: (p: Partial<UIState>) => void;
  toast: (text: string, kind?: 'error' | 'info') => void;
  send: (cmd: AnyCommand) => Promise<boolean>;
  fly: (lon: number, lat: number, zoom?: number) => void;
}

let toastSeq = 1;
let unsub: (() => void) | null = null;

export const useStore = create<UIState>((set, get) => ({
  world: null,
  session: null,
  version: 0,
  screen: 'loading',
  panel: 'overview',
  mapMode: 'political',
  selectedRegion: null,
  selectedCountry: null,
  selectedFormation: null,
  orderMode: null,
  toasts: [],
  flyTo: null,
  showTraffic: true,
  showLabels: true,
  showTutorial: false,
  setWorld: (world) => set({ world }),
  setSession: (session) => {
    unsub?.();
    unsub = null;
    get().session?.leave();
    if (session) {
      let scheduled = false;
      unsub = session.subscribe(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; set({ version: session.version }); });
      });
    }
    set({ session, version: 0, selectedRegion: null, selectedCountry: null, selectedFormation: null, orderMode: null });
  },
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 4500 : 3000);
  },
  send: async (cmd) => {
    const s = get().session;
    if (!s) return false;
    const r = await s.send(cmd);
    if (!r.ok && r.error) get().toast(r.error, 'error');
    return r.ok;
  },
  fly: (lon, lat, zoom) => set((s) => ({ flyTo: { lon, lat, zoom, seq: (s.flyTo?.seq ?? 0) + 1 } })),
}));

/** Convenience accessors for components (call inside render after subscribing to `version`). */
export function useGame() {
  useStore((s) => s.version);
  const session = useStore((s) => s.session);
  const world = useStore((s) => s.world);
  const state = session?.state;
  const me = session ? state?.players[session.me] : undefined;
  const country = me?.country && state ? state.countries[me.country] : undefined;
  return { session, world, state, me, country };
}

// Handy for debugging from the browser console.
(window as unknown as { __store?: typeof useStore }).__store = useStore;
