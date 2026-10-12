import type { GameState } from './types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function newId(state: GameState, prefix: string): string {
  state.nextId++;
  return `${prefix}${state.nextId.toString(36)}`;
}

export function relKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function dateOf(state: Pick<GameState, 'startDate' | 'tick'>): Date {
  const d = new Date(state.startDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + state.tick);
  return d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(d: Date) { return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function formatTickDate(state: Pick<GameState, 'startDate'>, tick: number) { return formatDate(dateOf({ startDate: state.startDate, tick })); }

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number) {
  const r = Math.PI / 180;
  const s1 = Math.sin(((lat2 - lat1) * r) / 2), s2 = Math.sin(((lon2 - lon1) * r) / 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * s2 * s2)));
}

export function fmtMoney(b: number): string {
  const a = Math.abs(b);
  const s = b < 0 ? '-' : '';
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(2)}T`;
  if (a >= 1) return `${s}$${a.toFixed(1)}B`;
  return `${s}$${(a * 1000).toFixed(0)}M`;
}

export function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
