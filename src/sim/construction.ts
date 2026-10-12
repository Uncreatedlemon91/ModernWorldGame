import type { StaticWorld } from '../data/static';
import type { GameState } from './types';
import { BUILDING_BY_ID } from './content/buildings';
import { countryPop, priceLevel } from './economy';

export function buildingCost(state: GameState, countryId: string, building: string, region?: number) {
  const c = state.countries[countryId];
  const def = BUILDING_BY_ID[building];
  if (!c || !def) return Infinity;
  const lvl = region !== undefined ? (state.regions[region].buildings[building] ?? 0) + state.regions[region].construction.filter((j) => j.building === building).length : 0;
  return def.cost * priceLevel(c, countryPop(state, countryId)) * (1 + lvl * 0.35);
}

export function canBuild(state: GameState, world: StaticWorld, countryId: string, region: number, building: string): string | null {
  const r = state.regions[region];
  const def = BUILDING_BY_ID[building];
  if (!r || !def) return 'Unknown building';
  if (r.owner !== countryId) return 'Not your region';
  if (r.controller !== countryId) return 'Region is occupied';
  if (def.coastal && !world.regions[region].coastal) return 'Requires a coastline';
  const lvl = (r.buildings[building] ?? 0) + r.construction.filter((j) => j.building === building).length;
  if (lvl >= def.maxLevel) return 'Maximum level reached';
  if (r.construction.length >= 3) return 'Construction queue full (3)';
  const c = state.countries[countryId];
  if (c.treasury < buildingCost(state, countryId, building, region)) return 'Not enough money in the treasury';
  return null;
}

export function startConstruction(state: GameState, world: StaticWorld, countryId: string, region: number, building: string): string | null {
  const err = canBuild(state, world, countryId, region, building);
  if (err) return err;
  const cost = buildingCost(state, countryId, building, region);
  const c = state.countries[countryId];
  c.treasury -= cost;
  const def = BUILDING_BY_ID[building];
  const days = Math.round(def.days * (state.regions[region].devastation > 30 ? 1.3 : 1));
  state.regions[region].construction.push({ building, progress: 0, days });
  return null;
}
