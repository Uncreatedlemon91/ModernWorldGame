import type { StaticWorld } from '../data/static';
import type {
  Country, Formation, GameSettings, GameState, GovType, GroupId, GroupState, Party, Region, TaxKey, BudgetKey, Unit,
} from './types';
import { MAJORS, ORGS, PACTS, ONE_PARTY, ABS_MONARCHY, CONST_MONARCHY, JUNTA, THEOCRACY, SEMI_PRES, EASTERN, CHINESE, WESTERN_EXTRA, type PartySeed } from './content/majors';
import { LAWS } from './content/laws';
import { GROUPS } from './content/groups';
import { UNIT_BY_ID } from './content/units';
import { BUILDING_BY_ID } from './content/buildings';
import { Rng, hashString } from './rng';
import { clamp, hexToRgb, newId } from './util';
import { isDemocracy, defaultElectionInterval, groupTargets, politicsMonthly } from './politics';
import { recomputeCountryEconomy, regionGdp } from './economy';
import { applyScenario } from './content/scenarios';
import { seedCabinet } from './cabinet';
import { OIL_PRODUCERS, commoditiesMonthly } from './trade';

export const DEFAULT_SETTINGS: GameSettings = {
  scenario: 'realworld',
  fogOfWar: true,
  startYear: 2026,
  electionsCanRemovePlayers: true,
  aiAggression: 1,
  disasterFrequency: 1,
  economyDifficulty: 1,
};

const DEBT_RATIO: Record<string, number> = {
  JPN: 2.4, USA: 1.22, ITA: 1.37, GBR: 1.0, FRA: 1.12, CAN: 1.07, ESP: 1.05, CHN: 0.88, DEU: 0.63, RUS: 0.2, SAU: 0.26,
  IND: 0.83, BRA: 0.87, KOR: 0.55, AUS: 0.5, MEX: 0.58, TUR: 0.3, ARG: 0.85, EGY: 0.9, PAK: 0.75, GRC: 1.6, SGP: 1.7,
};

function govFor(a3: string, continent: string, income: string): GovType {
  if (MAJORS[a3]) return MAJORS[a3].gov;
  if (ONE_PARTY.has(a3)) return 'one_party';
  if (ABS_MONARCHY.has(a3)) return 'absolute_monarchy';
  if (CONST_MONARCHY.has(a3)) return 'constitutional_monarchy';
  if (JUNTA.has(a3)) return 'military_junta';
  if (THEOCRACY.has(a3)) return 'theocracy';
  if (SEMI_PRES.has(a3)) return 'semi_presidential';
  if (continent === 'South America' || continent === 'North America' || (continent === 'Africa' && !income.startsWith('1'))) return 'presidential';
  return 'parliamentary';
}

const LEADER_TITLE: Record<GovType, string> = {
  presidential: 'President', parliamentary: 'Prime Minister', semi_presidential: 'President', constitutional_monarchy: 'Prime Minister',
  one_party: 'Chairman', absolute_monarchy: 'King', military_junta: 'General', theocracy: 'Supreme Leader',
};

function blocFor(a3: string, orgs: Map<string, string[]>): string {
  if (MAJORS[a3]) return MAJORS[a3].bloc;
  if (orgs.get('nato')?.includes(a3) || orgs.get('eu')?.includes(a3) || WESTERN_EXTRA.has(a3)) return 'western';
  if (CHINESE.has(a3)) return 'chinese';
  if (EASTERN.has(a3)) return 'eastern';
  return 'nonaligned';
}

function genericParties(gov: GovType, name: string, rng: Rng): PartySeed[] {
  const mk = (n: string, s: string, c: string, econ: number, social: number, share: number): PartySeed => ({ name: n, short: s, color: c, ideology: { econ, social }, share });
  if (gov === 'one_party') return [mk(`${name} Workers' Party`, 'WP', '#c62828', -0.8, 0.7, 1)];
  if (gov === 'absolute_monarchy') return [mk('Royal Court', 'Crown', '#7b5e2b', 0.4, 0.9, 1)];
  if (gov === 'military_junta') return [mk('National Salvation Council', 'NSC', '#4e5d3a', 0.2, 0.9, 1)];
  if (gov === 'theocracy') return [mk('Guardians of the Faith', 'GF', '#2e7d32', 0, 1, 0.8), mk('Reform Front', 'RF', '#66bb6a', 0.1, 0.2, 0.2)];
  const variants = [
    [mk('Social Democrats', 'SD', '#e53935', -0.5, -0.3, 0), mk('Conservative Union', 'CU', '#1e5bb8', 0.5, 0.5, 0), mk('Liberal Party', 'LP', '#f5b82e', 0.4, -0.5, 0), mk('National Front', 'NF', '#3d2b8f', 0.2, 0.9, 0), mk('Greens', 'GRN', '#43a047', -0.6, -0.8, 0)],
    [mk("People's Party", 'PP', '#1976d2', 0.4, 0.5, 0), mk('Labour Movement', 'LM', '#d32f2f', -0.6, -0.1, 0), mk('Democratic Alliance', 'DA', '#00897b', 0.1, -0.4, 0), mk('Patriotic Union', 'PU', '#6d4c41', 0.2, 0.8, 0)],
    [mk('Progress Party', 'PRG', '#fb8c00', 0.3, -0.2, 0), mk('Socialist Party', 'SP', '#c2185b', -0.8, -0.2, 0), mk('Christian Democrats', 'CD', '#283593', 0.3, 0.7, 0), mk('Liberal Democrats', 'LD', '#fdd835', 0.5, -0.6, 0)],
  ];
  const parties = variants[Math.floor(rng.next() * variants.length)].map((p) => ({ ...p }));
  let remaining = 1;
  parties.forEach((p, i) => {
    const share = i === parties.length - 1 ? remaining : remaining * rng.range(0.3, 0.55);
    p.share = share;
    remaining -= share;
  });
  parties.sort((a, b) => b.share - a.share);
  return parties;
}

function defaultLaws(gov: GovType, income: string): Record<string, string> {
  const rich = income.startsWith('1') || income.startsWith('2');
  const poor = income.startsWith('4') || income.startsWith('5');
  const auth = !isDemocracy(gov);
  const laws: Record<string, string> = {};
  for (const law of LAWS) laws[law.id] = law.options[Math.min(1, law.options.length - 1)].id;
  laws.emergency_powers = 'none';
  laws.healthcare = rich ? 'universal' : poor ? 'private' : 'mixed';
  laws.education_system = 'public';
  laws.pensions = rich ? 'state_basic' : poor ? 'private' : 'state_basic';
  laws.minimum_wage = 'low';
  laws.carbon = rich ? 'cap_trade' : 'none';
  laws.energy_mix = rich ? 'mixed' : 'fossil';
  laws.electoral_system = 'proportional';
  laws.term_limits = auth ? 'none' : 'strict';
  laws.central_bank = auth ? 'political' : 'independent';
  laws.nuclear_weapons = 'none';
  laws.trade_policy = 'balanced';
  if (auth) {
    laws.press = 'state_media';
    laws.surveillance = 'mass';
    laws.policing = 'tough';
    laws.death_penalty = 'legal';
    laws.social_rights = 'traditional';
    laws.federalism = 'centralised';
  } else {
    laws.press = rich ? 'free' : 'regulated';
    laws.death_penalty = rich ? 'abolished' : 'legal';
  }
  if (gov === 'theocracy' || gov === 'absolute_monarchy') laws.religion = 'state_religion';
  return laws;
}

function groupSizes(income: string, gov: GovType, rng: Rng): Record<GroupId, GroupState> {
  const rich = income.startsWith('1') || income.startsWith('2');
  const poor = income.startsWith('4') || income.startsWith('5');
  const base: Record<GroupId, number> = rich
    ? { workers: 0.22, business: 0.08, farmers: 0.03, religious: 0.1, liberals: 0.18, greens: 0.07, nationalists: 0.08, retirees: 0.14, youth: 0.08, military: 0.02 }
    : poor
      ? { workers: 0.24, business: 0.03, farmers: 0.27, religious: 0.18, liberals: 0.04, greens: 0.01, nationalists: 0.08, retirees: 0.04, youth: 0.09, military: 0.02 }
      : { workers: 0.27, business: 0.05, farmers: 0.12, religious: 0.14, liberals: 0.1, greens: 0.03, nationalists: 0.1, retirees: 0.09, youth: 0.08, military: 0.02 };
  if (gov === 'theocracy' || gov === 'absolute_monarchy') { base.religious += 0.12; base.liberals *= 0.5; }
  let total = 0;
  for (const k of Object.keys(base) as GroupId[]) { base[k] *= rng.range(0.8, 1.2); total += base[k]; }
  const out = {} as Record<GroupId, GroupState>;
  for (const g of GROUPS) out[g.id] = { size: base[g.id] / total, approval: 50 };
  return out;
}

const COLOR_PALETTE = ['#5b8def', '#e0605a', '#55b37c', '#e8b04a', '#9a6fd8', '#4bb8c4', '#d77fae', '#8fb04a', '#d98a4b', '#6f7fd8', '#c45a7a', '#5aa39b', '#b58f5a'];

export function createInitialState(world: StaticWorld, settings: GameSettings = DEFAULT_SETTINGS, seed = Date.now() % 1e9): GameState {
  const rng = new Rng(seed);
  const state: GameState = {
    version: 1,
    phase: 'lobby',
    tick: 0,
    startDate: `${settings.startYear}-01-01`,
    speed: 2,
    paused: true,
    settings,
    players: {},
    countries: {},
    regions: [],
    parties: {},
    units: {},
    formations: {},
    treaties: {},
    orgs: {},
    wars: {},
    proposals: {},
    bills: {},
    decisions: {},
    referendums: {},
    history: {},
    commodityPrices: { oil: 75, minerals: 100, food: 100, goods: 100 },
    news: [],
    mapEvents: {},
    relations: {},
    sanctions: {},
    chat: [],
    global: { oilPrice: 75, worldGrowth: 0, pandemic: { active: false, severity: 0, until: 0 } },
    nextId: 1,
    seed,
  };

  const orgMembers = new Map(ORGS.map((o) => [o.id, o.members]));

  // ---- Regions ----
  const capitalByCountry = new Map<string, number>();
  for (const city of world.cities) if (city.cap && !capitalByCountry.has(world.regions[city.r].c)) capitalByCountry.set(world.regions[city.r].c, city.r);

  state.regions = world.regions.map((r): Region => ({
    id: r.id, owner: r.c, controller: r.c, pop: r.pop, prosperity: 50, productivity: 10, unrest: 5, devastation: 0,
    buildings: {}, construction: [], fort: 0,
  }));

  // ---- Countries ----
  const yearsSince2019 = settings.startYear - 2019;
  for (const sc of world.countries) {
    const major = MAJORS[sc.a3];
    const gov = govFor(sc.a3, sc.continent, sc.income);
    const crng = new Rng(hashString(sc.a3) ^ seed);
    const rich = sc.income.startsWith('1') || sc.income.startsWith('2');
    const poor = sc.income.startsWith('4') || sc.income.startsWith('5');
    const regs = sc.regions;
    const pop = regs.reduce((s, id) => s + state.regions[id].pop, 0);
    const gdp = Math.max(0.2, (sc.gdp / 1000) * Math.pow(rich ? 1.035 : 1.06, yearsSince2019));
    const gdppcK = (gdp * 1e6) / Math.max(1, pop); // thousands USD per capita

    // Distribute productivity: urban regions are more productive.
    const urbanShare = regs.map((id) => {
      const cityPop = (world.citiesByRegion.get(id) || []).reduce((s, c) => s + c.pop, 0);
      return clamp(cityPop / Math.max(1, state.regions[id].pop), 0, 1.5);
    });
    const meanUrban = urbanShare.reduce((s, v, i) => s + v * state.regions[regs[i]].pop, 0) / Math.max(1, pop);
    const rawProd = urbanShare.map((u) => 0.65 + 0.7 * (u / Math.max(0.05, meanUrban || 0.05)) ** 0.5 * 0.5 + crng.range(-0.05, 0.05));
    const rawGdp = rawProd.reduce((s, p, i) => s + p * state.regions[regs[i]].pop, 0);
    regs.forEach((id, i) => {
      const reg = state.regions[id];
      reg.productivity = (rawProd[i] * gdppcK * pop) / Math.max(1, rawGdp);
      reg.prosperity = clamp(25 * Math.log10(Math.max(0.3, reg.productivity)) + 32, 5, 95);
      reg.unrest = clamp((poor ? 15 : rich ? 4 : 9) + crng.range(-3, 3), 0, 100);
    });

    let partySeeds = major?.parties ?? genericParties(gov, sc.name, crng);
    partySeeds = partySeeds.map((p) => ({ ...p }));
    const partyIds: string[] = [];
    for (const ps of partySeeds) {
      const id = `${sc.a3}_${ps.short.replace(/[^A-Za-z0-9]/g, '') || 'P'}_${partyIds.length}`;
      partyIds.push(id);
      const party: Party = {
        id, country: sc.a3, name: ps.name, short: ps.short, color: hexToRgb(ps.color), ideology: { ...ps.ideology },
        popularity: ps.share, funds: Math.max(5, gdp * 0.02 * ps.share), playerId: null, momentum: 0, billStance: {},
      };
      state.parties[id] = party;
    }
    const legislatureSize = !isDemocracy(gov) ? 100 : clamp(Math.round(Math.sqrt(pop / 1000) * 2.2), 60, 600);
    const seats: Record<string, number> = {};
    let assigned = 0;
    partyIds.forEach((pid, i) => {
      const n = i === partyIds.length - 1 ? legislatureSize - assigned : Math.round(partySeeds[i].share * legislatureSize);
      seats[pid] = Math.max(0, n);
      assigned += seats[pid];
    });
    const coalition = [partyIds[0], ...(major?.coalition ?? []).map((i) => partyIds[i]).filter(Boolean)];

    const laws = { ...defaultLaws(gov, sc.income), ...(major?.laws ?? {}) };
    const taxes: Record<TaxKey, number> = rich
      ? { income: 30, corporate: 22, sales: 16, tariffs: 3 }
      : poor ? { income: 12, corporate: 20, sales: 12, tariffs: 10 } : { income: 20, corporate: 22, sales: 15, tariffs: 6 };
    if (sc.a3 === 'USA') Object.assign(taxes, { income: 26, corporate: 21, sales: 7, tariffs: 12 });
    if (ABS_MONARCHY.has(sc.a3)) Object.assign(taxes, { income: 0, corporate: 15, sales: 10, tariffs: 5 });
    const milPct = major?.military ?? clamp(1.2 + crng.range(-0.5, 1.2) + (gov === 'military_junta' ? 1.5 : 0), 0.4, 6);
    const budget: Record<BudgetKey, number> = rich
      ? { military: milPct, health: 6, education: 5, welfare: 9, infrastructure: 3, research: 1.2, police: 1.5, admin: 3 }
      : poor ? { military: milPct, health: 2, education: 3, welfare: 2, infrastructure: 3, research: 0.2, police: 1.5, admin: 2.5 }
        : { military: milPct, health: 4, education: 4, welfare: 5, infrastructure: 3.5, research: 0.6, police: 1.5, admin: 3 };
    if (sc.a3 === 'USA') Object.assign(budget, { welfare: 6.5, health: 6.5, admin: 2.5, infrastructure: 2.5 });
    const debt = gdp * (DEBT_RATIO[sc.a3] ?? (rich ? 0.75 : poor ? 0.5 : 0.6));
    const bloc = blocFor(sc.a3, orgMembers);
    const color = hexToRgb(COLOR_PALETTE[(sc.mapcolor + hashString(sc.a3)) % COLOR_PALETTE.length]);
    const capital = capitalByCountry.get(sc.a3) ?? regs.reduce((best, id) => (state.regions[id].pop > state.regions[best].pop ? id : best), regs[0]);

    const country: Country = {
      id: sc.a3, name: sc.name, color, gov, leaderTitle: major?.leaderTitle ?? LEADER_TITLE[gov],
      rulingParty: partyIds[0], coalition, playerId: null, bloc, capital,
      gdp, gdpGrowth: major?.growth ?? (rich ? 0.018 : poor ? 0.045 : 0.032), baseGrowth: major?.growth ?? (rich ? 0.018 : poor ? 0.045 : 0.032),
      inflation: rich ? 0.025 : 0.05, unemployment: rich ? 0.05 : 0.08, interestRate: rich ? 0.035 : 0.07,
      treasury: gdp * 0.03, debt, revenue: 0, expenses: 0, taxes, budget, energy: 1.05, energyBase: gdp * 0.1 * 0.92, milFund: gdp * milPct / 100 * 0.1, tradeOpenness: 0.4, creditRating: 'A',
      laws, groups: groupSizes(sc.income, gov, crng), approval: 50, stability: rich ? 70 : poor ? 45 : 58, legitimacy: isDemocracy(gov) ? 70 : 55,
      corruption: rich ? 20 : poor ? 60 : 40, freedom: 50, health: rich ? 75 : poor ? 35 : 55, education: rich ? 78 : poor ? 35 : 55, crime: 30, pollution: 35,
      warSupport: 40, legislatureSize, seats, nextElection: -1, electionInterval: defaultElectionInterval(gov), lastElection: null, coupRisk: 0,
      manpower: 0, tech: { military: rich ? 3 : poor ? 1 : 2, economy: rich ? 3 : poor ? 1 : 2, society: rich ? 3 : poor ? 1 : 2 },
      researchFocus: 'economy', militaryReadiness: 1, nukes: major?.nukes ?? 0, production: [], cabinet: {} as Country['cabinet'], candidates: [], market: 100,
      ai: { aggression: clamp((major?.aggression ?? crng.range(0.1, 0.45)) * settings.aiAggression, 0, 1.5), caution: crng.range(0.3, 0.8), lastWarCheck: 0 },
      modifiers: [],
    };
    if (['USA', 'CHN', 'RUS'].includes(sc.a3)) country.tech.military = 5;
    if (['GBR', 'FRA', 'ISR', 'JPN', 'KOR', 'DEU'].includes(sc.a3)) country.tech.military = 4;
    if (country.electionInterval > 0) country.nextElection = Math.floor(crng.range(0.2, 1) * country.electionInterval);
    country.manpower = pop * 0.004;
    state.countries[sc.a3] = country;

    seedBuildings(state, world, country, crng);
    const oilLv = OIL_PRODUCERS[sc.a3] ?? 0;
    if (oilLv) {
      const cands = [...regs].sort((a, b) => {
        const score = (id: number) => (['desert', 'arctic', 'plains'].includes(world.regions[id].terrain) ? 2 : 1) * Math.sqrt(world.regions[id].area);
        return score(b) - score(a);
      });
      for (let k = 0; k < oilLv; k++) { const r = state.regions[cands[k % Math.min(cands.length, Math.max(1, Math.ceil(oilLv / 2)))]]; r.buildings.oil = Math.min(3, (r.buildings.oil ?? 0) + 1); }
    }
  }

  // ---- Organizations & treaties ----
  for (const o of ORGS) {
    state.orgs[o.id] = { id: o.id, name: o.name, short: o.short, kind: o.kind, members: o.members.filter((m) => state.countries[m]), founder: o.members[0], color: hexToRgb(o.color) };
  }
  for (const [a, b] of PACTS) {
    if (!state.countries[a] || !state.countries[b]) continue;
    const id = newId(state, 't');
    state.treaties[id] = { id, type: 'defensive_pact', a, b, since: 0 };
  }
  // trade agreements inside economic blocs are implicit via org membership

  // ---- Military ----
  for (const sc of world.countries) seedMilitary(state, world, state.countries[sc.a3], rng);

  for (const c of Object.values(state.countries)) seedCabinet(state, world, c);
  applyScenario(state, world, settings.scenario ?? 'peaceful');

  commoditiesMonthly(state, world);
  for (const c of Object.values(state.countries)) c.growthCal = undefined;
  for (const c of Object.values(state.countries)) recomputeCountryEconomy(state, world, c, true);
  for (const c of Object.values(state.countries)) {
    const targets = groupTargets(state, c);
    for (const g of Object.keys(c.groups) as GroupId[]) c.groups[g].approval = targets[g];
    for (let i = 0; i < 6; i++) politicsMonthly(state, world, c);
    recomputeCountryEconomy(state, world, c, true);
  }
  return state;
}

function seedBuildings(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  const sc = world.countryByA3.get(c.id)!;
  const regs = sc.regions.map((id) => state.regions[id]);
  const totalGdp = regs.reduce((s, r) => s + regionGdp(r), 0) || 1;
  for (const r of regs) {
    const share = regionGdp(r) / totalGdp;
    const g = regionGdp(r);
    const sr = world.regions[r.id];
    const lvl = (v: number, max: number) => clamp(Math.round(v), 0, max);
    const b = r.buildings;
    b.factory = lvl(Math.log10(g + 1) * 1.2 * rng.range(0.6, 1.2), 5);
    if (r.productivity > 30) b.tech_park = lvl(Math.log10(g + 1) * 0.6, 3);
    if (sr.terrain === 'plains' || sr.terrain === 'forest') b.farm = lvl(1 + rng.range(0, 1.5), 3);
    if (sr.terrain === 'desert' && rng.chance(0.35)) b.oil = lvl(1 + rng.range(0, 2), 3);
    if ((sr.terrain === 'mountains' || sr.terrain === 'hills') && rng.chance(0.4)) b.mine = 1;
    const ports = world.portsByRegion.get(r.id);
    if (ports?.length) b.port = lvl(Math.max(...ports.map((p) => p.size)) / 3, 3);
    if (world.airports.some((a) => a.r === r.id && a.size >= 3)) b.airport = 1;
    if (r.productivity > 8) b.highway = lvl(Math.log10(g + 1) * 0.8, 3);
    if (r.productivity > 30 && g > 100) b.rail = 1;
    b.university = lvl(Math.log10(g + 1) * 0.5 * (r.productivity > 15 ? 1.4 : 0.8), 3);
    b.hospital = lvl(Math.log10(g + 1) * 0.5 * (r.productivity > 15 ? 1.4 : 0.8), 3);
    b.housing = lvl(Math.log10(r.pop + 1) - 5, 5);
    if (share > 0.25 || r.id === c.capital) b.power_gas = lvl(1 + share * 3, 4);
    for (const k of Object.keys(b)) if (!b[k]) delete b[k];
  }
  // Military infrastructure: capital gets army + air base; biggest port gets naval base.
  const cap = state.regions[c.capital];
  cap.buildings.military_base = 1;
  if (c.gdp > 15) cap.buildings.air_base = 1;
  const coastal = regs.filter((r) => world.regions[r.id].coastal).sort((a, b) => (b.buildings.port ?? 0) - (a.buildings.port ?? 0) || b.pop - a.pop);
  if (coastal.length && c.gdp > 20) coastal[0].buildings.naval_base = 1;
  // larger countries: a few extra bases in populous regions
  const byPop = [...regs].sort((a, b) => b.pop - a.pop);
  const extra = Math.min(6, Math.floor(regs.length / 8));
  for (let i = 0; i < extra; i++) {
    byPop[i + 1] && (byPop[i + 1].buildings.military_base = 1);
    if (i % 2 === 0 && byPop[i + 2]) byPop[i + 2].buildings.air_base = 1;
  }
  if (coastal.length > 4 && c.gdp > 500) coastal[Math.floor(coastal.length / 2)].buildings.naval_base = 1;
}

const BATTALION_MIX = ['infantry', 'infantry', 'infantry', 'mech_infantry', 'artillery', 'infantry', 'armor', 'air_defense'];

function seedMilitary(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  const major = MAJORS[c.id];
  let forces: Record<string, number>;
  if (major) forces = { ...major.forces };
  else {
    const size = clamp(Math.round(Math.pow(c.gdp, 0.42) * (c.budget.military / 1.5) * 0.9), 1, 36);
    forces = {};
    for (let i = 0; i < size; i++) {
      const t = BATTALION_MIX[i % BATTALION_MIX.length];
      if ((t === 'armor' || t === 'mech_infantry' || t === 'air_defense') && c.tech.military < 1) { forces.infantry = (forces.infantry ?? 0) + 1; continue; }
      forces[t] = (forces[t] ?? 0) + 1;
    }
    if (c.gdp > 30) { forces.fighter = Math.max(1, Math.round(Math.pow(c.gdp, 0.3) / 3)); forces.helicopter = 1; }
    if (c.gdp > 150) forces.strike = Math.round(Math.pow(c.gdp, 0.3) / 4);
    const sc = world.countryByA3.get(c.id)!;
    if (sc.regions.some((id) => world.regions[id].coastal) && c.gdp > 20) {
      forces.corvette = Math.max(1, Math.round(Math.pow(c.gdp, 0.3) / 4));
      if (c.gdp > 200) forces.frigate = Math.round(Math.pow(c.gdp, 0.3) / 4);
      if (c.gdp > 400) forces.submarine = 2;
    }
  }
  const sc = world.countryByA3.get(c.id)!;
  const regs = sc.regions;
  const baseRegions = regs.filter((id) => state.regions[id].buildings.military_base);
  const airRegions = regs.filter((id) => state.regions[id].buildings.air_base);
  const navalRegions = regs.filter((id) => state.regions[id].buildings.naval_base);

  const land: Unit[] = [], air: Unit[] = [], naval: Unit[] = [];
  const counters: Record<string, number> = {};
  for (const [type, count] of Object.entries(forces)) {
    const def = UNIT_BY_ID[type];
    if (!def) continue;
    for (let i = 0; i < count; i++) {
      counters[type] = (counters[type] ?? 0) + 1;
      const home = def.domain === 'naval' ? (navalRegions[0] ?? c.capital) : def.domain === 'air' ? (airRegions[i % Math.max(1, airRegions.length)] ?? c.capital) : (baseRegions[i % Math.max(1, baseRegions.length)] ?? c.capital);
      const id = newId(state, 'u');
      const unit: Unit = { id, type, owner: c.id, name: `${ordinal(counters[type])} ${def.name}`, strength: 1, org: 1, xp: rng.range(0.1, 0.4), parent: null, home, training: 0 };
      state.units[id] = unit;
      (def.domain === 'land' ? land : def.domain === 'air' ? air : naval).push(unit);
    }
  }

  // Interleave unit types so regiments are combined-arms.
  const byType = new Map<string, Unit[]>();
  for (const u of land) { if (!byType.has(u.type)) byType.set(u.type, []); byType.get(u.type)!.push(u); }
  const mixed: Unit[] = [];
  while (mixed.length < land.length) for (const list of byType.values()) { const u = list.shift(); if (u) mixed.push(u); }

  const regiments: Formation[] = [];
  for (let i = 0; i < mixed.length; i += 4) {
    const members = mixed.slice(i, i + 4);
    const f = makeFormation(state, world, c.id, 'regiment', `${ordinal(regiments.length + 1)} Regiment`, members[0].home);
    for (const u of members) { u.parent = f.id; f.units.push(u.id); }
    f.manned = true;
    regiments.push(f);
  }
  // Group regiments into armies placed in populous / border regions.
  const borderRegions = regs.filter((id) => world.regions[id].nb.some((n) => world.regions[n].c !== c.id));
  const stationRegions = [c.capital, ...borderRegions.sort((a, b) => state.regions[b].pop - state.regions[a].pop)];
  const armies: Formation[] = [];
  const perArmy = 4;
  for (let i = 0; i < regiments.length; i += perArmy) {
    const station = stationRegions[armies.length % stationRegions.length];
    const army = makeFormation(state, world, c.id, 'army', `${ordinal(armies.length + 1)} Army`, station);
    for (const reg of regiments.slice(i, i + perArmy)) { reg.parent = army.id; army.children.push(reg.id); reg.pos = { ...army.pos }; }
    army.manned = true;
    armies.push(army);
  }
  // Helicopters support armies; other aircraft form air groups.
  const helis = air.filter((u) => u.type === 'helicopter');
  helis.forEach((u, i) => { const army = armies[i % Math.max(1, armies.length)]; if (army) { u.parent = army.id; army.units.push(u.id); } });
  const jets = air.filter((u) => u.type !== 'helicopter');
  for (let i = 0; i < jets.length; i += 8) {
    const members = jets.slice(i, i + 8);
    const tf = makeFormation(state, world, c.id, 'taskforce', `${ordinal(Math.floor(i / 8) + 1)} Air Group`, members[0].home);
    for (const u of members) { u.parent = tf.id; tf.units.push(u.id); }
    tf.manned = true;
  }
  // Naval task forces: carriers lead, escorts follow.
  naval.sort((a, b) => (b.type === 'carrier' ? 1 : 0) - (a.type === 'carrier' ? 1 : 0));
  const fleetNames = ['1st Fleet', '2nd Fleet', '3rd Fleet', '4th Fleet', '5th Fleet', '6th Fleet', '7th Fleet', '8th Fleet', '9th Fleet', '10th Fleet', '11th Fleet', '12th Fleet', '13th Fleet', '14th Fleet', '15th Fleet', '16th Fleet'];
  let nf = 0;
  for (let i = 0; i < naval.length; i += 6) {
    const members = naval.slice(i, i + 6);
    const tf = makeFormation(state, world, c.id, 'taskforce', fleetNames[nf] ?? `Task Force ${nf + 1}`, members[0].home);
    nf++;
    tf.manned = true;
    for (const u of members) { u.parent = tf.id; tf.units.push(u.id); }
    // spread fleets out at sea near home
    const port = world.portsByRegion.get(members[0].home)?.[0];
    if (port) { tf.pos.lon = port.lon; tf.pos.lat = port.lat; }
  }
}

export function makeFormation(state: GameState, world: StaticWorld, owner: string, kind: Formation['kind'], name: string, region: number): Formation {
  const id = newId(state, 'f');
  const sr = world.regions[region];
  const f: Formation = {
    id, kind, owner, name, units: [], children: [], parent: null, order: { kind: 'hold' },
    pos: { region, lon: sr.lon, lat: sr.lat, path: [], pathRegions: [], progress: 0, atSea: false },
    stance: 'balanced', inCombat: false, manned: false,
  };
  state.formations[id] = f;
  return f;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { BUILDING_BY_ID };
