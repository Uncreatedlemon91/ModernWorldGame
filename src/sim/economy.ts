import type { StaticWorld } from '../data/static';
import type { Country, GameState, GroupId, Region, BudgetKey } from './types';
import { LAW_BY_ID, type LawEffects } from './content/laws';
import { BUILDING_BY_ID } from './content/buildings';
import { UNIT_BY_ID } from './content/units';
import { clamp } from './util';
import { atWar } from './diplomacy';

export const regionGdp = (r: Region) => (r.pop * r.productivity) / 1e6 * (1 - r.devastation / 150);

const lawEffectsCache = new Map<string, Required<LawEffects>>();
export function lawEffects(c: Country): Required<LawEffects> {
  const key = Object.values(c.laws).join(',');
  let cached = lawEffectsCache.get(key);
  if (!cached) {
    cached = computeLawEffects(c);
    if (lawEffectsCache.size > 5000) lawEffectsCache.clear();
    lawEffectsCache.set(key, cached);
  }
  return cached;
}

function computeLawEffects(c: Country): Required<LawEffects> {
  const e: Required<LawEffects> = { growth: 0, stability: 0, freedom: 0, corruption: 0, crime: 0, health: 0, education: 0, pollution: 0, trade: 0, manpower: 0, unrest: 0, revenue: 0, cost: 0, research: 0, legitimacy: 0, energy: 0, unemployment: 0, popGrowth: 0 };
  for (const [lawId, optId] of Object.entries(c.laws)) {
    const opt = LAW_BY_ID[lawId]?.options.find((o) => o.id === optId);
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.effects)) (e as Record<string, number>)[k] += v as number;
  }
  return e;
}

export function lawGroupEffects(c: Country): Record<GroupId, number> {
  const out = {} as Record<GroupId, number>;
  for (const g of Object.keys(c.groups) as GroupId[]) out[g] = 0;
  for (const [lawId, optId] of Object.entries(c.laws)) {
    const opt = LAW_BY_ID[lawId]?.options.find((o) => o.id === optId);
    if (!opt) continue;
    for (const [g, v] of Object.entries(opt.groups)) out[g as GroupId] += v as number;
  }
  return out;
}

export const modifierSum = (c: Country, key: 'growth' | 'stability' | 'approval' | 'unrest') =>
  c.modifiers.reduce((s, m) => s + (m[key] ?? 0), 0);

/** Price level relative to the US: poorer countries build and recruit more cheaply. */
export function priceLevel(c: Country, pop: number): number {
  const gdppc = (c.gdp * 1e6) / Math.max(1, pop);
  return clamp(Math.sqrt(gdppc / 80), 0.3, 1.2);
}

export function countryPop(state: GameState, countryId: string): number {
  let p = 0;
  for (const r of state.regions) if (r.owner === countryId) p += r.pop;
  return p;
}

export function ownedRegions(state: GameState, countryId: string): Region[] {
  return state.regions.filter((r) => r.owner === countryId);
}

export function buildingUpkeep(regs: Region[]): number {
  let u = 0;
  for (const r of regs) for (const [b, lvl] of Object.entries(r.buildings)) u += (BUILDING_BY_ID[b]?.upkeep ?? 0) * lvl;
  return u;
}

export function unitUpkeep(state: GameState, countryId: string): number {
  let u = 0;
  for (const unit of Object.values(state.units)) if (unit.owner === countryId) u += UNIT_BY_ID[unit.type]?.upkeep ?? 0;
  return u;
}

export function taxRevenueShare(c: Country, e = lawEffects(c)): number {
  const t = c.taxes;
  // + 5% of GDP from fees and social contributions
  const raw = (t.income * 0.6 + t.corporate * 0.2 + t.sales * 0.7 + t.tariffs * c.tradeOpenness * 0.6 + 5) / 100;
  const compliance = 1 - c.corruption / 250;
  // Laffer: very high rates erode the base
  const burden = (t.income + t.corporate + t.sales) / 3;
  const laffer = burden > 35 ? 1 - (burden - 35) * 0.015 : 1;
  return raw * compliance * laffer * (1 + e.revenue);
}

export function budgetTotal(c: Country) {
  return (Object.values(c.budget) as number[]).reduce((s, v) => s + v, 0);
}

/**
 * Recompute all slow-moving national indicators. Runs monthly (and at init).
 */
export function recomputeCountryEconomy(state: GameState, _world: StaticWorld, c: Country, init = false) {
  const regs = ownedRegions(state, c.id);
  const e = lawEffects(c);
  let gdp = 0, pop = 0, energySupply = c.energyBase, research = 0, jobs = 0, health = 0, edu = 0, pollution = 0, trade = 0;
  for (const r of regs) {
    const occupied = r.controller !== r.owner;
    gdp += regionGdp(r) * (occupied ? 0.25 : 1);
    pop += r.pop;
    for (const [b, lvl] of Object.entries(r.buildings)) {
      const def = BUILDING_BY_ID[b];
      if (!def) continue;
      energySupply += (def.effects.energy ?? 0) * lvl * (occupied ? 0 : 1);
      research += (def.effects.research ?? 0) * lvl;
      jobs += (def.effects.jobs ?? 0) * lvl;
      health += (def.effects.health ?? 0) * lvl;
      edu += (def.effects.education ?? 0) * lvl;
      pollution += (def.effects.pollution ?? 0) * lvl;
      trade += (def.effects.trade ?? 0) * lvl;
    }
  }
  c.gdp = Math.max(0.05, gdp);
  const nRegs = Math.max(1, regs.length);
  const pl = priceLevel(c, pop);

  // Energy
  const demand = c.gdp * 0.1;
  c.energy = clamp((energySupply * (1 + e.energy)) / Math.max(0.01, demand), 0.3, 2);

  // Trade
  const sanctionsOn = Object.keys(state.sanctions).filter((k) => k.endsWith(`>${c.id}`)).length;
  const wars = atWar(state, c.id);
  c.tradeOpenness = clamp(0.4 + e.trade + trade * 0.01 / Math.sqrt(nRegs) - sanctionsOn * 0.04 - (wars ? 0.1 : 0) - c.taxes.tariffs * 0.004, 0.05, 1);

  // Fiscal
  const revShare = taxRevenueShare(c, e);
  c.revenue = c.gdp * revShare;
  const interest = c.debt * c.interestRate;
  const lawCost = (c.gdp * e.cost * 0.3) / 100; // programme overheads on top of the budget lines
  c.expenses = (c.gdp * budgetTotal(c)) / 100 + lawCost + interest + buildingUpkeep(regs) * pl;
  const deficitRatio = (c.expenses - c.revenue) / c.gdp;
  const debtRatio = c.debt / c.gdp;

  // Stats drift toward targets
  const rich = c.gdp * 1e6 / Math.max(1, pop);
  const k = init ? 1 : 0.08;
  const healthT = clamp(20 + Math.log10(rich + 1) * 14 + c.budget.health * 3 + e.health + health / nRegs * 2, 5, 98);
  const eduT = clamp(15 + Math.log10(rich + 1) * 14 + c.budget.education * 4 + e.education + edu / nRegs * 2, 5, 98);
  const crimeT = clamp(25 + e.crime - c.budget.police * 4 + c.unemployment * 120 + (100 - c.stability) * 0.1, 2, 95);
  const pollT = clamp(25 + e.pollution + (pollution / nRegs) * 3 + Math.log10(c.gdp + 1) * 3, 2, 98);
  const corrT = clamp((init ? c.corruption : 45 - Math.log10(rich + 1) * 8) + e.corruption - c.budget.admin * 2 + 6, 2, 95);
  c.health += (healthT - c.health) * k;
  c.education += (eduT - c.education) * k;
  c.crime += (crimeT - c.crime) * k;
  c.pollution += (pollT - c.pollution) * k;
  if (!init) c.corruption += (corrT - c.corruption) * k * 0.5;
  c.freedom = clamp(55 + e.freedom + (c.gov === 'parliamentary' || c.gov === 'constitutional_monarchy' ? 10 : 0), 0, 100);

  // Growth
  const avgUnrest = regs.reduce((s, r) => s + r.unrest, 0) / nRegs;
  const treatyBonus = Object.values(state.treaties).filter((t) => t.type === 'trade' && (t.a === c.id || t.b === c.id)).length * 0.0015;
  const orgBonus = Object.values(state.orgs).filter((o) => o.kind === 'economic' && o.members.includes(c.id)).length * 0.002;
  const warDrag = wars ? 0.012 + regs.filter((r) => r.controller !== r.owner).length / nRegs * 0.08 : 0;
  const parts: Record<string, number> = {
    'Policies & laws': e.growth,
    'Infrastructure spending': (c.budget.infrastructure - 3) * 0.002,
    'Education spending': (c.budget.education - 4) * 0.0008,
    'Research spending': (c.budget.research - 0.8) * 0.002,
    'Technology': (c.tech.economy - 2) * 0.002,
    'Tax burden': -Math.max(0, revShare - 0.32) * 0.12,
    'Debt overhang': -Math.max(0, debtRatio - 1.0) * 0.01,
    'Energy shortage': -(c.energy < 1 ? (1 - c.energy) * 0.12 : 0),
    'Stability': (c.stability - 55) * 0.0003 - avgUnrest * 0.0002,
    'Trade openness': (c.tradeOpenness - 0.4) * 0.012,
    'Trade deals & blocs': Math.min(0.012, treatyBonus) + orgBonus,
    'Sanctions': -sanctionsOn * 0.003,
  };
  // Calibrate so each country starts on its real-world trend; later policy changes move it.
  const policySum = Object.values(parts).reduce((a, b) => a + b, 0);
  if (init && c.growthCal === undefined) c.growthCal = -policySum;
  const shocks: Record<string, number> = {
    'War': -warDrag,
    'World economy': state.global.worldGrowth - (state.global.pandemic.active ? state.global.pandemic.severity * 0.03 : 0),
    'Events': modifierSum(c, 'growth'),
  };
  const trend = c.baseGrowth * (2 - state.settings.economyDifficulty);
  const growth = trend + policySum + (c.growthCal ?? 0) + Object.values(shocks).reduce((a, b) => a + b, 0);
  c.growthParts = { 'Long-run trend': trend, ...Object.fromEntries(Object.entries({ ...parts, ...shocks }).map(([k, v]) => [k, k === 'Policies & laws' ? v : v])) };
  c.growthParts['Baseline adjustment'] = c.growthCal ?? 0;
  c.gdpGrowth = init ? growth : c.gdpGrowth + (growth - c.gdpGrowth) * 0.3;

  const infT = clamp(0.02 + Math.max(0, deficitRatio) * 0.25 + (c.energy < 1 ? (1 - c.energy) * 0.3 : 0) + (state.global.oilPrice - 75) / 1500
    + (c.laws.central_bank === 'political' ? 0.025 : 0) + Math.max(0, c.gdpGrowth - c.baseGrowth - 0.01) * 0.5 + (wars ? 0.02 : 0), -0.02, 0.6);
  const unempT = clamp((rich > 20 ? 0.05 : 0.08) + e.unemployment - (c.gdpGrowth - c.baseGrowth) * 1.5 - jobs * 0.0004 / Math.sqrt(nRegs) + avgUnrest * 0.0005, 0.01, 0.45);
  c.inflation += (infT - c.inflation) * (init ? 1 : 0.1);
  c.unemployment += (unempT - c.unemployment) * (init ? 1 : 0.1);
  // effective average rate on the debt stock
  const rateT = clamp((rich > 20 ? 0.018 : 0.045) + Math.max(0, debtRatio - 0.9) * 0.012 + Math.max(0, c.inflation - 0.02) * 0.4 + (c.stability < 40 ? 0.02 : 0) + (wars ? 0.01 : 0) - (c.id === 'JPN' ? 0.02 : 0), 0.003, 0.35);
  c.interestRate = init ? rateT : c.interestRate + (rateT - c.interestRate) * 0.05;
  c.creditRating = debtRatio < 0.4 && c.stability > 60 ? 'AAA' : debtRatio < 0.8 && c.stability > 50 ? 'AA' : debtRatio < 1.2 ? 'A' : debtRatio < 1.8 ? 'BBB' : debtRatio < 2.5 ? 'BB' : 'CCC';

  // Research: points per year
  const rp = Math.sqrt(Math.max(0, c.gdp * c.budget.research)) * (1 + e.research) * (1 + research * 0.01) * (0.5 + c.education / 100);
  (c as Country & { researchRate?: number }).researchRate = rp;

  // Manpower regenerates from population
  const manpowerCap = pop * (0.003 + e.manpower);
  if (init) c.manpower = manpowerCap * 0.5;
  else c.manpower = Math.min(manpowerCap, c.manpower + manpowerCap * 0.01);
}

/** Daily economic step: region growth, cash flow, construction, research. */
export function economyDaily(state: GameState, world: StaticWorld) {
  // Region-level growth
  const effCache = new Map<string, Required<LawEffects>>();
  for (const r of state.regions) {
    const c = state.countries[r.owner];
    if (!c) continue;
    let e = effCache.get(c.id);
    if (!e) { e = lawEffects(c); effCache.set(c.id, e); }
    const occupied = r.controller !== r.owner;
    const catchup = (50 - r.prosperity) * 0.0003;
    const g = c.gdpGrowth + catchup - (occupied ? 0.05 : 0) - r.devastation * 0.0008;
    r.productivity *= 1 + g / 365;
    const rich = r.productivity;
    const popG = (rich > 30 ? 0.003 : rich > 8 ? 0.009 : 0.022) + e.popGrowth + (r.prosperity - 50) * 0.0002 - r.devastation * 0.0005
      - (state.global.pandemic.active ? state.global.pandemic.severity * 0.004 : 0);
    r.pop *= 1 + popG / 365;
    r.devastation = Math.max(0, r.devastation - 0.04);
    let bProsp = 0, bUnrest = 0, bDefense = 0;
    for (const [b, lvl] of Object.entries(r.buildings)) {
      const def = BUILDING_BY_ID[b];
      bProsp += (def?.effects.prosperity ?? 0) * lvl;
      bUnrest += (def?.effects.unrest ?? 0) * lvl;
      bDefense += (def?.effects.defense ?? 0) * lvl;
    }
    const prospT = clamp(25 * Math.log10(Math.max(0.3, r.productivity)) + 32 + bProsp + (c.stability - 50) * 0.1 - r.devastation * 0.4 - r.unrest * 0.08, 0, 100);
    r.prosperity += (prospT - r.prosperity) / 60;
    const unrestT = clamp((60 - c.approval) * 0.45 + e.unrest + (r.prosperity < 30 ? 8 : 0) + (occupied ? 45 : 0) - c.budget.police * 2 + bUnrest
      + r.devastation * 0.2 + (c.laws.emergency_powers === 'martial_law' ? -10 : 0) + modifierSum(c, 'unrest') + (100 - c.stability) * 0.1, 0, 100);
    r.unrest += (unrestT - r.unrest) / 40;
    // baseline defences grow to the level the buildings support; troops can dig in further (military.ts)
    if (r.fort < bDefense + 2) r.fort = Math.min(bDefense + 2, r.fort + 0.02);
    else r.fort = Math.max(bDefense + 2, r.fort - 0.01);

    // Construction
    if (r.construction.length && !occupied) {
      const job = r.construction[0];
      job.progress += 1;
      if (job.progress >= job.days) {
        r.construction.shift();
        r.buildings[job.building] = (r.buildings[job.building] ?? 0) + 1;
        const def = BUILDING_BY_ID[job.building];
        if (def?.effects.productivity) r.productivity *= 1 + def.effects.productivity;
        state.news.push({ id: `n${state.nextId++}`, tick: state.tick, cat: 'economy', text: `${def?.name ?? job.building} completed in ${world.regions[r.id].n}`, countries: [r.owner], region: r.id });
      }
    }
  }

  // National cash flow
  for (const c of Object.values(state.countries)) {
    const flow = (c.revenue - c.expenses) / 365;
    c.treasury += flow;
    if (c.treasury < 0) {
      const borrow = -c.treasury + c.gdp * 0.004;
      c.debt += borrow;
      c.treasury += borrow;
    } else if (c.treasury > c.gdp * 0.06 && c.debt > 0) {
      const repay = Math.min(c.debt, (c.treasury - c.gdp * 0.06) * 0.1);
      c.debt -= repay; c.treasury -= repay;
    }
    // Military procurement fund
    c.milFund += (c.gdp * c.budget.military / 100) * 0.35 / 365;
    const upkeep = unitUpkeepCached(state, c.id) / 365;
    c.milFund -= upkeep;
    if (c.milFund < 0) {
      c.militaryReadiness = Math.max(0.3, c.militaryReadiness - 0.003);
      c.milFund = 0;
    } else c.militaryReadiness = Math.min(1, c.militaryReadiness + 0.002);
    c.milFund = Math.min(c.milFund, c.gdp * 0.05 + 2);

    // Research
    const rate = (c as Country & { researchRate?: number }).researchRate ?? 0;
    for (const f of ['military', 'economy', 'society'] as const) {
      const share = f === c.researchFocus ? 0.6 : 0.2;
      const level = Math.floor(c.tech[f]);
      const cost = 120 * (level + 1);
      const before = c.tech[f];
      c.tech[f] += (rate * share) / 365 / cost;
      if (Math.floor(c.tech[f]) > Math.floor(before) && c.playerId) {
        state.news.push({ id: `n${state.nextId++}`, tick: state.tick, cat: 'economy', text: `${c.name} reaches ${f} technology level ${Math.floor(c.tech[f])}`, countries: [c.id] });
      }
    }
    // Party funds: donations
    for (const pid of Object.keys(c.seats)) {
      const p = state.parties[pid];
      if (p) p.funds += (c.gdp * 0.00002 + 0.01) * p.popularity * (1 + c.groups.business.approval / 200);
    }
  }
}

let upkeepCache: { tick: number; map: Map<string, number> } = { tick: -1, map: new Map() };
function unitUpkeepCached(state: GameState, countryId: string) {
  if (upkeepCache.tick !== state.tick) {
    const map = new Map<string, number>();
    for (const u of Object.values(state.units)) map.set(u.owner, (map.get(u.owner) ?? 0) + (UNIT_BY_ID[u.type]?.upkeep ?? 0));
    upkeepCache = { tick: state.tick, map };
  }
  return upkeepCache.map.get(countryId) ?? 0;
}

export function budgetLabel(k: BudgetKey) {
  return { military: 'Defense', health: 'Healthcare', education: 'Education', welfare: 'Welfare & Pensions', infrastructure: 'Infrastructure', research: 'Research', police: 'Police & Justice', admin: 'Administration' }[k];
}
