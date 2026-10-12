// Nuclear weapons. Use is catastrophic: the target region is devastated, the
// whole world turns against the attacker, and nuclear-armed victims retaliate.
import type { StaticWorld } from '../data/static';
import type { GameState } from './types';
import { areEnemies, changeRelation, defenders } from './diplomacy';
import { addNews } from './news';
import { formationUnits, destroyUnit } from './military';
import { newId } from './util';

export function canNuke(state: GameState, attacker: string, target: number): string | null {
  const c = state.countries[attacker];
  const r = state.regions[target];
  if (!c || !r) return 'Invalid target';
  if (c.nukes <= 0) return 'You have no nuclear weapons';
  if (c.laws.nuclear_weapons === 'none') return 'Your nuclear doctrine forbids use (change the Nuclear Doctrine law)';
  if (!areEnemies(state, attacker, r.controller)) return 'You can only strike a region held by a country you are at war with';
  return null;
}

export function nuclearStrike(state: GameState, world: StaticWorld, attacker: string, target: number, retaliation = false) {
  const c = state.countries[attacker];
  const r = state.regions[target];
  const victim = r.controller;
  const sr = world.regions[target];
  c.nukes = Math.max(0, c.nukes - 1);
  const dead = r.pop * 0.25;
  r.pop *= 0.6;
  r.devastation = 100;
  r.productivity *= 0.45;
  r.prosperity = Math.min(r.prosperity, 10);
  r.unrest = 100;
  for (const b of Object.keys(r.buildings)) { r.buildings[b] = Math.floor(r.buildings[b] / 3); if (!r.buildings[b]) delete r.buildings[b]; }
  for (const f of Object.values(state.formations)) {
    if (f.parent || f.pos.region !== target) continue;
    for (const u of formationUnits(state, f)) destroyUnit(state, u);
  }
  for (const n of sr.nb) { const nr = state.regions[n]; nr.devastation = Math.min(100, nr.devastation + 25); nr.unrest = Math.min(100, nr.unrest + 30); }
  const id = newId(state, 'e');
  state.mapEvents[id] = { id, kind: 'nuclear', region: target, lon: sr.lon, lat: sr.lat, start: state.tick, until: state.tick + 365, severity: 1 };
  addNews(state, 'military', `NUCLEAR ${retaliation ? 'RETALIATION' : 'STRIKE'}: ${c.name} detonates a nuclear weapon over ${sr.n}, ${state.countries[r.owner]?.name}. An estimated ${(dead / 1e6).toFixed(1)} million dead.`, [attacker, victim, r.owner], target, true);
  // Global outrage
  for (const o of Object.values(state.countries)) {
    if (o.id === attacker) continue;
    changeRelation(state, attacker, o.id, retaliation ? -25 : -90);
    o.stability = Math.max(0, o.stability - 3);
  }
  if (!retaliation) {
    c.legitimacy = Math.max(0, c.legitimacy - 30);
    c.stability = Math.max(0, c.stability - 15);
    for (const o of Object.keys(state.countries)) if (o !== attacker && o !== victim) state.sanctions[`${o}>${attacker}`] = true;
  }
  state.global.worldGrowth -= 0.02;
  // Retaliation by the victim or its nuclear-armed protectors (resolved next day)
  if (!retaliation) {
    const responders = [victim, ...defenders(state, victim)].filter((x) => state.countries[x]?.nukes > 0 && state.countries[x].laws.nuclear_weapons !== 'none');
    state.global.pendingRetaliation = [...(state.global.pendingRetaliation ?? []), ...responders.slice(0, 1).map((from) => ({ from, against: attacker, at: state.tick + 1 }))];
  }
}

/** Daily: AI/automatic retaliation strikes. */
export function strategicDaily(state: GameState, world: StaticWorld) {
  const g = state.global;
  if (!g.pendingRetaliation?.length) return;
  const due = g.pendingRetaliation.filter((p) => p.at <= state.tick);
  g.pendingRetaliation = g.pendingRetaliation.filter((p) => p.at > state.tick);
  for (const p of due) {
    const from = state.countries[p.from];
    if (!from || from.nukes <= 0) continue;
    if (from.playerId && state.parties[from.rulingParty]?.playerId) continue; // players decide for themselves
    const targets = state.regions.filter((r) => r.controller === p.against).sort((a, b) => b.pop - a.pop);
    if (targets[0]) nuclearStrike(state, world, p.from, targets[0].id, true);
  }
}
