// Fog of war: which regions a country can currently see.
import type { StaticWorld } from '../data/static';
import type { Formation, GameState } from './types';
import { defenders, hasTreaty } from './diplomacy';
import { formationDomain, formationUnits } from './military';
import { haversineKm } from './util';

/** Countries that share intelligence with `id`: allies, pact partners and co-belligerents. */
const partnerCache = new WeakMap<GameState, Map<string, { tick: number; set: Set<string> }>>();
export function intelPartners(state: GameState, id: string): Set<string> {
  let m = partnerCache.get(state);
  if (!m) { m = new Map(); partnerCache.set(state, m); }
  const hit = m.get(id);
  if (hit && hit.tick === state.tick) return hit.set;
  const set = computePartners(state, id);
  m.set(id, { tick: state.tick, set });
  return set;
}

function computePartners(state: GameState, id: string): Set<string> {
  const out = new Set<string>([id, ...defenders(state, id)]);
  for (const w of Object.values(state.wars)) {
    const side = w.attackers.includes(id) ? w.attackers : w.defenders.includes(id) ? w.defenders : null;
    if (side) side.forEach((c) => out.add(c));
  }
  for (const c of Object.keys(state.countries)) if (hasTreaty(state, id, c, 'military_access')) out.add(c);
  return out;
}

const cache = new WeakMap<GameState, { key: string; set: Set<number> }>();

export function visibleRegions(state: GameState, world: StaticWorld, id: string): Set<number> {
  const key = `${id}|${state.tick}|${Object.keys(state.formations).length}`;
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit.set;
  const partners = intelPartners(state, id);
  const vis = new Set<number>();
  const addRing = (r: number, hops: number) => {
    let frontier = [r];
    vis.add(r);
    for (let h = 0; h < hops; h++) {
      const next: number[] = [];
      for (const x of frontier) for (const n of world.regions[x].nb) if (!vis.has(n)) { vis.add(n); next.push(n); }
      frontier = next;
    }
  };
  const intelHops = (state.countries[id]?.tech.military ?? 0) >= 5 ? 2 : 1;
  for (const r of state.regions) if (partners.has(r.controller)) addRing(r.id, intelHops);
  for (const f of Object.values(state.formations)) {
    if (f.parent || !partners.has(f.owner)) continue;
    const domain = formationDomain(state, f);
    if (domain === 'naval' || f.pos.atSea) {
      // fleets see roughly 600 km around them
      for (const r of world.regions) if (Math.abs(r.lat - f.pos.lat) < 8 && haversineKm(r.lon, r.lat, f.pos.lon, f.pos.lat) < 600) vis.add(r.id);
    } else if (domain === 'air') {
      addRing(f.pos.region, 1);
      const o = f.order;
      if ('target' in o) addRing((o as { target: number }).target, formationUnits(state, f).some((u) => u.type === 'awacs') ? 2 : 1);
    } else addRing(f.pos.region, 1);
  }
  cache.set(state, { key, set: vis });
  return vis;
}

/** Whether `viewer` can see formation `f`. */
export function formationVisible(state: GameState, world: StaticWorld, viewer: string | null, f: Formation): boolean {
  if (!viewer || !state.settings.fogOfWar) return true;
  if (intelPartners(state, viewer).has(f.owner)) return true;
  return visibleRegions(state, world, viewer).has(f.pos.region);
}
