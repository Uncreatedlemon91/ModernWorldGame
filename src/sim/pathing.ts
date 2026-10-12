import type { StaticWorld } from '../data/static';
import { haversineKm } from './util';

const TERRAIN_COST: Record<string, number> = { plains: 1, forest: 1.3, hills: 1.4, jungle: 1.8, mountains: 2, desert: 1.3, arctic: 2 };
export const terrainMoveCost = (t: string) => TERRAIN_COST[t] ?? 1;

/** Dijkstra over region adjacency. Returns region ids excluding the start, or null. */
export function landPath(world: StaticWorld, from: number, to: number, passable: (id: number) => boolean): number[] | null {
  if (from === to) return [];
  const n = world.regions.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[from] = 0;
  const heap: [number, number][] = [[0, from]];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    const ru = world.regions[u];
    for (const v of ru.nb) {
      if (done[v]) continue;
      if (v !== to && !passable(v)) continue;
      const rv = world.regions[v];
      const nd = d + haversineKm(ru.lon, ru.lat, rv.lon, rv.lat) * terrainMoveCost(rv.terrain);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); }
    }
  }
  if (prev[to] === -1) return null;
  const path: number[] = [];
  for (let v = to; v !== from; v = prev[v]) path.push(v);
  return path.reverse();
}

// ---------------- Ocean routing ----------------

function cellOf(world: StaticWorld, lon: number, lat: number) {
  const { res, w, h } = world.ocean;
  let x = Math.floor((lon + 180) / res); x = ((x % w) + w) % w;
  const y = Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / res)));
  return y * w + x;
}
function cellCenter(world: StaticWorld, c: number): [number, number] {
  const { res, w } = world.ocean;
  return [-180 + ((c % w) + 0.5) * res, 90 - (Math.floor(c / w) + 0.5) * res];
}

export function nearestWaterCell(world: StaticWorld, lon: number, lat: number): number {
  const { w, h, water } = world.ocean;
  const c0 = cellOf(world, lon, lat);
  if (water[c0]) return c0;
  const cx = c0 % w, cy = Math.floor(c0 / w);
  for (let r = 1; r < 8; r++) {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const y = cy + dy; if (y < 0 || y >= h) continue;
      const x = (cx + dx + w) % w; const c = y * w + x;
      if (!water[c]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export function seaPath(world: StaticWorld, from: [number, number], to: [number, number]): [number, number][] | null {
  const { w, h, water } = world.ocean;
  const s = nearestWaterCell(world, from[0], from[1]);
  const g = nearestWaterCell(world, to[0], to[1]);
  if (s < 0 || g < 0) return null;
  const n = w * h;
  const gs = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const [gx, gy] = cellCenter(world, g);
  const heur = (c: number) => { const [x, y] = cellCenter(world, c); return haversineKm(x, y, gx, gy); };
  const heap: [number, number][] = [];
  const push = (f: number, v: number) => {
    heap.push([f, v]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top[1];
  };
  gs[s] = 0; push(heur(s), s);
  let found = s === g;
  while (heap.length && !found) {
    const u = pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (u === g) { found = true; break; }
    const ux = u % w, uy = Math.floor(u / w);
    const [ulon, ulat] = cellCenter(world, u);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const y = uy + dy; if (y < 0 || y >= h) continue;
      const x = (ux + dx + w) % w; const v = y * w + x;
      if (!water[v] || closed[v]) continue;
      const [vlon, vlat] = cellCenter(world, v);
      const nd = gs[u] + haversineKm(ulon, ulat, vlon, vlat);
      if (nd < gs[v]) { gs[v] = nd; prev[v] = u; push(nd + heur(v), v); }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let v = g; v !== -1; v = prev[v]) { cells.push(v); if (v === s) break; }
  cells.reverse();
  // thin out waypoints
  const pts: [number, number][] = [];
  for (let i = 0; i < cells.length; i += 3) pts.push(cellCenter(world, cells[i]));
  pts.push(cellCenter(world, cells[cells.length - 1]));
  pts.push(to);
  return pts;
}
