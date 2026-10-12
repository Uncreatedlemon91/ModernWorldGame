// Static world data produced by scripts/build-data.mjs. Identical for every player,
// so it never travels over the network: only dynamic GameState does.
import type { Topology } from 'topojson-specification';

export type Terrain = 'plains' | 'forest' | 'hills' | 'jungle' | 'mountains' | 'desert' | 'arctic';

export interface StaticCountry {
  a3: string;
  name: string;
  formal: string;
  iso2: string;
  pop: number;
  gdp: number; // millions USD
  continent: string;
  subregion: string;
  income: string;
  economy: string;
  sov: string;
  mapcolor: number;
  regions: number[];
}

export interface StaticRegion {
  id: number;
  c: string;
  n: string;
  lon: number;
  lat: number;
  area: number; // km2
  terrain: Terrain;
  elev: number;
  pop: number;
  nb: number[];
  coastal: boolean;
}

export interface StaticCity { n: string; lon: number; lat: number; pop: number; r: number; cap: 0 | 1 }
export interface StaticPort { n: string; lon: number; lat: number; r: number; size: number }
export interface StaticAirport { n: string; code: string; lon: number; lat: number; r: number; size: number }
export interface SeaRoute { a: number; b: number; p: [number, number][] }
export interface Polyline { r: number; p: [number, number][] }
export interface BorderArc { a: number; b: number; p: [number, number][] }

export interface OceanGrid { res: number; w: number; h: number; water: Uint8Array }

export interface StaticWorld {
  countries: StaticCountry[];
  countryByA3: Map<string, StaticCountry>;
  regions: StaticRegion[];
  cities: StaticCity[];
  citiesByRegion: Map<number, StaticCity[]>;
  ports: StaticPort[];
  portsByRegion: Map<number, StaticPort[]>;
  airports: StaticAirport[];
  seaRoutes: SeaRoute[];
  roads: Polyline[];
  rails: Polyline[];
  borders: BorderArc[];
  topo: Topology;
  ocean: OceanGrid;
}

interface WorldJson {
  countries: StaticCountry[];
  regions: StaticRegion[];
  cities: StaticCity[];
  ports: StaticPort[];
  airports: StaticAirport[];
}

export function decodeOcean(o: { res: number; w: number; h: number; firstOcean: number; rle: number[] }): OceanGrid {
  const water = new Uint8Array(o.w * o.h);
  let v = o.firstOcean, i = 0;
  for (const run of o.rle) { water.fill(v, i, i + run); i += run; v = v ? 0 : 1; }
  return { res: o.res, w: o.w, h: o.h, water };
}

export function assembleWorld(parts: {
  world: WorldJson; topo: Topology; borders: BorderArc[]; seaRoutes: SeaRoute[]; roads: Polyline[]; rails: Polyline[];
  ocean: { res: number; w: number; h: number; firstOcean: number; rle: number[] };
}): StaticWorld {
  const { world } = parts;
  const citiesByRegion = new Map<number, StaticCity[]>();
  for (const c of world.cities) {
    if (!citiesByRegion.has(c.r)) citiesByRegion.set(c.r, []);
    citiesByRegion.get(c.r)!.push(c);
  }
  const portsByRegion = new Map<number, StaticPort[]>();
  for (const p of world.ports) {
    if (!portsByRegion.has(p.r)) portsByRegion.set(p.r, []);
    portsByRegion.get(p.r)!.push(p);
  }
  return {
    countries: world.countries,
    countryByA3: new Map(world.countries.map((c) => [c.a3, c])),
    regions: world.regions,
    cities: world.cities,
    citiesByRegion,
    ports: world.ports,
    portsByRegion,
    airports: world.airports,
    seaRoutes: parts.seaRoutes,
    roads: parts.roads,
    rails: parts.rails,
    borders: parts.borders,
    topo: parts.topo,
    ocean: decodeOcean(parts.ocean),
  };
}

export async function loadStaticWorld(base = './data/', onProgress?: (p: number) => void): Promise<StaticWorld> {
  const files = ['world.json', 'regions.topo.json', 'borders.json', 'searoutes.json', 'roads.json', 'rails.json', 'ocean.json'] as const;
  let done = 0;
  const results = await Promise.all(files.map(async (f) => {
    const res = await fetch(base + f);
    if (!res.ok) throw new Error(`Failed to load ${f}`);
    const j = await res.json();
    done++;
    onProgress?.(done / files.length);
    return j;
  }));
  const [world, topo, borders, seaRoutes, roads, rails, ocean] = results;
  return assembleWorld({ world, topo, borders, seaRoutes, roads, rails, ocean });
}
