// Commodities (oil, minerals, food, manufactured goods), world prices, export
// earnings, and national stock market indices.
import type { StaticWorld } from '../data/static';
import type { Commodity, Country, GameState } from './types';
import type { Rng } from './rng';
import { clamp } from './util';
import { regionGdp } from './economy';
import { atWar } from './diplomacy';
import { addNews } from './news';

export const COMMODITIES: { id: Commodity; name: string; base: number }[] = [
  { id: 'oil', name: 'Oil & gas', base: 75 },
  { id: 'minerals', name: 'Metals & minerals', base: 100 },
  { id: 'food', name: 'Food & agriculture', base: 100 },
  { id: 'goods', name: 'Manufactured goods', base: 100 },
];

/** Real-world oil & gas producers: extra oil field levels seeded at start. */
export const OIL_PRODUCERS: Record<string, number> = {
  USA: 12, SAU: 12, RUS: 12, CAN: 6, IRQ: 6, CHN: 4, ARE: 5, BRA: 4, IRN: 5, KWT: 4, KAZ: 3, NOR: 4, MEX: 3, NGA: 3,
  QAT: 4, DZA: 3, LBY: 2, AGO: 2, VEN: 2, OMN: 2, GBR: 1, AZE: 2, TKM: 2, EGY: 1, IDN: 1, MYS: 1, AUS: 3,
};

const TERRAIN_FOOD: Record<string, number> = { plains: 1, forest: 0.5, hills: 0.5, jungle: 0.4, mountains: 0.15, desert: 0.05, arctic: 0 };

function production(state: GameState, world: StaticWorld, c: Country): Record<Commodity, number> {
  const out: Record<Commodity, number> = { oil: 0, minerals: 0, food: 0, goods: 0 };
  for (const r of state.regions) {
    if (r.owner !== c.id) continue;
    const occupied = r.controller !== r.owner ? 0.3 : 1;
    const dev = 1 - r.devastation / 150;
    const sr = world.regions[r.id];
    out.oil += (r.buildings.oil ?? 0) * 22 * occupied * dev;
    out.minerals += ((r.buildings.mine ?? 0) * 12 + (sr.terrain === 'mountains' || sr.terrain === 'hills' ? Math.sqrt(sr.area) / 400 : 0)) * occupied * dev;
    out.food += ((r.buildings.farm ?? 0) * 6 + (Math.sqrt(sr.area) / 120) * (TERRAIN_FOOD[sr.terrain] ?? 0.3)) * occupied * dev;
    out.goods += regionGdp(r) * (0.02 + (r.buildings.factory ?? 0) * 0.012) * occupied;
  }
  return out;
}

function demand(state: GameState, c: Country, pop: number): Record<Commodity, number> {
  const mix = c.laws.energy_mix;
  const oilUse = mix === 'fossil' ? 1.25 : mix === 'renewables' ? 0.75 : mix === 'nuclear' ? 0.85 : 1;
  void state;
  return { oil: c.gdp * 0.011 * oilUse, minerals: c.gdp * 0.006, food: (pop / 1e6) * 0.45, goods: c.gdp * 0.045 };
}

export function commoditiesMonthly(state: GameState, world: StaticWorld) {
  const pops = new Map<string, number>();
  for (const r of state.regions) pops.set(r.owner, (pops.get(r.owner) ?? 0) + r.pop);
  const world_: Record<Commodity, { s: number; d: number }> = { oil: { s: 0, d: 0 }, minerals: { s: 0, d: 0 }, food: { s: 0, d: 0 }, goods: { s: 0, d: 0 } };
  const raw: { c: Country; p: Record<Commodity, number>; d: Record<Commodity, number> }[] = [];
  for (const c of Object.values(state.countries)) {
    const pop = pops.get(c.id) ?? 0;
    if (!pop) continue;
    raw.push({ c, p: production(state, world, c), d: demand(state, c, pop) });
  }
  // Calibrate once so the world market starts in balance; afterwards supply and demand drift apart.
  if (!state.commodityScale) {
    const s: Record<string, number> = {}, d: Record<string, number> = {};
    for (const x of raw) for (const def of COMMODITIES) { s[def.id] = (s[def.id] ?? 0) + x.p[def.id]; d[def.id] = (d[def.id] ?? 0) + x.d[def.id]; }
    state.commodityScale = Object.fromEntries(COMMODITIES.map((def) => [def.id, d[def.id] / Math.max(1, s[def.id])])) as Record<Commodity, number>;
  }
  for (const { c, p, d } of raw) {
    for (const def of COMMODITIES) p[def.id] *= state.commodityScale[def.id];
    c.commodities = { oil: { prod: p.oil, demand: d.oil }, minerals: { prod: p.minerals, demand: d.minerals }, food: { prod: p.food, demand: d.food }, goods: { prod: p.goods, demand: d.goods } };
    for (const k of Object.keys(world_) as Commodity[]) { world_[k].s += p[k]; world_[k].d += d[k]; }
  }
  // Prices respond to the global balance (smoothed), plus random shocks from events.
  state.commodityPrices = state.commodityPrices ?? { oil: 75, minerals: 100, food: 100, goods: 100 };
  for (const def of COMMODITIES) {
    const { s, d } = world_[def.id];
    const target = def.base * clamp(Math.pow(d / Math.max(1, s), 1.3), 0.4, 3);
    const cur = def.id === 'oil' ? state.global.oilPrice : state.commodityPrices[def.id];
    const next = cur + (target - cur) * 0.15;
    if (def.id === 'oil') state.global.oilPrice = next;
    state.commodityPrices[def.id] = Math.round(next * 10) / 10;
  }
  // Export earnings / import bills
  for (const c of Object.values(state.countries)) {
    if (!c.commodities) continue;
    const sanctioned = Object.keys(state.sanctions).some((k) => k.endsWith(`>${c.id}`));
    let bal = 0;
    for (const def of COMMODITIES) {
      const { prod, demand: dem } = c.commodities[def.id];
      const price = (state.commodityPrices[def.id] ?? def.base) / def.base;
      const net = (prod - dem) * price * (def.id === 'goods' ? 0.35 : 1);
      bal += net > 0 && sanctioned ? net * 0.7 : net;
    }
    c.tradeBalance = Math.round(bal * 100) / 100;
  }
}

/** Monthly stock market move. */
export function marketMonthly(state: GameState, c: Country, rng: Rng) {
  const war = atWar(state, c.id);
  const r = c.gdpGrowth * 0.12 + 0.003 + (c.stability - 55) * 0.0003 + state.global.worldGrowth * 0.4 - (war ? 0.008 : 0)
    + (c.laws.central_bank === 'independent' ? 0.001 : -0.001) + rng.normal() * 0.035;
  const before = c.market ?? 100;
  c.market = Math.max(5, before * (1 + r));
  if (c.playerId && r < -0.09) addNews(state, 'economy', `${c.name}'s stock market plunges ${(r * -100).toFixed(1)}% this month`, [c.id]);
}

/** Gravity-model estimate of bilateral trade (billions/yr) with each partner. */
export function topPartners(state: GameState, world: StaticWorld, id: string, n = 6): { id: string; volume: number }[] {
  const me = state.countries[id];
  if (!me) return [];
  const myCap = world.regions[me.capital];
  const out: { id: string; volume: number }[] = [];
  for (const o of Object.values(state.countries)) {
    if (o.id === id || o.gdp < 5) continue;
    if (state.sanctions[`${id}>${o.id}`] || state.sanctions[`${o.id}>${id}`] || atWar(state, id) && Object.values(state.wars).some((w) => (w.attackers.includes(id) && w.defenders.includes(o.id)) || (w.defenders.includes(id) && w.attackers.includes(o.id)))) continue;
    const cap = world.regions[o.capital];
    const dist = Math.max(300, Math.hypot(myCap.lon - cap.lon, myCap.lat - cap.lat) * 100);
    let v = (Math.sqrt(me.gdp * o.gdp) * me.tradeOpenness * o.tradeOpenness * 800) / dist;
    for (const t of Object.values(state.treaties)) if (t.type === 'trade' && ((t.a === id && t.b === o.id) || (t.b === id && t.a === o.id))) v *= 1.6;
    for (const org of Object.values(state.orgs)) if (org.kind === 'economic' && org.members.includes(id) && org.members.includes(o.id)) v *= 1.5;
    out.push({ id: o.id, volume: v });
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, n);
}
