import type { StaticWorld } from '../data/static';
import type { GameState } from '../sim/types';
import type { MapMode } from '../store';
import { opinion, areEnemies } from '../sim/diplomacy';
import { regionVote, isDemocracy } from '../sim/politics';

export type RGB = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function ramp(stops: [number, RGB][], v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const t = (v - a) / (b - a);
      return [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
    }
  }
  return stops[stops.length - 1][1];
}

const PROSPERITY: [number, RGB][] = [[10, [120, 40, 40]], [35, [200, 120, 50]], [55, [220, 200, 80]], [75, [80, 190, 120]], [92, [60, 160, 230]]];
const UNREST: [number, RGB][] = [[0, [40, 90, 70]], [25, [140, 160, 80]], [50, [230, 170, 60]], [75, [230, 80, 50]], [100, [140, 0, 30]]];
const GDPPC: [number, RGB][] = [[0, [90, 40, 60]], [1, [170, 70, 60]], [2, [220, 150, 70]], [3, [190, 210, 90]], [4, [70, 190, 150]], [5, [70, 140, 240]]];
const RELATION: [number, RGB][] = [[-100, [150, 20, 30]], [-40, [210, 90, 70]], [0, [140, 140, 150]], [40, [110, 190, 120]], [100, [40, 170, 90]]];
const TERRAIN: Record<string, RGB> = { plains: [150, 190, 100], forest: [60, 130, 70], hills: [170, 160, 100], jungle: [40, 110, 50], mountains: [140, 120, 100], desert: [220, 190, 120], arctic: [220, 230, 240] };
const BLOC: Record<string, RGB> = { western: [70, 120, 220], eastern: [200, 70, 60], chinese: [220, 170, 50], nonaligned: [130, 130, 140] };

export interface ColorResult { fill: (RGB | null)[]; opacity: number; legend: { label: string; color: RGB }[] }

export function computeRegionColors(state: GameState, world: StaticWorld, mode: MapMode, myCountry: string | null, focusCountry: string | null): ColorResult {
  const n = state.regions.length;
  const fill: (RGB | null)[] = new Array(n).fill(null);
  let legend: ColorResult['legend'] = [];
  let opacity = 0.5;
  const ownerColor = (id: string): RGB => state.countries[id]?.color ?? [120, 120, 120];
  switch (mode) {
    case 'political':
      for (const r of state.regions) {
        const base = ownerColor(r.owner);
        if (r.controller !== r.owner) {
          const occ = ownerColor(r.controller);
          fill[r.id] = [lerp(base[0], occ[0], 0.6) * 0.75, lerp(base[1], occ[1], 0.6) * 0.75, lerp(base[2], occ[2], 0.6) * 0.75];
        } else fill[r.id] = base;
      }
      opacity = 0.5;
      break;
    case 'satellite':
      opacity = 0;
      break;
    case 'prosperity':
      for (const r of state.regions) fill[r.id] = ramp(PROSPERITY, r.prosperity);
      legend = [[15, 'Destitute'], [40, 'Poor'], [60, 'Middle'], [80, 'Prosperous'], [95, 'Wealthy']].map(([v, l]) => ({ label: l as string, color: ramp(PROSPERITY, v as number) }));
      opacity = 0.62;
      break;
    case 'economy':
      for (const r of state.regions) fill[r.id] = ramp(GDPPC, Math.log10(Math.max(0.3, r.productivity)) * 2.2 + 0.5);
      legend = [[0.5, '<$1k'], [5, '$5k'], [15, '$15k'], [40, '$40k'], [90, '$90k+']].map(([v, l]) => ({ label: `${l} / person`, color: ramp(GDPPC, Math.log10(v as number) * 2.2 + 0.5) }));
      opacity = 0.62;
      break;
    case 'unrest':
      for (const r of state.regions) fill[r.id] = ramp(UNREST, r.unrest);
      legend = [[5, 'Calm'], [30, 'Tense'], [55, 'Restless'], [80, 'Rioting']].map(([v, l]) => ({ label: l as string, color: ramp(UNREST, v as number) }));
      opacity = 0.62;
      break;
    case 'terrain':
      for (const r of state.regions) fill[r.id] = TERRAIN[world.regions[r.id].terrain];
      legend = Object.entries(TERRAIN).map(([k, c]) => ({ label: k[0].toUpperCase() + k.slice(1), color: c }));
      opacity = 0.55;
      break;
    case 'relations': {
      const me = myCountry ?? focusCountry;
      const cache = new Map<string, RGB>();
      for (const r of state.regions) {
        if (!me) { fill[r.id] = ownerColor(r.owner); continue; }
        const o = r.controller;
        if (o === me) { fill[r.id] = [60, 140, 255]; continue; }
        let c = cache.get(o);
        if (!c) { c = areEnemies(state, me, o) ? [120, 0, 20] : ramp(RELATION, opinion(state, me, o)); cache.set(o, c); }
        fill[r.id] = c;
      }
      legend = [{ label: 'You', color: [60, 140, 255] }, { label: 'At war', color: [120, 0, 20] }, { label: 'Hostile', color: ramp(RELATION, -60) }, { label: 'Neutral', color: ramp(RELATION, 0) }, { label: 'Friendly', color: ramp(RELATION, 60) }];
      opacity = 0.6;
      break;
    }
    case 'alliances': {
      const orgOf = new Map<string, RGB>();
      for (const o of Object.values(state.orgs)) if (o.kind === 'military') for (const m of o.members) orgOf.set(m, o.color);
      for (const r of state.regions) {
        const c = state.countries[r.owner];
        fill[r.id] = orgOf.get(r.owner) ?? (c ? BLOC[c.bloc].map((v) => v * 0.6) as RGB : [100, 100, 100]);
      }
      legend = [...Object.values(state.orgs).filter((o) => o.kind === 'military').map((o) => ({ label: o.short, color: o.color })),
        { label: 'Western-leaning', color: BLOC.western.map((v) => v * 0.6) as RGB }, { label: 'Russia-aligned', color: BLOC.eastern.map((v) => v * 0.6) as RGB },
        { label: 'China-aligned', color: BLOC.chinese.map((v) => v * 0.6) as RGB }, { label: 'Non-aligned', color: BLOC.nonaligned.map((v) => v * 0.6) as RGB }];
      opacity = 0.6;
      break;
    }
    case 'elections': {
      const focus = focusCountry ?? myCountry;
      for (const c of Object.values(state.countries)) {
        const regs = world.countryByA3.get(c.id)?.regions ?? [];
        const live = c.id === focus && isDemocracy(c.gov);
        for (const id of regs) {
          if (state.regions[id].owner !== c.id) continue;
          let pid: string | undefined;
          if (live) {
            const v = regionVote(state, world, c, id);
            pid = Object.entries(v).sort((a, b) => b[1] - a[1])[0]?.[0];
          } else pid = c.lastElection?.regionWinners[id] ?? c.rulingParty;
          const p = pid ? state.parties[pid] : undefined;
          fill[id] = p ? p.color : ownerColor(c.id);
        }
      }
      if (focus && state.countries[focus]) {
        legend = Object.keys(state.countries[focus].seats).map((pid) => state.parties[pid]).filter(Boolean).map((p) => ({ label: p.short, color: p.color }));
      }
      opacity = 0.62;
      break;
    }
  }
  return { fill, opacity, legend };
}

export const rgbCss = (c: RGB | readonly number[], a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
