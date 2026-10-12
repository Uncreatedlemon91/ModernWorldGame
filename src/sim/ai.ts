import type { StaticWorld } from '../data/static';
import type { Country, GameState, TreatyType } from './types';
import { Rng } from './rng';
import { LAWS } from './content/laws';
import { UNIT_BY_ID } from './content/units';
import { BUILDINGS } from './content/buildings';
import { clamp } from './util';
import {
  acceptProposal, aiProposalScore, areEnemies, atWar, createProposal, declareWar, defenders, hasTreaty, opinion, rejectProposal, warsOf, warSide,
} from './diplomacy';
import { canDecree, ideologyDistance, proposeBill } from './politics';
import { startConstruction, buildingCost } from './construction';
import { unitsOf, formationDomain, formationStrength, issueOrder, queueUnit, assignUnit, assignFormation, productionCapacity } from './military';
import { makeFormation, ordinal } from './init';
import { addNews } from './news';

/** Is this country run by the AI this month? (No player governs it.) */
export const aiControlled = (state: GameState, c: Country) => !state.parties[c.rulingParty]?.playerId;

export function aiDaily(state: GameState, world: StaticWorld, rng: Rng) {
  // Respond to proposals addressed to AI countries
  for (const p of Object.values(state.proposals)) {
    const to = state.countries[p.to];
    if (!to || !aiControlled(state, to)) continue;
    if (state.tick - p.created < 2) continue; // "consider" for a couple of days
    if (aiProposalScore(state, p) > 0) acceptProposal(state, world, p);
    else rejectProposal(state, p);
  }
  // War operations every 3 days, staggered
  for (const c of Object.values(state.countries)) {
    if (!aiControlled(state, c)) continue;
    if ((state.tick + c.id.charCodeAt(0)) % 3 !== 0) continue;
    if (atWar(state, c.id)) aiWarOps(state, world, c, rng);
  }
}

export function aiMonthly(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  if (!aiControlled(state, c)) return;
  aiBudget(state, c);
  if (rng.chance(0.06)) aiLaws(state, c, rng);
  aiBuild(state, world, c, rng);
  aiDiplomacy(state, world, c, rng);
  aiMilitaryProduction(state, world, c, rng);
  aiOrganize(state, world, c);
  aiPeace(state, c);
}

function aiBudget(state: GameState, c: Country) {
  const deficit = (c.expenses - c.revenue) / c.gdp;
  const war = atWar(state, c.id);
  const targetMil = war ? Math.max(c.budget.military, 4) : c.budget.military;
  c.budget.military += (targetMil - c.budget.military) * 0.3;
  if (deficit > 0.04) {
    c.taxes.income = clamp(c.taxes.income + 0.5, 0, 60);
    c.taxes.sales = clamp(c.taxes.sales + 0.3, 0, 30);
    c.budget.welfare = Math.max(1, c.budget.welfare - 0.2);
    c.budget.infrastructure = Math.max(1, c.budget.infrastructure - 0.1);
  } else if (deficit < -0.01) {
    c.budget.infrastructure = Math.min(6, c.budget.infrastructure + 0.1);
    c.budget.education = Math.min(7, c.budget.education + 0.05);
    c.budget.health = Math.min(9, c.budget.health + 0.05);
  }
  if (c.energy < 1) c.budget.infrastructure = Math.min(6, c.budget.infrastructure + 0.1);
}

function aiLaws(state: GameState, c: Country, rng: Rng) {
  const ruler = state.parties[c.rulingParty];
  if (!ruler) return;
  const law = LAWS[Math.floor(rng.next() * LAWS.length)];
  if (law.id === 'emergency_powers' || law.id === 'electoral_system' || law.id === 'term_limits') return;
  const cur = law.options.find((o) => o.id === c.laws[law.id]);
  const best = [...law.options].sort((a, b) => ideologyDistance(a.ideology, ruler.ideology) - ideologyDistance(b.ideology, ruler.ideology))[0];
  if (!cur || best.id === cur.id) return;
  if (ideologyDistance(cur.ideology, ruler.ideology) - ideologyDistance(best.ideology, ruler.ideology) < 0.3) return;
  if (canDecree(c)) c.laws[law.id] = best.id;
  else proposeBill(state, c, ruler.id, law.id, best.id);
}

function aiBuild(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  const regs = state.regions.filter((r) => r.owner === c.id && r.controller === c.id);
  if (!regs.length) return;
  let builds = c.gdp > 2000 ? 3 : c.gdp > 300 ? 2 : 1;
  for (let attempt = 0; attempt < 6 && builds > 0; attempt++) {
    let building: string;
    if (c.energy < 1.02) building = rng.pick(['power_gas', 'power_renew', c.gdp > 300 ? 'power_nuclear' : 'power_gas']);
    else if (atWar(state, c.id) && rng.chance(0.5)) building = rng.pick(['fortifications', 'arms_factory', 'military_base', 'air_defense']);
    else building = rng.pick(['factory', 'factory', 'housing', 'highway', 'hospital', 'university', 'tech_park', 'port', 'farm', 'power_renew']);
    const cost = buildingCost(state, c.id, building);
    if (c.treasury < cost * 3 && c.debt / c.gdp > 0.5) return;
    if (c.treasury < cost * 1.5) return;
    const def = BUILDINGS.find((b) => b.id === building)!;
    const candidates = regs.filter((r) => (r.buildings[building] ?? 0) < def.maxLevel && (!def.coastal || world.regions[r.id].coastal) && r.construction.length < 2);
    if (!candidates.length) continue;
    const region = candidates.sort((a, b) => b.pop * (1 + rng.next()) - a.pop * (1 + rng.next()))[Math.floor(rng.next() * Math.min(5, candidates.length))];
    if (!startConstruction(state, world, c.id, region.id, building)) builds--;
  }
}

function aiDiplomacy(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  if (rng.chance(0.15)) {
    // seek a treaty with a friendly country
    const others = Object.values(state.countries).filter((o) => o.id !== c.id);
    const o = others[Math.floor(rng.next() * others.length)];
    const op = opinion(state, c.id, o.id);
    const types: TreatyType[] = ['trade', 'non_aggression', 'research', 'military_access', 'defensive_pact'];
    const t = rng.pick(types);
    if (op > (t === 'defensive_pact' ? 55 : t === 'military_access' ? 45 : 20) && !hasTreaty(state, c.id, o.id, t) && !areEnemies(state, c.id, o.id)) {
      createProposal(state, c.id, o.id, { type: 'treaty', treaty: t });
    }
  }
  // War declaration: rare, needs aggression, hostility and an advantage
  if (atWar(state, c.id) || state.tick - c.ai.lastWarCheck < 180) return;
  c.ai.lastWarCheck = state.tick;
  if (!rng.chance(0.25 * c.ai.aggression * state.settings.aiAggression)) return;
  const sc = world.countryByA3.get(c.id);
  if (!sc) return;
  const neighbors = new Set<string>();
  for (const id of sc.regions) for (const n of world.regions[id].nb) { const o = state.regions[n].owner; if (o !== c.id) neighbors.add(o); }
  const myPower = militaryPower(state, c.id);
  for (const n of neighbors) {
    const op = opinion(state, c.id, n);
    if (op > -45) continue;
    const allies = [n, ...defenders(state, n)];
    const theirPower = allies.reduce((s, a) => s + militaryPower(state, a) * (a === n ? 1 : 0.5), 0);
    if (myPower > theirPower * 1.8 && c.stability > 45 && c.warSupport > 35) {
      declareWar(state, world, c.id, n);
      return;
    }
  }
}

export function militaryPower(state: GameState, id: string) {
  let p = 0;
  for (const u of unitsOf(state, id)) { const d = UNIT_BY_ID[u.type]; p += (d.attack + d.defense + d.air + d.naval) * u.strength; }
  const c = state.countries[id];
  return p * (c ? 1 + c.tech.military * 0.08 : 1);
}

function aiMilitaryProduction(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  const war = atWar(state, c.id);
  const wanted = war ? 4 : 1;
  for (let i = 0; i < wanted; i++) {
    if (c.production.length > (war ? 8 : 3)) return;
    const regs = state.regions.filter((r) => r.owner === c.id && r.controller === c.id);
    const roll = rng.next();
    const domain = roll < 0.7 ? 'land' : roll < 0.85 ? 'air' : 'naval';
    const types = Object.values(UNIT_BY_ID).filter((u) => u.domain === domain && u.techReq <= Math.floor(c.tech.military));
    if (!types.length) continue;
    const type = domain === 'land' ? rng.pick(['infantry', 'infantry', ...types.map((t) => t.id)]) : rng.pick(types.map((t) => t.id));
    const region = regs.find((r) => productionCapacity(state, c.id, UNIT_BY_ID[type].domain, r.id) > c.production.filter((p) => p.region === r.id).length);
    if (!region) continue;
    const cost = UNIT_BY_ID[type].cost;
    if (c.milFund < cost * 1.5 && !war) continue;
    queueUnit(state, c.id, type, region.id);
  }
  void world;
}

/** Fold reserve units into formations. */
function aiOrganize(state: GameState, world: StaticWorld, c: Country) {
  const reserves = unitsOf(state, c.id).filter((u) => !u.parent && u.training <= 0);
  if (!reserves.length) return;
  const land = reserves.filter((u) => UNIT_BY_ID[u.type].domain === 'land');
  const air = reserves.filter((u) => UNIT_BY_ID[u.type].domain === 'air');
  const naval = reserves.filter((u) => UNIT_BY_ID[u.type].domain === 'naval');
  const tops = Object.values(state.formations).filter((f) => f.owner === c.id && !f.parent);
  if (land.length >= 3 || (land.length && atWar(state, c.id))) {
    const reg = makeFormation(state, world, c.id, 'regiment', `${ordinal(Object.values(state.formations).filter((f) => f.owner === c.id && f.kind === 'regiment').length + 1)} Regiment`, land[0].home);
    for (const u of land.slice(0, 5)) assignUnit(state, u, reg);
    const army = tops.find((f) => f.kind === 'army' && f.children.length < 6 && f.pos.region === reg.pos.region);
    if (army) assignFormation(state, reg, army);
  }
  for (const u of air) {
    const tf = tops.find((f) => f.kind === 'taskforce' && formationDomain(state, f) === 'air' && f.units.length < 10);
    if (tf) assignUnit(state, u, tf);
    else { const nf = makeFormation(state, world, c.id, 'taskforce', `${ordinal(tops.length + 1)} Air Group`, u.home); assignUnit(state, u, nf); }
  }
  for (const u of naval) {
    const tf = tops.find((f) => f.kind === 'taskforce' && formationDomain(state, f) === 'naval' && f.units.length < 8 && f.pos.region === u.home);
    if (tf) assignUnit(state, u, tf);
    else { const nf = makeFormation(state, world, c.id, 'taskforce', `Task Force ${tops.length + 1}`, u.home); assignUnit(state, u, nf); }
  }
}

function aiWarOps(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  const tops = Object.values(state.formations).filter((f) => f.owner === c.id && !f.parent);
  const enemies = new Set<string>();
  for (const w of warsOf(state, c.id)) for (const e of (warSide(w, c.id) === 'attackers' ? w.defenders : w.attackers)) enemies.add(e);
  // Frontline: enemy-controlled regions adjacent to our controlled regions
  const front: number[] = [];
  const threatened: number[] = [];
  for (const r of state.regions) {
    if (!enemies.has(r.controller)) continue;
    const nb = world.regions[r.id].nb;
    if (nb.some((n) => state.regions[n].controller === c.id)) { front.push(r.id); for (const n of nb) if (state.regions[n].controller === c.id) threatened.push(n); }
  }
  const landForces = tops.filter((f) => formationDomain(state, f) === 'land' && formationStrength(state, f).count > 0);
  const frontSet = [...new Set(threatened)];
  // 1) Hold the line: every threatened region keeps (or gets) a defender.
  const holding = new Set<string>();
  const covered = new Set<number>();
  for (const f of landForces) {
    if (!f.pos.pathRegions.length && frontSet.includes(f.pos.region) && !covered.has(f.pos.region)) { covered.add(f.pos.region); holding.add(f.id); f.stance = 'defensive'; }
  }
  for (const r of frontSet) {
    if (covered.has(r)) continue;
    const here = world.regions[r];
    const spare = landForces.filter((f) => !holding.has(f.id) && !f.inCombat && !f.pos.pathRegions.length)
      .sort((x, y) => Math.hypot(world.regions[x.pos.region].lon - here.lon, world.regions[x.pos.region].lat - here.lat) - Math.hypot(world.regions[y.pos.region].lon - here.lon, world.regions[y.pos.region].lat - here.lat))[0];
    if (!spare) break;
    if (!issueOrder(state, world, spare, { kind: 'move', target: r })) { holding.add(spare.id); covered.add(r); spare.stance = 'defensive'; }
  }
  // 2) Attack only with spare, rested formations that have local superiority.
  const enemyDefense = (t: number) => {
    let d = 0;
    for (const e of Object.values(state.formations)) if (!e.parent && e.pos.region === t && enemies.has(e.owner) && !e.pos.pathRegions.length) d += formationStrength(state, e).defense;
    const pop = world.regions[t].pop;
    return d + (3 + Math.sqrt(pop / 1e6) * 3) * 5 * (1 + state.regions[t].fort * 0.08);
  };
  for (const f of landForces) {
    if (holding.has(f.id) || f.inCombat || f.pos.pathRegions.length) continue;
    const fs = formationStrength(state, f);
    if (fs.org < 0.6 || fs.strength < 0.55) continue; // recover first
    f.stance = 'balanced';
    if (!front.length) {
      const target = [...enemies].map((e) => state.countries[e]?.capital).find((cap) => cap !== undefined);
      if (target !== undefined && rng.chance(0.3)) issueOrder(state, world, f, { kind: 'move', target });
      continue;
    }
    let best = -1, bestScore = -Infinity;
    const here = world.regions[f.pos.region];
    for (const t of front) {
      const tr = world.regions[t];
      const d = Math.hypot(tr.lon - here.lon, tr.lat - here.lat);
      const ratio = (fs.attack * (1 + c.tech.military * 0.08)) / Math.max(1, enemyDefense(t));
      const probing = rng.chance(0.06 * c.ai.aggression) && ratio > 0.7; // grinding offensives
      if (ratio < 1.4 - c.ai.aggression * 0.3 && !probing) continue;
      const score = -d + ratio * 3 + (state.regions[t].owner === c.id ? 12 : 0) + (state.countries[state.regions[t].owner]?.capital === t ? 4 : 0) + rng.next() * 2;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best >= 0) issueOrder(state, world, f, { kind: 'move', target: best });
  }
  for (const f of tops) {
    const domain = formationDomain(state, f);
    if (domain === 'land') {
      continue;
    } else if (domain === 'air') {
      if (f.order.kind !== 'hold' && rng.chance(0.8)) continue;
      const target = front.length ? front[Math.floor(rng.next() * front.length)] : threatened[0];
      if (target !== undefined) {
        const err = issueOrder(state, world, f, { kind: rng.chance(0.6) ? 'groundSupport' : 'airSuperiority', target });
        if (err && rng.chance(0.3)) {
          // rebase toward the front
          const base = threatened.find((t) => (state.regions[t].buildings.air_base ?? 0) > 0) ?? threatened[0];
          if (base !== undefined) issueOrder(state, world, f, { kind: 'move', target: base });
        }
      }
    } else {
      if (f.order.kind !== 'hold' || f.pos.path.length) continue;
      const coastalEnemy = state.regions.filter((r) => enemies.has(r.owner) && world.regions[r.id].coastal && (r.buildings.port ?? 0) > 0);
      if (coastalEnemy.length && rng.chance(0.5)) {
        const here = [f.pos.lon, f.pos.lat];
        coastalEnemy.sort((a, b) => Math.hypot(world.regions[a.id].lon - here[0], world.regions[a.id].lat - here[1]) - Math.hypot(world.regions[b.id].lon - here[0], world.regions[b.id].lat - here[1]));
        issueOrder(state, world, f, { kind: 'blockade', target: coastalEnemy[0].id });
      }
    }
  }
}

function aiPeace(state: GameState, c: Country) {
  for (const w of warsOf(state, c.id)) {
    const side = warSide(w, c.id)!;
    if (w[side][0] !== c.id) continue; // only war leaders negotiate
    if ((w.noPeaceBefore ?? 0) > state.tick) continue;
    const myScore = side === 'attackers' ? w.score : -w.score;
    const years = (state.tick - w.start) / 365;
    const enemyLeader = side === 'attackers' ? w.defenders[0] : w.attackers[0];
    if (Object.values(state.proposals).some((p) => p.kind.type === 'peace' && p.kind.war === w.id)) continue;
    if (myScore < -35 || years > 1.5 || (myScore > 40 && years > 0.5)) {
      // status-quo-ish: occupied land goes to the occupier
      const cede = state.regions.filter((r) => r.owner !== r.controller && (w.attackers.includes(r.owner) || w.defenders.includes(r.owner)) && (w.attackers.includes(r.controller) || w.defenders.includes(r.controller))).map((r) => r.id);
      const p = createProposal(state, c.id, enemyLeader, { type: 'peace', war: w.id, cede: myScore > 0 ? cede : cede.filter((id) => state.regions[id].controller !== c.id).slice(0, Math.ceil(cede.length / 2)), reparations: 0 });
      if (p && state.countries[enemyLeader]?.playerId) addNews(state, 'diplomacy', `${c.name} offers peace terms to end the ${w.name}`, [c.id, enemyLeader], undefined, true);
    }
  }
}
