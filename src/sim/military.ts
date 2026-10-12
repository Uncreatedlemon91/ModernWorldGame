import type { StaticWorld } from '../data/static';
import type { Formation, GameState, Order, Unit, UnitDomain, War } from './types';
import { UNIT_BY_ID } from './content/units';
import { areEnemies, hasMilitaryAccess, warsOf } from './diplomacy';
import { landPath, seaPath } from './pathing';
import { clamp, haversineKm, newId } from './util';
import { addNews } from './news';
import { priceLevel, countryPop } from './economy';
import { makeFormation, ordinal } from './init';

const TERRAIN_DEFENSE: Record<string, number> = { plains: 1, forest: 1.25, hills: 1.4, jungle: 1.5, mountains: 1.9, desert: 1.1, arctic: 1.4 };

// ---------------- Structure helpers ----------------

let unitIndex: { state: GameState | null; tick: number; count: number; map: Map<string, Unit[]> } = { state: null, tick: -1, count: -1, map: new Map() };
/** Units owned by a country (indexed once per tick; may miss units created this tick). */
export function unitsOf(state: GameState, countryId: string): Unit[] {
  if (unitIndex.state !== state || unitIndex.tick !== state.tick) {
    const map = new Map<string, Unit[]>();
    for (const u of Object.values(state.units)) {
      if (!map.has(u.owner)) map.set(u.owner, []);
      map.get(u.owner)!.push(u);
    }
    unitIndex = { state, tick: state.tick, count: 0, map };
  }
  return (unitIndex.map.get(countryId) ?? []).filter((u) => state.units[u.id]);
}

export function formationUnits(state: GameState, f: Formation): Unit[] {
  const out: Unit[] = [];
  for (const id of f.units) { const u = state.units[id]; if (u) out.push(u); }
  for (const cid of f.children) { const c = state.formations[cid]; if (c) out.push(...formationUnits(state, c)); }
  return out;
}

export function formationDomain(state: GameState, f: Formation): UnitDomain {
  const units = formationUnits(state, f);
  if (units.some((u) => UNIT_BY_ID[u.type]?.domain === 'naval')) return 'naval';
  if (units.some((u) => UNIT_BY_ID[u.type]?.domain === 'land')) return 'land';
  if (units.length === 0) return f.kind === 'taskforce' ? 'naval' : 'land';
  return 'air';
}

export function topFormation(state: GameState, f: Formation): Formation {
  let cur = f;
  while (cur.parent && state.formations[cur.parent]) cur = state.formations[cur.parent];
  return cur;
}

export function formationStrength(state: GameState, f: Formation) {
  const units = formationUnits(state, f);
  let attack = 0, defense = 0, air = 0, naval = 0, str = 0, org = 0;
  for (const u of units) {
    const d = UNIT_BY_ID[u.type];
    if (!d) continue;
    const m = u.strength * (0.4 + 0.6 * u.org) * (1 + u.xp * 0.4);
    attack += d.attack * m; defense += d.defense * m; air += d.air * m; naval += d.naval * m;
    str += u.strength; org += u.org;
  }
  const n = Math.max(1, units.length);
  return { attack, defense, air, naval, strength: str / n, org: org / n, count: units.length };
}

function techMult(state: GameState, owner: string) {
  const c = state.countries[owner];
  return c ? (1 + c.tech.military * 0.08) * (0.6 + 0.4 * c.militaryReadiness) : 1;
}

/** Remove a unit from whatever formation holds it. */
function detachUnitRaw(state: GameState, u: Unit) {
  if (u.parent) {
    const f = state.formations[u.parent];
    if (f) f.units = f.units.filter((id) => id !== u.id);
    u.parent = null;
  }
}

export function destroyUnit(state: GameState, u: Unit) {
  detachUnitRaw(state, u);
  delete state.units[u.id];
}

export function deleteFormation(state: GameState, f: Formation) {
  if (f.parent) {
    const p = state.formations[f.parent];
    if (p) p.children = p.children.filter((id) => id !== f.id);
  }
  delete state.formations[f.id];
}

/** Disband: units return to reserve at the formation's region; child formations become independent. */
export function disbandFormation(state: GameState, f: Formation) {
  const region = f.pos.region;
  const reserveRegion = state.regions[region]?.controller === f.owner ? region : state.countries[f.owner]?.capital ?? region;
  for (const id of f.units) { const u = state.units[id]; if (u) { u.parent = null; u.home = reserveRegion; } }
  for (const cid of f.children) {
    const c = state.formations[cid];
    if (c) { c.parent = null; c.pos = { ...f.pos, path: [...f.pos.path], pathRegions: [...f.pos.pathRegions] }; c.order = { kind: 'hold' }; }
  }
  f.units = []; f.children = [];
  deleteFormation(state, f);
}

/** Remove formations that have lost all their units. */
function pruneFormations(state: GameState) {
  for (const f of Object.values(state.formations)) {
    if (f.manned && formationUnits(state, f).length === 0 && f.children.length === 0) deleteFormation(state, f);
  }
}

// ---------------- Assignment rules ----------------

export function canAssignUnit(_state: GameState, u: Unit, f: Formation): string | null {
  if (u.owner !== f.owner) return 'Not your unit';
  if (u.training > 0) return 'Unit still in training';
  const d = UNIT_BY_ID[u.type];
  if (f.kind === 'regiment' && d.domain !== 'land') return 'Regiments only take battalions';
  if (f.kind === 'regiment' && f.units.length >= 6) return 'Regiment is full (6 battalions)';
  if (f.kind === 'army' && d.domain === 'naval') return 'Armies cannot include flotillas';
  if (f.kind === 'taskforce' && d.domain === 'land') return 'Put battalions in a regiment first';
  if (f.units.length + f.children.length >= 14) return 'Formation is full';
  return null;
}

export function canAssignFormation(state: GameState, child: Formation, parent: Formation): string | null {
  if (child.id === parent.id) return 'Cannot nest a formation in itself';
  if (child.owner !== parent.owner) return 'Not your formation';
  if (child.kind !== 'regiment') return 'Only regiments can join armies and task forces';
  if (parent.kind === 'regiment') return 'Regiments cannot contain regiments';
  if (parent.kind === 'taskforce') {
    const cap = formationUnits(state, parent).reduce((s, u) => s + (UNIT_BY_ID[u.type]?.transport ?? 0), 0);
    const carried = parent.children.length;
    if (carried >= cap) return 'Task force needs Amphibious Groups to carry regiments (2 each)';
  }
  if (parent.units.length + parent.children.length >= 14) return 'Formation is full';
  return null;
}

export function assignUnit(state: GameState, u: Unit, f: Formation) {
  detachUnitRaw(state, u);
  u.parent = f.id;
  f.units.push(u.id);
  u.org = Math.min(u.org, 0.6); // reorganising
  f.manned = true;
}

export function assignFormation(state: GameState, child: Formation, parent: Formation) {
  if (child.parent) {
    const old = state.formations[child.parent];
    if (old) old.children = old.children.filter((id) => id !== child.id);
  }
  child.parent = parent.id;
  child.order = { kind: 'hold' };
  child.pos = { ...parent.pos, path: [], pathRegions: [] };
  parent.children.push(child.id);
  parent.manned = true;
}

// ---------------- Orders ----------------

function landPassable(state: GameState, owner: string) {
  return (id: number) => {
    const ctrl = state.regions[id].controller;
    return ctrl === owner || hasMilitaryAccess(state, owner, ctrl) || areEnemies(state, owner, ctrl);
  };
}

function regionAnchor(world: StaticWorld, region: number): [number, number] {
  const port = world.portsByRegion.get(region)?.[0];
  if (port) return [port.lon, port.lat];
  const r = world.regions[region];
  return [r.lon, r.lat];
}

export function issueOrder(state: GameState, world: StaticWorld, f: Formation, order: Order): string | null {
  if (f.parent) return 'Give orders to the top-level formation';
  const domain = formationDomain(state, f);
  f.pos.path = []; f.pos.pathRegions = []; f.pos.progress = 0;
  switch (order.kind) {
    case 'hold':
      f.order = order;
      return null;
    case 'move': {
      if (domain === 'land') {
        const route = landPath(world, f.pos.region, order.target, landPassable(state, f.owner));
        if (route) {
          f.pos.pathRegions = route;
          f.pos.path = route.map((id) => [world.regions[id].lon, world.regions[id].lat] as [number, number]);
          f.order = order;
          return null;
        }
        // Sea transport between coastal regions
        if (world.regions[f.pos.region].coastal && world.regions[order.target].coastal) {
          const sp = seaPath(world, regionAnchor(world, f.pos.region), regionAnchor(world, order.target));
          if (!sp) return 'No route found';
          f.pos.path = [...sp, [world.regions[order.target].lon, world.regions[order.target].lat]];
          f.pos.pathRegions = [order.target];
          f.pos.atSea = true;
          f.order = order;
          return null;
        }
        return 'No land route. Target must be reachable through your, allied or enemy territory (or both coastal for sea transport).';
      }
      if (domain === 'air') {
        const tc = state.regions[order.target].controller;
        if (tc !== f.owner && !hasMilitaryAccess(state, f.owner, tc)) return 'Air groups can only rebase to friendly territory';
        const t = world.regions[order.target];
        f.pos.path = [[t.lon, t.lat]];
        f.pos.pathRegions = [order.target];
        f.order = order;
        return null;
      }
      // naval: sail to the region's coast
      if (!world.regions[order.target].coastal) return 'Fleets can only sail to coastal regions';
      {
        const sp = seaPath(world, [f.pos.lon, f.pos.lat], regionAnchor(world, order.target));
        if (!sp) return 'No sea route found';
        f.pos.path = sp; f.pos.pathRegions = [order.target]; f.pos.atSea = true; f.order = order;
        return null;
      }
    }
    case 'patrol':
    case 'blockade': {
      if (domain !== 'naval') return 'Only naval task forces can patrol or blockade';
      const dest: [number, number] = order.kind === 'patrol' ? [order.lon, order.lat] : regionAnchor(world, order.target);
      if (order.kind === 'blockade' && !world.regions[order.target].coastal) return 'Target must be coastal';
      const sp = seaPath(world, [f.pos.lon, f.pos.lat], dest);
      if (!sp) return 'No sea route found';
      // stop just offshore for blockades
      if (order.kind === 'blockade') sp.pop();
      f.pos.path = sp; f.pos.atSea = true; f.order = order;
      return null;
    }
    case 'amphibious': {
      if (domain !== 'naval') return 'Amphibious landings need a naval task force';
      if (!f.children.length) return 'Task force carries no regiments';
      if (!world.regions[order.target].coastal) return 'Target must be coastal';
      const sp = seaPath(world, [f.pos.lon, f.pos.lat], regionAnchor(world, order.target));
      if (!sp) return 'No sea route found';
      f.pos.path = sp; f.pos.atSea = true; f.order = order;
      return null;
    }
    case 'airSuperiority':
    case 'groundSupport':
    case 'strategicBombing': {
      if (domain === 'land') return 'Armies cannot fly missions; add squadrons to a task force';
      const units = formationUnits(state, f).filter((u) => UNIT_BY_ID[u.type].domain === 'air');
      if (!units.length) return 'No aircraft in this formation';
      const range = Math.min(...units.map((u) => UNIT_BY_ID[u.type].range ?? 0));
      const t = world.regions[order.target];
      const d = haversineKm(f.pos.lon, f.pos.lat, t.lon, t.lat);
      if (d > range) return `Target out of range (${Math.round(d)} km > ${range} km). Rebase closer.`;
      f.order = order;
      return null;
    }
  }
}

// ---------------- Production ----------------

export function productionCapacity(state: GameState, countryId: string, domain: UnitDomain, region: number) {
  const r = state.regions[region];
  if (!r || r.owner !== countryId || r.controller !== countryId) return 0;
  const b = domain === 'land' ? 'military_base' : domain === 'air' ? 'air_base' : 'naval_base';
  const lvl = r.buildings[b] ?? 0;
  return domain === 'land' ? lvl * 3 : lvl * 2;
}

export function unitCost(state: GameState, countryId: string, type: string) {
  const c = state.countries[countryId];
  const def = UNIT_BY_ID[type];
  return def.cost * priceLevel(c, countryPop(state, countryId));
}

export function queueUnit(state: GameState, countryId: string, type: string, region: number): string | null {
  const c = state.countries[countryId];
  const def = UNIT_BY_ID[type];
  if (!c || !def) return 'Unknown unit';
  if (Math.floor(c.tech.military) < def.techReq) return `Requires military tech ${def.techReq}`;
  const cap = productionCapacity(state, countryId, def.domain, region);
  if (cap <= 0) return `Needs a ${def.domain === 'land' ? 'Army Base' : def.domain === 'air' ? 'Air Base' : 'Naval Base'} in this region`;
  const busy = c.production.filter((p) => p.region === region && UNIT_BY_ID[p.unitType].domain === def.domain).length;
  if (busy >= cap) return 'Production lines in this region are full — upgrade the base';
  if (c.manpower < def.manpower) return 'Not enough manpower';
  const cost = unitCost(state, countryId, type);
  if (c.milFund + c.treasury < cost) return 'Not enough funds';
  const fromFund = Math.min(c.milFund, cost);
  c.milFund -= fromFund;
  c.treasury -= cost - fromFund;
  c.manpower -= def.manpower;
  const n = unitsOf(state, countryId).filter((u) => u.type === type).length + c.production.filter((p) => p.unitType === type).length + 1;
  c.production.push({ id: newId(state, 'q'), unitType: type, region, progress: 0, days: def.days, name: `${ordinal(n)} ${def.name}` });
  return null;
}

function productionDaily(state: GameState) {
  for (const c of Object.values(state.countries)) {
    if (!c.production.length) continue;
    let arms = 0;
    for (const r of state.regions) if (r.owner === c.id) arms += r.buildings.arms_factory ?? 0;
    const speed = 1 + Math.min(0.8, arms * 0.1);
    for (const item of [...c.production]) {
      if (state.regions[item.region].controller !== c.id) continue; // stalled
      item.progress += speed;
      if (item.progress >= item.days) {
        c.production = c.production.filter((p) => p.id !== item.id);
        const id = newId(state, 'u');
        state.units[id] = { id, type: item.unitType, owner: c.id, name: item.name, strength: 1, org: 0.7, xp: 0, parent: null, home: item.region, training: 0 };
        if (c.playerId) addNews(state, 'military', `${item.name} is ready for service`, [c.id], item.region);
      }
    }
  }
}

// ---------------- Daily simulation ----------------

function setPosToward(f: Formation, lon: number, lat: number, frac: number) {
  let dl = lon - f.pos.lon;
  if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
  f.pos.lon += dl * frac;
  if (f.pos.lon > 180) f.pos.lon -= 360; if (f.pos.lon < -180) f.pos.lon += 360;
  f.pos.lat += (lat - f.pos.lat) * frac;
}

function minSpeed(state: GameState, f: Formation, domain: UnitDomain) {
  const units = formationUnits(state, f).filter((u) => UNIT_BY_ID[u.type].domain === domain);
  if (!units.length) return domain === 'naval' ? 600 : 30;
  return Math.min(...units.map((u) => UNIT_BY_ID[u.type].speed));
}

/** Advance along a list of waypoints by km. Returns true when the path is exhausted. */
function travel(f: Formation, km: number): boolean {
  while (km > 0 && f.pos.path.length) {
    const [tl, tt] = f.pos.path[0];
    const d = haversineKm(f.pos.lon, f.pos.lat, tl, tt);
    if (d <= km) { f.pos.lon = tl; f.pos.lat = tt; f.pos.path.shift(); km -= d; }
    else { setPosToward(f, tl, tt, km / d); km = 0; }
  }
  return f.pos.path.length === 0;
}

function syncChildren(state: GameState, f: Formation) {
  for (const cid of f.children) {
    const c = state.formations[cid];
    if (!c) continue;
    c.pos.region = f.pos.region; c.pos.lon = f.pos.lon; c.pos.lat = f.pos.lat; c.pos.atSea = f.pos.atSea;
    c.inCombat = f.inCombat;
    syncChildren(state, c);
  }
}

interface Attack { f: Formation; target: number }

export function militaryDaily(state: GameState, world: StaticWorld) {
  productionDaily(state);
  const tops = Object.values(state.formations).filter((f) => !f.parent);
  const attacks: Attack[] = [];
  const domains = new Map<string, UnitDomain>();
  for (const f of tops) domains.set(f.id, formationDomain(state, f));

  for (const f of tops) {
    f.inCombat = false;
    const domain = domains.get(f.id)!;
    if (domain === 'land') stepLand(state, world, f, attacks);
    else if (domain === 'naval') stepNaval(state, world, f);
    else stepAirMove(state, world, f);
  }

  resolveLandBattles(state, world, attacks);
  resolveAir(state, world, tops, domains);
  resolveNaval(state, world, tops, domains);

  // Recovery, attrition and reserves
  const topOfUnit = new Map<string, Formation>();
  for (const f of tops) if (state.formations[f.id]) for (const u of formationUnits(state, f)) topOfUnit.set(u.id, f);
  for (const u of Object.values(state.units)) {
    const c = state.countries[u.owner];
    if (!c) { delete state.units[u.id]; continue; }
    const f = u.parent ? topOfUnit.get(u.id) ?? null : null;
    const inCombat = f?.inCombat ?? false;
    if (!inCombat) {
      u.org = Math.min(1, u.org + 0.03 * c.militaryReadiness);
      const regionId = f ? f.pos.region : u.home;
      const friendly = state.regions[regionId]?.controller === u.owner;
      if (u.strength < 1 && friendly && c.manpower > 0 && c.milFund > 0) {
        const def = UNIT_BY_ID[u.type];
        const add = Math.min(0.02, 1 - u.strength);
        u.strength += add;
        c.manpower -= def.manpower * add;
        c.milFund -= def.cost * add * 0.3;
      }
    }
    if (!u.parent) {
      // reserves in captured regions flee to the capital
      if (state.regions[u.home]?.controller !== u.owner) u.home = c.capital;
    }
  }
  for (const f of tops) syncChildren(state, f);
  pruneFormations(state);
}

function stepLand(state: GameState, world: StaticWorld, f: Formation, attacks: Attack[]) {
  if (!f.pos.path.length) {
    f.pos.atSea = false;
    if (f.order.kind === 'move') f.order = { kind: 'hold' };
    return;
  }
  const c = state.countries[f.owner];
  // At sea (transport)
  if (f.pos.atSea) {
    const done = travel(f, 400 * (c?.militaryReadiness ?? 1));
    if (done) {
      const target = f.pos.pathRegions[0];
      f.pos.atSea = false;
      if (state.regions[target].controller === f.owner || hasMilitaryAccess(state, f.owner, state.regions[target].controller)) {
        f.pos.region = target; f.pos.pathRegions = [];
      } else if (areEnemies(state, f.owner, state.regions[target].controller)) {
        // stay offshore and assault
        f.pos.path = [[world.regions[target].lon, world.regions[target].lat]];
        f.pos.atSea = true;
        attacks.push({ f, target });
        f.amphibious = true;
      } else { f.order = { kind: 'hold' }; f.pos.pathRegions = []; f.pos.path = []; }
    }
    return;
  }
  const next = f.pos.pathRegions[0];
  const nr = state.regions[next];
  if (!nr) { f.pos.path = []; f.pos.pathRegions = []; return; }
  const enemy = areEnemies(state, f.owner, nr.controller);
  const passable = nr.controller === f.owner || hasMilitaryAccess(state, f.owner, nr.controller) || enemy;
  if (!passable) { f.order = { kind: 'hold' }; f.pos.path = []; f.pos.pathRegions = []; return; }
  const from = world.regions[f.pos.region], to = world.regions[next];
  const total = haversineKm(from.lon, from.lat, to.lon, to.lat);
  if (enemy) {
    // advance to the border and attack
    const borderFrac = 0.42;
    const targetLon = from.lon + (to.lon - from.lon) * borderFrac, targetLat = from.lat + (to.lat - from.lat) * borderFrac;
    setPosToward(f, targetLon, targetLat, 0.5);
    attacks.push({ f, target: next });
    return;
  }
  const speed = minSpeed(state, f, 'land') * (c?.militaryReadiness ?? 1) * (f.stance === 'aggressive' ? 1.1 : 1) / ({ plains: 1, forest: 1.3, hills: 1.4, jungle: 1.8, mountains: 2, desert: 1.3, arctic: 2 }[to.terrain] ?? 1);
  f.pos.progress += speed;
  if (f.pos.progress >= total) {
    f.pos.progress = 0;
    f.pos.region = next;
    f.pos.lon = to.lon; f.pos.lat = to.lat;
    f.pos.pathRegions.shift();
    f.pos.path.shift();
  } else {
    const t = f.pos.progress / Math.max(1, total);
    f.pos.lon = from.lon + lonDelta(from.lon, to.lon) * t;
    f.pos.lat = from.lat + (to.lat - from.lat) * t;
  }
}

function lonDelta(a: number, b: number) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }

function stepNaval(state: GameState, world: StaticWorld, f: Formation) {
  const c = state.countries[f.owner];
  if (f.pos.path.length) {
    const done = travel(f, minSpeed(state, f, 'naval') * (c?.militaryReadiness ?? 1));
    if (done) {
      if (f.order.kind === 'move') {
        f.pos.region = f.pos.pathRegions[0] ?? f.pos.region;
        f.pos.atSea = false; f.order = { kind: 'hold' };
      } else if (f.order.kind === 'amphibious') {
        landAmphibious(state, world, f, f.order.target);
      }
    }
  }
  // Blockade effect & sea region bookkeeping happen in resolveNaval
  // nearest region (for supply/ownership checks)
  if (f.pos.atSea) {
    let best = f.pos.region, bd = Infinity;
    for (const id of [f.pos.region, ...world.regions[f.pos.region].nb]) {
      const r = world.regions[id];
      const d = haversineKm(r.lon, r.lat, f.pos.lon, f.pos.lat);
      if (d < bd) { bd = d; best = id; }
    }
    f.pos.region = best;
  }
}

function landAmphibious(state: GameState, world: StaticWorld, tf: Formation, target: number) {
  // Regiments disembark as a new army that assaults the target region.
  const army = makeFormation(state, world, tf.owner, 'army', `${tf.name} Landing Force`, tf.pos.region);
  army.pos.lon = tf.pos.lon; army.pos.lat = tf.pos.lat; army.pos.atSea = true;
  for (const cid of [...tf.children]) {
    const reg = state.formations[cid];
    if (!reg) continue;
    reg.parent = army.id; army.children.push(cid);
  }
  tf.children = [];
  army.manned = true;
  army.pos.path = [[world.regions[target].lon, world.regions[target].lat]];
  army.pos.pathRegions = [target];
  army.order = { kind: 'move', target };
  tf.order = { kind: 'hold' };
  addNews(state, 'military', `${state.countries[tf.owner].name} launches an amphibious landing at ${world.regions[target].n}`, [tf.owner, state.regions[target].controller], target, true);
}

function stepAirMove(_state: GameState, world: StaticWorld, f: Formation) {
  if (f.order.kind === 'move' && f.pos.path.length) {
    const done = travel(f, 1500);
    if (done) { f.pos.region = f.pos.pathRegions[0] ?? f.pos.region; f.order = { kind: 'hold' }; }
  }
  void world;
}

// ---------------- Land combat ----------------

function regionGarrisonMax(state: GameState, world: StaticWorld, id: number) {
  const r = state.regions[id];
  const c = state.countries[r.controller];
  return (1.5 + Math.sqrt(world.regions[id].pop / 1e6) * 1.5) * (1 + r.fort * 0.15) * (c ? 1 + c.tech.military * 0.05 : 1);
}

const garrison = new Map<number, number>(); // transient militia health, rebuilt when no battle

function addCasualties(state: GameState, owner: string, enemy: string, n: number) {
  for (const w of warsOf(state, owner)) {
    if (w.attackers.includes(enemy) || w.defenders.includes(enemy)) { w.casualties[owner] = (w.casualties[owner] ?? 0) + n; return; }
  }
}

function recordBattle(state: GameState, world: StaticWorld, target: number, attacker: string, defender: string) {
  const w: War | undefined = warsOf(state, attacker).find((x) => x.attackers.includes(defender) || x.defenders.includes(defender));
  if (!w) return;
  const b = w.battles.find((x) => x.region === target);
  if (b) { b.intensity = Math.min(1, b.intensity + 0.2); b.started = state.tick; }
  else w.battles.push({ region: target, lon: world.regions[target].lon, lat: world.regions[target].lat, attacker, defender, started: state.tick, intensity: 0.6 });
}

function damageUnits(state: GameState, units: Unit[], loss: number, orgLoss: number, enemy: string) {
  for (const u of units) {
    const l = loss * (0.7 + Math.random() * 0.6);
    const before = u.strength;
    u.strength = Math.max(0, u.strength - l);
    u.org = Math.max(0, u.org - orgLoss * (0.7 + Math.random() * 0.6));
    u.xp = Math.min(1, u.xp + 0.004);
    addCasualties(state, u.owner, enemy, (before - u.strength) * UNIT_BY_ID[u.type].manpower);
    if (u.strength < 0.04) destroyUnit(state, u);
  }
}

function resolveLandBattles(state: GameState, world: StaticWorld, attacks: Attack[]) {
  const byTarget = new Map<number, Attack[]>();
  for (const a of attacks) { if (!byTarget.has(a.target)) byTarget.set(a.target, []); byTarget.get(a.target)!.push(a); }
  // regions not under attack recover militia
  for (const [id, g] of garrison) if (!byTarget.has(id)) { const max = regionGarrisonMax(state, world, id); const ng = g + max * 0.05; if (ng >= max) garrison.delete(id); else garrison.set(id, ng); }

  const tops = Object.values(state.formations).filter((f) => !f.parent && !f.pos.atSea);
  for (const [target, atks] of byTarget) {
    const region = state.regions[target];
    const defOwner = region.controller;
    const validAtks = atks.filter((a) => areEnemies(state, a.f.owner, defOwner));
    if (!validAtks.length) continue;
    const attackerCountry = validAtks[0].f.owner;
    const defenders = tops.filter((f) => f.pos.region === target && f.pos.pathRegions.length === 0 && formationDomainCached(state, f) === 'land'
      && (f.owner === defOwner || (areEnemies(state, f.owner, attackerCountry) && hasMilitaryAccess(state, f.owner, defOwner))));
    const attUnits = validAtks.flatMap((a) => formationUnits(state, a.f).filter((u) => UNIT_BY_ID[u.type].domain !== 'naval'));
    const defUnits = defenders.flatMap((f) => formationUnits(state, f).filter((u) => UNIT_BY_ID[u.type].domain !== 'naval'));
    if (!attUnits.length) continue;

    const terrain = world.regions[target].terrain;
    const tdef = TERRAIN_DEFENSE[terrain] ?? 1;
    const airAtt = airSupport(state, target, attackerCountry), airDef = airSupport(state, target, defOwner);
    const amph = validAtks.some((a) => a.f.amphibious);
    let A = 0;
    for (const u of attUnits) {
      const d = UNIT_BY_ID[u.type];
      let a = d.attack * u.strength * (0.3 + 0.7 * u.org) * (1 + u.xp * 0.5);
      if (amph && !d.amphibious) a *= 0.5;
      if (d.id === 'special_forces') a *= Math.max(1, tdef);
      A += a;
    }
    A = A * techMult(state, attackerCountry) + airAtt;
    let D = 0;
    for (const u of defUnits) {
      const d = UNIT_BY_ID[u.type];
      D += d.defense * u.strength * (0.3 + 0.7 * u.org) * (1 + u.xp * 0.5);
    }
    const gMax = regionGarrisonMax(state, world, target);
    const g = garrison.get(target) ?? gMax;
    D = (D * techMult(state, defOwner) + g * 5) * tdef * (1 + region.fort * 0.08) + airDef;
    // stance
    const stanceAtt = validAtks[0].f.stance === 'aggressive' ? 1.15 : validAtks[0].f.stance === 'defensive' ? 0.85 : 1;
    A *= stanceAtt;

    const total = A + D || 1;
    const intensity = 0.05;
    damageUnits(state, defUnits, intensity * (A / total) * 0.7, intensity * 2.2 * (A / total), attackerCountry);
    damageUnits(state, attUnits, intensity * (D / total) * 0.6, intensity * 2 * (D / total), defOwner);
    garrison.set(target, Math.max(0, g - (A / total) * gMax * 0.08));
    region.devastation = Math.min(100, region.devastation + 0.4);
    region.unrest = Math.min(100, region.unrest + 0.3);
    for (const a of validAtks) a.f.inCombat = true;
    for (const d of defenders) d.inCombat = true;
    recordBattle(state, world, target, attackerCountry, defOwner);

    // Outcome
    const remainingDef = defUnits.filter((u) => state.units[u.id]);
    const defOrg = remainingDef.length ? remainingDef.reduce((s, u) => s + u.org, 0) / remainingDef.length : 0;
    const gLeft = garrison.get(target) ?? 0;
    if ((remainingDef.length === 0 || defOrg < 0.12) && gLeft < gMax * 0.15) {
      // defenders retreat
      for (const d of defenders) retreat(state, world, d, attackerCountry);
      region.controller = attackerCountry;
      garrison.delete(target);
      region.fort = 0;
      const winner = validAtks.sort((a, b) => formationStrength(state, b.f).attack - formationStrength(state, a.f).attack)[0].f;
      for (const a of validAtks) {
        if (a.f !== winner) continue;
        a.f.pos.region = target; a.f.pos.lon = world.regions[target].lon; a.f.pos.lat = world.regions[target].lat;
        a.f.pos.atSea = false; a.f.pos.progress = 0;
        if (a.f.pos.pathRegions[0] === target) { a.f.pos.pathRegions.shift(); a.f.pos.path.shift(); }
        else { a.f.pos.pathRegions = []; a.f.pos.path = []; }
        a.f.amphibious = false;
      }
      addNews(state, 'military', `${state.countries[attackerCountry].name} captures ${world.regions[target].n} from ${state.countries[defOwner]?.name}`, [attackerCountry, defOwner, region.owner], target, Boolean(state.countries[attackerCountry].playerId || state.countries[defOwner]?.playerId || state.countries[region.owner]?.playerId));
    } else {
      // attackers exhausted?
      for (const a of validAtks) {
        const fs = formationStrength(state, a.f);
        if (fs.count === 0 || fs.org < 0.12) {
          a.f.pos.path = []; a.f.pos.pathRegions = []; a.f.order = { kind: 'hold' };
          if (a.f.amphibious) {
            // failed landing: survivors are lost at sea
            for (const u of formationUnits(state, a.f)) destroyUnit(state, u);
          } else {
            a.f.pos.lon = world.regions[a.f.pos.region].lon; a.f.pos.lat = world.regions[a.f.pos.region].lat;
          }
        }
      }
    }
  }
}

const domainCache = new Map<string, { tick: number; d: UnitDomain }>();
function formationDomainCached(state: GameState, f: Formation): UnitDomain {
  const c = domainCache.get(f.id);
  if (c && c.tick === state.tick) return c.d;
  const d = formationDomain(state, f);
  domainCache.set(f.id, { tick: state.tick, d });
  return d;
}

function retreat(state: GameState, world: StaticWorld, f: Formation, enemy: string) {
  const options = world.regions[f.pos.region].nb.filter((id) => {
    const ctrl = state.regions[id].controller;
    return (ctrl === f.owner || hasMilitaryAccess(state, f.owner, ctrl)) && !areEnemies(state, ctrl, f.owner);
  });
  if (!options.length) {
    // encircled: destroyed
    for (const u of formationUnits(state, f)) { addCasualties(state, u.owner, enemy, u.strength * UNIT_BY_ID[u.type].manpower); destroyUnit(state, u); }
    addNews(state, 'military', `${f.name} of ${state.countries[f.owner]?.name} is encircled and destroyed`, [f.owner, enemy], f.pos.region, true);
    return;
  }
  const to = options[0];
  f.pos.region = to; f.pos.lon = world.regions[to].lon; f.pos.lat = world.regions[to].lat;
  f.pos.path = []; f.pos.pathRegions = []; f.order = { kind: 'hold' };
  for (const u of formationUnits(state, f)) u.org = Math.max(0, u.org - 0.2);
}

// ---------------- Air ----------------

const airSupportCache = new Map<string, number>();
function airSupport(_state: GameState, region: number, side: string) {
  return airSupportCache.get(`${region}|${side}`) ?? 0;
}

function resolveAir(state: GameState, world: StaticWorld, tops: Formation[], domains: Map<string, UnitDomain>) {
  airSupportCache.clear();
  // Missions grouped by target region
  type Mission = { f: Formation; kind: 'airSuperiority' | 'groundSupport' | 'strategicBombing'; target: number };
  const missions: Mission[] = [];
  for (const f of tops) {
    const o = f.order;
    if (o.kind === 'airSuperiority' || o.kind === 'groundSupport' || o.kind === 'strategicBombing') missions.push({ f, kind: o.kind, target: o.target });
    // armies with attached helicopters give organic ground support where they fight
    if (domains.get(f.id) === 'land' && f.inCombat) {
      const helis = formationUnits(state, f).filter((u) => UNIT_BY_ID[u.type].domain === 'air');
      if (helis.length) {
        const target = f.pos.pathRegions[0] ?? f.pos.region;
        const k = `${target}|${f.owner}`;
        airSupportCache.set(k, (airSupportCache.get(k) ?? 0) + helis.reduce((s, u) => s + UNIT_BY_ID[u.type].attack * u.strength, 0) * 0.6);
      }
    }
  }
  const byTarget = new Map<number, Mission[]>();
  for (const m of missions) { if (!byTarget.has(m.target)) byTarget.set(m.target, []); byTarget.get(m.target)!.push(m); }
  for (const [target, ms] of byTarget) {
    const owners = [...new Set(ms.map((m) => m.f.owner))];
    const region = state.regions[target];
    // Air power per side over the region (fighters + local air defence)
    const airPower = new Map<string, number>();
    for (const m of ms) {
      const units = formationUnits(state, m.f).filter((u) => UNIT_BY_ID[u.type].domain === 'air');
      const awacs = units.some((u) => u.type === 'awacs') ? 1.25 : 1;
      const ap = units.reduce((s, u) => s + UNIT_BY_ID[u.type].air * u.strength * (0.5 + 0.5 * u.org), 0) * awacs * techMult(state, m.f.owner);
      airPower.set(m.f.owner, (airPower.get(m.f.owner) ?? 0) + ap);
    }
    // ground-based air defence of the controller
    const ctrl = region.controller;
    let groundAA = (region.buildings.air_defense ?? 0) * 8;
    for (const f of tops) if (f.owner === ctrl && f.pos.region === target) groundAA += formationUnits(state, f).reduce((s, u) => s + (UNIT_BY_ID[u.type].domain === 'land' ? UNIT_BY_ID[u.type].air * u.strength : 0), 0);
    airPower.set(ctrl, (airPower.get(ctrl) ?? 0) + groundAA * 0.7);

    for (const m of ms) {
      const enemyAir = [...airPower.entries()].filter(([o]) => o !== m.f.owner && areEnemies(state, o, m.f.owner)).reduce((s, [, v]) => s + v, 0);
      const myAir = airPower.get(m.f.owner) ?? 0;
      const superiority = myAir + enemyAir > 0 ? myAir / (myAir + enemyAir) : 1;
      const units = formationUnits(state, m.f).filter((u) => UNIT_BY_ID[u.type].domain === 'air');
      const hostile = areEnemies(state, m.f.owner, ctrl) || owners.some((o) => o !== m.f.owner && areEnemies(state, o, m.f.owner));
      if (!hostile) continue;
      m.f.inCombat = true;
      // losses
      if (enemyAir > 0) {
        const enemies = [...airPower.keys()].filter((o) => areEnemies(state, o, m.f.owner));
        damageUnits(state, units, 0.012 * (1 - superiority) * 2, 0.04, enemies[0] ?? ctrl);
      }
      const strike = units.reduce((s, u) => s + UNIT_BY_ID[u.type].attack * u.strength, 0) * techMult(state, m.f.owner) * (0.3 + 0.7 * superiority);
      if (m.kind === 'groundSupport') {
        const k = `${target}|${m.f.owner}`;
        airSupportCache.set(k, (airSupportCache.get(k) ?? 0) + strike);
        // also directly hits defending ground troops
        for (const f of tops) if (f.pos.region === target && areEnemies(state, f.owner, m.f.owner) && domains.get(f.id) === 'land') {
          damageUnits(state, formationUnits(state, f), 0.002 * strike / 20, 0.01, m.f.owner);
        }
      } else if (m.kind === 'strategicBombing' && areEnemies(state, m.f.owner, region.owner)) {
        region.devastation = Math.min(100, region.devastation + strike * 0.02);
        region.productivity *= 1 - Math.min(0.003, strike * 0.00005);
        if (Math.random() < strike * 0.002) {
          const bs = Object.keys(region.buildings);
          if (bs.length) {
            const b = bs[Math.floor(Math.random() * bs.length)];
            region.buildings[b]--;
            if (region.buildings[b] <= 0) delete region.buildings[b];
            addNews(state, 'military', `Air strikes destroy infrastructure in ${world.regions[target].n}`, [m.f.owner, region.owner], target);
          }
        }
        recordBattle(state, world, target, m.f.owner, region.owner);
      }
    }
  }
}

// ---------------- Naval ----------------

export const blockaded = new Set<number>();

function resolveNaval(state: GameState, _world: StaticWorld, tops: Formation[], domains: Map<string, UnitDomain>) {
  blockaded.clear();
  const fleets = tops.filter((f) => domains.get(f.id) === 'naval');
  // Engagements between hostile fleets within 350 km
  for (let i = 0; i < fleets.length; i++) {
    for (let j = i + 1; j < fleets.length; j++) {
      const a = fleets[i], b = fleets[j];
      if (!areEnemies(state, a.owner, b.owner)) continue;
      if (haversineKm(a.pos.lon, a.pos.lat, b.pos.lon, b.pos.lat) > 350) continue;
      const sa = formationStrength(state, a), sb = formationStrength(state, b);
      const pa = (sa.naval + sa.air * 0.3) * techMult(state, a.owner), pb = (sb.naval + sb.air * 0.3) * techMult(state, b.owner);
      const t = pa + pb || 1;
      damageUnits(state, formationUnits(state, a), 0.04 * (pb / t), 0.1 * (pb / t), b.owner);
      damageUnits(state, formationUnits(state, b), 0.04 * (pa / t), 0.1 * (pa / t), a.owner);
      a.inCombat = b.inCombat = true;
      const war = warsOf(state, a.owner).find((w) => w.attackers.includes(b.owner) || w.defenders.includes(b.owner));
      if (war) {
        const ex = war.battles.find((x) => Math.abs(x.lon - a.pos.lon) < 2 && Math.abs(x.lat - a.pos.lat) < 2);
        if (ex) ex.intensity = Math.min(1, ex.intensity + 0.2);
        else war.battles.push({ region: -1, lon: (a.pos.lon + b.pos.lon) / 2, lat: (a.pos.lat + b.pos.lat) / 2, attacker: a.owner, defender: b.owner, started: state.tick, intensity: 0.7 });
      }
    }
  }
  // Blockades
  for (const f of fleets) {
    if (f.order.kind !== 'blockade' || f.pos.path.length) continue;
    const target = f.order.target;
    if (!areEnemies(state, f.owner, state.regions[target].owner)) continue;
    blockaded.add(target);
    const r = state.regions[target];
    r.productivity *= 1 - 0.0004;
    f.inCombat = true;
    // coastal defence shoots back
    const def = (r.buildings.naval_base ?? 0) * 3 + (r.buildings.fortifications ?? 0) + (r.buildings.air_defense ?? 0);
    if (def > 0) damageUnits(state, formationUnits(state, f), 0.002 * def, 0.01, r.controller);
  }
  // Transports at sea are vulnerable to hostile fleets
  for (const f of tops) {
    if (domains.get(f.id) !== 'land' || !f.pos.atSea) continue;
    for (const e of fleets) {
      if (!areEnemies(state, f.owner, e.owner)) continue;
      if (haversineKm(f.pos.lon, f.pos.lat, e.pos.lon, e.pos.lat) > 300) continue;
      const pe = formationStrength(state, e).naval;
      damageUnits(state, formationUnits(state, f), 0.01 * pe / 10, 0.05, e.owner);
    }
  }
}

export function clampOrg(v: number) { return clamp(v, 0, 1); }
