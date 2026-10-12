import type { StaticWorld } from '../../data/static';
import type { GameState, War } from '../types';
import { newId } from '../util';
import { changeRelation } from '../diplomacy';
import { formationDomain } from '../military';

export type ScenarioId = 'realworld' | 'peaceful';

export const SCENARIOS: { id: ScenarioId; name: string; desc: string }[] = [
  {
    id: 'realworld', name: 'The world today',
    desc: 'Ongoing conflicts as of mid-2025: the Russia–Ukraine war with occupied oblasts, the war in Gaza, civil wars in Sudan and Myanmar, insurgencies, and Western sanctions on Russia, Iran and North Korea.',
  },
  { id: 'peaceful', name: 'Peaceful 2026', desc: 'A hypothetical world at peace. Alliances, blocs and rivalries are real, but no wars are under way.' },
];

const SANCTIONERS = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'POL', 'SWE', 'FIN', 'NOR', 'DNK', 'EST', 'LVA', 'LTU', 'CZE', 'AUT', 'IRL', 'PRT', 'ROU', 'JPN', 'AUS', 'KOR', 'NZL', 'CHE'];

/** Unrest-heavy internal conflicts we model as insurgencies rather than wars. */
const CIVIL_CONFLICTS: { country: string; label: string; regions?: string[]; growth: number; stability: number }[] = [
  { country: 'SDN', label: 'Civil war (SAF vs RSF)', growth: -0.06, stability: -30 },
  { country: 'MMR', label: 'Civil war against the junta', growth: -0.04, stability: -25 },
  { country: 'COD', label: 'Eastern Congo insurgency', regions: ['Nord-Kivu', 'Sud-Kivu', 'Orientale'], growth: -0.01, stability: -10 },
  { country: 'ETH', label: 'Amhara insurgency', regions: ['Amhara', 'Tigray', 'Oromiya'], growth: -0.01, stability: -10 },
  { country: 'HTI', label: 'Gang violence', growth: -0.03, stability: -25 },
  { country: 'SOM', label: 'Al-Shabaab insurgency', growth: -0.01, stability: -15 },
  { country: 'YEM', label: 'Houthi conflict', growth: -0.03, stability: -25 },
  { country: 'SYR', label: 'Post-war transition', growth: -0.01, stability: -15 },
  { country: 'LBY', label: 'Divided government', growth: -0.01, stability: -10 },
  { country: 'MLI', label: 'Sahel insurgency', growth: -0.01, stability: -12 },
  { country: 'BFA', label: 'Sahel insurgency', growth: -0.01, stability: -12 },
  { country: 'NER', label: 'Sahel insurgency', growth: -0.01, stability: -10 },
];

function region(world: StaticWorld, country: string, name: string): number | null {
  return world.regions.find((r) => r.c === country && r.n === name)?.id ?? null;
}

function startWar(state: GameState, name: string, attackers: string[], defenders: string[], startedDaysAgo: number): War | null {
  if (![...attackers, ...defenders].every((c) => state.countries[c])) return null;
  const id = newId(state, 'w');
  const war: War = { id, name, attackers, defenders, start: -startedDaysAgo, score: 0, casualties: {}, battles: [] };
  state.wars[id] = war;
  for (const a of attackers) for (const d of defenders) changeRelation(state, a, d, -100);
  return war;
}

/** Station each side's land forces along the front. */
function deployToFront(state: GameState, world: StaticWorld, side: string, enemy: string) {
  const front = state.regions.filter((r) => r.controller === side && world.regions[r.id].nb.some((n) => state.regions[n].controller === enemy)).map((r) => r.id);
  if (!front.length) return;
  const armies = Object.values(state.formations).filter((f) => f.owner === side && !f.parent && formationDomain(state, f) === 'land');
  armies.forEach((f, i) => {
    const id = front[i % front.length];
    const sr = world.regions[id];
    f.pos.region = id; f.pos.lon = sr.lon + ((i * 0.37) % 1 - 0.5) * 0.6; f.pos.lat = sr.lat + ((i * 0.61) % 1 - 0.5) * 0.4;
    f.pos.path = []; f.pos.pathRegions = [];
    f.stance = side === 'UKR' ? 'defensive' : 'balanced';
  });
}

export function applyScenario(state: GameState, world: StaticWorld, id: ScenarioId) {
  if (id !== 'realworld') return;
  const c = state.countries;

  // ---- Russia–Ukraine ----
  if (c.RUS && c.UKR) {
    for (const n of ['Crimea', 'Sevastopol']) {
      const rid = region(world, 'RUS', n);
      if (rid !== null) { state.regions[rid].owner = 'UKR'; state.regions[rid].controller = 'RUS'; }
    }
    for (const n of ["Luhans'k", "Donets'k", 'Zaporizhzhya', 'Kherson']) {
      const rid = region(world, 'UKR', n);
      if (rid !== null) { const r = state.regions[rid]; r.controller = 'RUS'; r.devastation = 45; r.unrest = 60; r.pop *= 0.75; }
    }
    for (const n of ['Kharkiv', 'Sumy', 'Dnipropetrovs\'k', 'Mykolayiv']) {
      const rid = region(world, 'UKR', n);
      if (rid !== null) state.regions[rid].devastation = 20;
    }
    const war = startWar(state, 'Russia–Ukraine War', ['RUS'], ['UKR'], 1400);
    if (war) { war.casualties = { RUS: 700000, UKR: 400000 }; war.noPeaceBefore = 360; }
    Object.assign(c.UKR, { warSupport: 75, stability: 45 });
    c.UKR.budget.military = 26;
    c.UKR.tech.military = Math.max(c.UKR.tech.military, 4); // Western equipment
    c.UKR.laws.emergency_powers = 'martial_law';
    c.UKR.nextElection = -1;
    c.UKR.modifiers.push({ id: 'western_aid', label: 'Western military and budget aid', until: 365 * 3, growth: 0.02, stability: 6 });
    c.RUS.budget.military = 7;
    c.RUS.warSupport = 55;
    c.RUS.modifiers.push({ id: 'war_economy', label: 'War economy', until: 365 * 2, growth: -0.004 });
    deployToFront(state, world, 'RUS', 'UKR');
    deployToFront(state, world, 'UKR', 'RUS');
    for (const s of SANCTIONERS) if (c[s]) { state.sanctions[`${s}>RUS`] = true; changeRelation(state, s, 'RUS', -30); changeRelation(state, s, 'UKR', 25); }
    if (c.BLR) changeRelation(state, 'BLR', 'UKR', -40);
    if (c.PRK) changeRelation(state, 'PRK', 'RUS', 40);
  }

  // ---- Israel–Gaza: modelled as a devastated conflict zone, not a capitulable war ----
  if (c.ISR && c.PSX) {
    const gaza = region(world, 'PSX', 'Gaza Strip');
    if (gaza !== null) { const r = state.regions[gaza]; r.devastation = 85; r.unrest = 90; r.prosperity = 8; r.productivity *= 0.3; }
    c.PSX.stability = 8;
    c.PSX.modifiers.push({ id: 'gaza_war', label: 'Gaza war and humanitarian crisis', until: 365 * 2, growth: -0.08, unrest: 30 });
    c.ISR.warSupport = 60;
    c.ISR.budget.military = 7;
    c.ISR.modifiers.push({ id: 'gaza_war', label: 'Gaza war', until: 365, growth: -0.01 });
    for (const a of ['IRN', 'LBN', 'YEM', 'SYR', 'PSX']) if (c[a]) changeRelation(state, 'ISR', a, -50);
  }

  // ---- Other sanctions and tensions ----
  for (const target of ['IRN', 'PRK']) for (const s of ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'JPN', 'AUS', 'KOR']) if (c[s] && c[target]) state.sanctions[`${s}>${target}`] = true;
  if (c.CHN && c.TWN) changeRelation(state, 'CHN', 'TWN', -50);
  if (c.IND && c.PAK) changeRelation(state, 'IND', 'PAK', -45);
  if (c.ARM && c.AZE) changeRelation(state, 'ARM', 'AZE', -20);

  // ---- Civil conflicts ----
  for (const cc of CIVIL_CONFLICTS) {
    const co = c[cc.country];
    if (!co) continue;
    co.stability = Math.max(5, co.stability + cc.stability);
    co.modifiers.push({ id: 'civil_conflict', label: cc.label, until: 365 * 2, growth: cc.growth, unrest: 25 });
    for (const r of state.regions) {
      if (r.owner !== cc.country) continue;
      if (cc.regions && !cc.regions.includes(world.regions[r.id].n)) continue;
      r.unrest = Math.max(r.unrest, 70);
      r.devastation = Math.max(r.devastation, 25);
    }
  }
}
