import type { StaticWorld } from '../data/static';
import type { GameState } from './types';
import { Rng } from './rng';
import { economyDaily, recomputeCountryEconomy } from './economy';
import { holdElection, politicsMonthly, resolveBills, isDemocracy } from './politics';
import { militaryDaily } from './military';
import { diplomacyDaily, diplomacyMonthly } from './diplomacy';
import { eventsDaily, globalMonthly } from './events';
import { aiDaily, aiMonthly } from './ai';
import { campaignDecay } from './commands';
import { dateOf } from './util';

/** Advance the simulation by one day. Only the host runs this. */
export function advanceDay(state: GameState, world: StaticWorld) {
  const rng = new Rng(state.seed);
  state.tick++;
  economyDaily(state, world);
  resolveBills(state);
  militaryDaily(state, world);
  diplomacyDaily(state, world);
  eventsDaily(state, world, rng);
  aiDaily(state, world, rng);

  // Spread monthly work across days: each country updates on its own day of the month.
  const countries = Object.values(state.countries);
  const day = state.tick % 30;
  for (let i = day; i < countries.length; i += 30) {
    const c = countries[i];
    if (!state.regions.some((r) => r.owner === c.id)) continue;
    recomputeCountryEconomy(state, world, c);
    politicsMonthly(state, world, c);
    aiMonthly(state, world, c, rng);
  }
  for (const c of countries) {
    if (c.nextElection >= 0 && state.tick >= c.nextElection && isDemocracy(c.gov) && c.laws.emergency_powers !== 'martial_law') holdElection(state, world, c);
    else if (c.nextElection >= 0 && state.tick >= c.nextElection) c.nextElection = state.tick + 365; // postponed under martial law
  }
  if (dateOf(state).getUTCDate() === 1) {
    diplomacyMonthly(state);
    globalMonthly(state, rng);
    campaignDecay(state);
  }
  // Countries with no territory left are removed from play
  if (day === 0) {
    for (const c of countries) {
      if (!state.regions.some((r) => r.owner === c.id) && !c.playerId) {
        for (const u of Object.values(state.units)) if (u.owner === c.id) delete state.units[u.id];
        for (const f of Object.values(state.formations)) if (f.owner === c.id) delete state.formations[f.id];
      }
    }
  }
  state.seed = Math.floor(rng.next() * 2 ** 31);
}
