// Civilian traffic: freighters on sea lanes, airliners between airports, and
// cars/trucks/trains on real roads and railways. Purely cosmetic, derived from
// the replicated game state (trade, prosperity, wars, blockades).
import type { StaticWorld, Polyline } from '../data/static';
import type { GameState } from '../sim/types';
import { areEnemies } from '../sim/diplomacy';
import { Rng } from '../sim/rng';
import { haversineKm } from '../sim/util';

export interface Ship { path: [number, number][]; cum: number[]; len: number; phase: number; speed: number; kind: 'ship' | 'tanker'; dir: 1 | -1; color: [number, number, number] }
export interface Flight { a: [number, number]; b: [number, number]; dist: number; phase: number; period: number; color: [number, number, number] }


function cumulative(path: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineKm(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  return cum;
}

export function positionAlong(path: [number, number][], cum: number[], d: number): { pos: [number, number]; angle: number } {
  const len = cum[cum.length - 1];
  d = Math.max(0, Math.min(len, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  const [x0, y0] = path[i - 1], [x1, y1] = path[i];
  let dx = x1 - x0; if (dx > 180) dx -= 360; if (dx < -180) dx += 360;
  let x = x0 + dx * t; if (x > 180) x -= 360; if (x < -180) x += 360;
  const y = y0 + (y1 - y0) * t;
  const angle = (Math.atan2(dx * Math.cos((y * Math.PI) / 180), y1 - y0) * 180) / Math.PI;
  return { pos: [x, y], angle };
}

/** Great-circle interpolation. */
export function greatCircle(a: [number, number], b: [number, number], t: number): [number, number] {
  const r = Math.PI / 180;
  const [l1, p1] = [a[0] * r, a[1] * r], [l2, p2] = [b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6) return a;
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x * x + y * y)) / r];
}

const tradeWeight = (state: GameState, countryId: string) => {
  const c = state.countries[countryId];
  if (!c) return 0;
  return Math.log10(c.gdp + 1) * c.tradeOpenness * (1 - (c.laws.trade_policy === 'protectionism' ? 0.2 : 0));
};

export function buildShips(state: GameState, world: StaticWorld, blockaded: Set<number>): Ship[] {
  const rng = new Rng(1234);
  const ships: Ship[] = [];
  for (const route of world.seaRoutes) {
    const pa = world.ports[route.a], pb = world.ports[route.b];
    if (!pa || !pb) continue;
    const ra = state.regions[pa.r], rb = state.regions[pb.r];
    if (!ra || !rb) continue;
    if (areEnemies(state, ra.controller, rb.controller)) continue;
    if (state.sanctions[`${ra.owner}>${rb.owner}`] || state.sanctions[`${rb.owner}>${ra.owner}`]) continue;
    if (blockaded.has(pa.r) || blockaded.has(pb.r)) continue;
    const w = tradeWeight(state, ra.owner) + tradeWeight(state, rb.owner)
      + ((ra.buildings.port ?? 0) + (rb.buildings.port ?? 0)) * 0.6;
    const cum = cumulative(route.p);
    const len = cum[cum.length - 1];
    const n = Math.max(0, Math.min(3, Math.round(w * 0.35 * (rng.next() * 0.6 + 0.7) * Math.min(1.5, len / 3000 + 0.4))));
    for (let i = 0; i < n; i++) {
      const tanker = rng.chance(0.3);
      ships.push({ path: route.p, cum, len, phase: rng.next(), speed: 55 + rng.next() * 25, kind: tanker ? 'tanker' : 'ship', dir: rng.chance(0.5) ? 1 : -1,
        color: tanker ? [255, 170, 110] : [235, 240, 255] });
    }
  }
  return ships;
}

export function buildFlights(state: GameState, world: StaticWorld): Flight[] {
  const rng = new Rng(99);
  const major = world.airports.filter((a) => a.size >= 3);
  const flights: Flight[] = [];
  for (const a of major) {
    const ra = state.regions[a.r];
    if (!ra || ra.controller !== ra.owner) continue;
    const c = state.countries[ra.owner];
    if (!c) continue;
    const busy = Math.min(5, Math.round((ra.prosperity / 45) + (ra.buildings.airport ?? 0) * 0.7 + Math.log10(c.gdp + 1) * 0.35));
    for (let k = 0; k < busy; k++) {
      const b = major[Math.floor(rng.next() * major.length)];
      if (b === a) continue;
      const rb = state.regions[b.r];
      if (!rb) continue;
      if (areEnemies(state, ra.owner, rb.owner)) continue;
      const dist = haversineKm(a.lon, a.lat, b.lon, b.lat);
      if (dist < 300 || (dist > 9000 && rng.chance(0.6))) continue;
      flights.push({ a: [a.lon, a.lat], b: [b.lon, b.lat], dist, phase: rng.next(), period: 20 + dist / 250, color: [255, 255, 255] });
    }
  }
  return flights;
}

/** A road or railway prepared for CPU-animated vehicles. */
export interface Lane { path: [number, number][]; cum: number[]; len: number; bbox: [number, number, number, number]; vehicles: number; kind: 'road' | 'rail' }

function bboxOf(path: [number, number][]): [number, number, number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of path) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

function buildLanes(lines: Polyline[], density: (r: number) => number, kind: Lane['kind'], perKm: number): Lane[] {
  const out: Lane[] = [];
  for (const line of lines) {
    const d = density(line.r);
    if (d <= 0) continue;
    const cum = cumulative(line.p);
    const len = cum[cum.length - 1];
    if (len < 5) continue;
    const vehicles = Math.max(1, Math.min(kind === 'road' ? 14 : 4, Math.round(d * len * perKm)));
    out.push({ path: line.p, cum, len, bbox: bboxOf(line.p), vehicles, kind });
  }
  return out;
}

export function buildRoadLanes(state: GameState, world: StaticWorld): Lane[] {
  return buildLanes(world.roads, (r) => {
    const reg = state.regions[r];
    if (!reg) return 0;
    if (reg.devastation > 50) return 0.1;
    return (reg.prosperity / 40) ** 1.5 * (0.6 + (reg.buildings.highway ?? 0) * 0.35) * (reg.controller !== reg.owner ? 0.3 : 1);
  }, 'road', 1 / 35);
}

export function buildRailLanes(state: GameState, world: StaticWorld): Lane[] {
  return buildLanes(world.rails, (r) => {
    const reg = state.regions[r];
    if (!reg) return 0;
    return (reg.prosperity / 60) * (0.4 + (reg.buildings.rail ?? 0) * 0.6);
  }, 'rail', 1 / 250);
}

export interface Vehicle { pos: [number, number]; trail: [number, number][]; color: [number, number, number] }

const ROAD_COLORS: [number, number, number][] = [[255, 245, 220], [255, 90, 70], [255, 170, 70], [255, 245, 220]];

/** Position every vehicle on lanes intersecting the view bounds. */
export function animateVehicles(lanes: Lane[], bounds: [number, number, number, number], t: number, max: number): Vehicle[] {
  const [bx0, by0, bx1, by1] = bounds;
  const out: Vehicle[] = [];
  for (let li = 0; li < lanes.length; li++) {
    const lane = lanes[li];
    const [x0, y0, x1, y1] = lane.bbox;
    if (x1 < bx0 || x0 > bx1 || y1 < by0 || y0 > by1) continue;
    const rail = lane.kind === 'rail';
    const speed = rail ? 9 : 5; // km per second of animation
    const trailKm = rail ? 14 : 3;
    for (let i = 0; i < lane.vehicles; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const base = ((i * 0.618 + li * 0.137) % 1) * lane.len;
      let d = (base + t * speed * (0.8 + ((i * 7 + li) % 5) * 0.1)) % lane.len;
      if (dir < 0) d = lane.len - d;
      const pos = positionAlong(lane.path, lane.cum, d).pos;
      const tail = positionAlong(lane.path, lane.cum, d - dir * trailKm).pos;
      out.push({ pos, trail: [tail, pos], color: rail ? [120, 220, 255] : ROAD_COLORS[(i + li) % ROAD_COLORS.length] });
      if (out.length >= max) return out;
    }
  }
  return out;
}
