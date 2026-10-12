import type { StaticWorld } from '../data/static';
import type { Bill, Country, GameState, GovType, GroupId, Ideology, Party } from './types';
import { GROUPS, GROUP_BY_ID } from './content/groups';
import { LAW_BY_ID, lawOption } from './content/laws';
import { lawEffects, lawGroupEffects, modifierSum } from './economy';
import { clamp, newId } from './util';
import { atWar, warScoreFor } from './diplomacy';
import { addNews } from './news';

export const isDemocracy = (g: GovType) => g === 'presidential' || g === 'parliamentary' || g === 'semi_presidential' || g === 'constitutional_monarchy';

export function defaultElectionInterval(g: GovType): number {
  if (g === 'presidential' || g === 'semi_presidential') return 4 * 365;
  if (isDemocracy(g)) return 4 * 365 + 180;
  return -1;
}

export const ideologyDistance = (a: Ideology, b: Ideology) => Math.hypot(a.econ - b.econ, a.social - b.social);

export function governmentIdeology(state: GameState, c: Country): Ideology {
  const members = c.coalition.map((id) => state.parties[id]).filter(Boolean);
  if (!members.length) return { econ: 0, social: 0 };
  let w = 0, econ = 0, social = 0;
  for (const p of members) {
    const weight = (c.seats[p.id] ?? 1) + (p.id === c.rulingParty ? c.legislatureSize * 0.5 : 0);
    econ += p.ideology.econ * weight; social += p.ideology.social * weight; w += weight;
  }
  return { econ: econ / w, social: social / w };
}

/** Target approval each interest group has of the government. */
export function groupTargets(state: GameState, c: Country): Record<GroupId, number> {
  const lawG = lawGroupEffects(c);
  const gov = governmentIdeology(state, c);
  const war = atWar(state, c.id);
  const ws = war ? warScoreFor(state, c.id) : 0;
  const econ = clamp((c.gdpGrowth - 0.02) * 350, -15, 12) - clamp((c.unemployment - 0.06) * 150, -5, 20) - clamp((c.inflation - 0.03) * 150, -5, 20);
  const totalTax = (c.taxes.income + c.taxes.corporate + c.taxes.sales) / 3;
  const b = c.budget;
  const out = {} as Record<GroupId, number>;
  for (const g of GROUPS) {
    let v = 50 + lawG[g.id] + econ;
    v -= ideologyDistance(g.ideology, gov) * 14;
    v -= (totalTax - 20) * 0.4;
    switch (g.id) {
      case 'business': v -= (c.taxes.corporate - 22) * 1.0; v += (b.infrastructure - 3) * 2; v -= (c.debt / c.gdp - 0.8) * 5; break;
      case 'workers': v -= (c.taxes.sales - 15) * 0.5 + (c.taxes.income - 25) * 0.3; v += (b.welfare - 6) * 1.5; v -= (c.unemployment - 0.06) * 150; break;
      case 'farmers': v += (c.taxes.tariffs - 5) * 0.5; v += (b.infrastructure - 3) * 1; break;
      case 'religious': break;
      case 'liberals': v += (c.freedom - 55) * 0.3; v += (b.education - 4.5) * 1.5; v -= c.corruption * 0.1; break;
      case 'greens': v -= (c.pollution - 35) * 0.5; v += (b.research - 1) * 2; break;
      case 'nationalists': v += (b.military - 2) * 2.5; v += war ? (ws > 0 ? 10 : -10) : 0; break;
      case 'retirees': v += (b.health - 5) * 2 + (b.welfare - 6) * 1.2; v -= (c.inflation - 0.03) * 100; break;
      case 'youth': v += (b.education - 4.5) * 2.5; v -= (c.unemployment - 0.06) * 100; break;
      case 'military': v += (b.military - 2) * 5 + (war ? (ws > 0 ? 8 : -6) : 0); v += (c.militaryReadiness - 0.8) * 20; break;
    }
    v += (c.stability - 50) * 0.1 + modifierSum(c, 'approval');
    out[g.id] = clamp(50 + (v - 50) * 0.8, 2, 98);
  }
  return out;
}

/** Monthly political update. */
export function politicsMonthly(state: GameState, world: StaticWorld, c: Country) {
  const targets = groupTargets(state, c);
  let approval = 0;
  for (const g of GROUPS) {
    const gs = c.groups[g.id];
    gs.approval += (targets[g.id] - gs.approval) * 0.35;
    approval += gs.approval * gs.size;
  }
  c.approval = clamp(approval, 0, 100);
  const e = lawEffects(c);
  const regs = state.regions.filter((r) => r.owner === c.id);
  const avgUnrest = regs.reduce((s, r) => s + r.unrest, 0) / Math.max(1, regs.length);
  const war = atWar(state, c.id);
  const legitT = isDemocracy(c.gov)
    ? clamp(68 + e.legitimacy + (c.freedom - 55) * 0.2 - c.corruption * 0.15, 5, 100)
    : clamp(35 + e.legitimacy + c.approval * 0.3 + c.stability * 0.1 - c.corruption * 0.05, 5, 100);
  c.legitimacy += (legitT - c.legitimacy) * 0.15;
  const stabT = clamp(25 + c.approval * 0.45 + c.legitimacy * 0.2 + e.stability - avgUnrest * 0.35 - c.crime * 0.08
    + (war ? (warScoreFor(state, c.id) > 0 ? 2 : -6) : 0) - Math.max(0, c.unemployment - 0.1) * 60 + modifierSum(c, 'stability'), 0, 100);
  c.stability += (stabT - c.stability) * 0.2;
  c.warSupport = clamp(c.warSupport + ((war ? 35 : 25) + c.groups.nationalists.approval * 0.3 - c.warSupport) * 0.1, 0, 100);
  c.coupRisk = !isDemocracy(c.gov) || c.stability < 25 ? clamp((40 - c.stability) * 0.6 + (40 - c.groups.military.approval) * 0.5, 0, 100) : clamp((25 - c.stability) * 0.5, 0, 100);

  // Polling
  const poll = nationalVote(state, world, c);
  for (const [pid, share] of Object.entries(poll)) {
    const p = state.parties[pid];
    if (p) p.popularity += (share - p.popularity) * 0.5;
  }
  for (const pid of Object.keys(c.seats)) {
    const p = state.parties[pid];
    if (p) p.momentum *= 0.8;
  }
}

function partiesOf(state: GameState, c: Country): Party[] {
  return Object.keys(c.seats).map((id) => state.parties[id]).filter(Boolean);
}

/** Vote shares for a region, given group composition adjusted by urbanisation. */
export function regionVote(state: GameState, world: StaticWorld, c: Country, regionId: number, parties = partiesOf(state, c)): Record<string, number> {
  const sr = world.regions[regionId];
  const r = state.regions[regionId];
  const cityPop = (world.citiesByRegion.get(regionId) ?? []).reduce((s, x) => s + x.pop, 0);
  const urban = clamp(cityPop / Math.max(1, sr.pop), 0, 1);
  const votes: Record<string, number> = {};
  for (const p of parties) votes[p.id] = 0;
  for (const g of GROUPS) {
    let size = c.groups[g.id].size;
    if (g.id === 'liberals' || g.id === 'youth' || g.id === 'business') size *= 0.6 + urban * 1.2;
    if (g.id === 'farmers' || g.id === 'religious') size *= 1.4 - urban;
    const approval = c.groups[g.id].approval;
    const scores = parties.map((p) => {
      let s = -ideologyDistance(g.ideology, p.ideology) * 2.6;
      const inGov = c.coalition.includes(p.id);
      if (inGov) s += (approval - 50) / 22; else s -= (approval - 50) / 45;
      s += p.momentum + (r.supportByParty?.[p.id] ?? 0);
      if (p.id === c.rulingParty) s += 0.25; // incumbency
      return s;
    });
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp((s - max) * 1.6));
    const total = exps.reduce((a, b) => a + b, 0);
    parties.forEach((p, i) => { votes[p.id] += size * (exps[i] / total); });
  }
  const tot = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(votes)) votes[k] /= tot;
  return votes;
}

export function nationalVote(state: GameState, world: StaticWorld, c: Country): Record<string, number> {
  const parties = partiesOf(state, c);
  if (parties.length <= 1) return parties.length ? { [parties[0].id]: 1 } : {};
  const out: Record<string, number> = {};
  for (const p of parties) out[p.id] = 0;
  let totalPop = 0;
  for (const id of world.countryByA3.get(c.id)?.regions ?? []) {
    const r = state.regions[id];
    if (r.owner !== c.id || r.controller !== c.id) continue;
    const v = regionVote(state, world, c, id, parties);
    for (const [pid, s] of Object.entries(v)) out[pid] += s * r.pop;
    totalPop += r.pop;
  }
  for (const k of Object.keys(out)) out[k] /= totalPop || 1;
  return out;
}

function allocateSeats(shares: Record<string, number>, seats: number, threshold = 0.03): Record<string, number> {
  const eligible = Object.entries(shares).filter(([, s]) => s >= threshold);
  const tot = eligible.reduce((a, [, s]) => a + s, 0) || 1;
  const out: Record<string, number> = {};
  for (const k of Object.keys(shares)) out[k] = 0;
  const rems: [string, number][] = [];
  let used = 0;
  for (const [k, s] of eligible) {
    const exact = (s / tot) * seats;
    out[k] = Math.floor(exact);
    used += out[k];
    rems.push([k, exact - out[k]]);
  }
  rems.sort((a, b) => b[1] - a[1]);
  for (let i = 0; used < seats && rems.length; i++, used++) out[rems[i % rems.length][0]]++;
  return out;
}

export function holdElection(state: GameState, world: StaticWorld, c: Country) {
  const parties = partiesOf(state, c);
  if (parties.length === 0) return;
  const regionIds = (world.countryByA3.get(c.id)?.regions ?? []).filter((id) => state.regions[id].owner === c.id && state.regions[id].controller === c.id);
  const national: Record<string, number> = {};
  const regionWinners: Record<number, string> = {};
  for (const p of parties) national[p.id] = 0;
  let totalPop = 0;
  const regionResults: { id: number; pop: number; votes: Record<string, number> }[] = [];
  for (const id of regionIds) {
    const v = regionVote(state, world, c, id, parties);
    // a little election-night noise
    for (const k of Object.keys(v)) v[k] *= 0.92 + Math.random() * 0.16;
    const t = Object.values(v).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(v)) v[k] /= t;
    const pop = state.regions[id].pop;
    regionResults.push({ id, pop, votes: v });
    for (const [pid, s] of Object.entries(v)) national[pid] += s * pop;
    totalPop += pop;
    regionWinners[id] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  }
  for (const k of Object.keys(national)) national[k] /= totalPop || 1;

  let seats: Record<string, number>;
  if (c.laws.electoral_system === 'fptp') {
    if (regionResults.length >= 8) {
      const regionSeats = allocateSeats(Object.fromEntries(regionResults.map((r) => [String(r.id), r.pop / totalPop])), c.legislatureSize, 0);
      seats = Object.fromEntries(parties.map((p) => [p.id, 0]));
      for (const r of regionResults) seats[regionWinners[r.id]] += regionSeats[String(r.id)] ?? 0;
    } else {
      // cube law approximates single-member districts
      const cubed = Object.fromEntries(Object.entries(national).map(([k, v]) => [k, v ** 3]));
      const t = Object.values(cubed).reduce((a, b) => a + b, 0) || 1;
      seats = allocateSeats(Object.fromEntries(Object.entries(cubed).map(([k, v]) => [k, v / t])), c.legislatureSize, 0);
    }
  } else {
    seats = allocateSeats(national, c.legislatureSize, 0.04);
  }
  c.seats = seats;
  c.lastElection = { tick: state.tick, votes: national, regionWinners };
  for (const p of parties) p.popularity = national[p.id] ?? 0;

  const prevRuling = c.rulingParty;
  // Form government
  let newRuling: string;
  let coalition: string[];
  const presidential = c.gov === 'presidential' || c.gov === 'semi_presidential';
  if (presidential) {
    newRuling = Object.entries(national).sort((a, b) => b[1] - a[1])[0][0];
    coalition = formCoalition(state, c, newRuling, seats, false);
  } else {
    const largest = Object.entries(seats).sort((a, b) => b[1] - a[1])[0][0];
    newRuling = largest;
    coalition = formCoalition(state, c, largest, seats, true);
  }

  const player = state.parties[prevRuling]?.playerId;
  const keepPlayer = player && !state.settings.electionsCanRemovePlayers;
  if (keepPlayer && newRuling !== prevRuling) {
    newRuling = prevRuling;
    coalition = formCoalition(state, c, prevRuling, seats, !presidential);
    addNews(state, 'election', `${c.name}: ${state.parties[prevRuling].name} clings to power despite losing the vote`, [c.id], undefined, true);
  }
  c.rulingParty = newRuling;
  c.coalition = coalition;
  c.nextElection = state.tick + c.electionInterval;
  // whoever plays the ruling party controls the country; others become opposition
  syncCountryController(state, c);

  const winner = state.parties[newRuling];
  const changed = newRuling !== prevRuling;
  const pctText = `${((national[newRuling] ?? 0) * 100).toFixed(1)}%`;
  addNews(state, 'election', changed
    ? `${c.name} election: ${winner.name} wins with ${pctText}, ousting ${state.parties[prevRuling]?.name ?? 'the government'}`
    : `${c.name} election: ${winner.name} re-elected with ${pctText}`, [c.id], c.capital, Boolean(c.playerId) || changed);
  c.modifiers.push({ id: 'honeymoon', label: 'Post-election honeymoon', until: state.tick + 120, approval: changed ? 8 : 4 });
}

function formCoalition(state: GameState, c: Country, leader: string, seats: Record<string, number>, needMajority: boolean): string[] {
  const coalition = [leader];
  let total = seats[leader] ?? 0;
  const majority = c.legislatureSize / 2;
  if (!needMajority && total > majority) return coalition;
  const lead = state.parties[leader];
  const others = Object.keys(seats).filter((id) => id !== leader && seats[id] > 0 && state.parties[id])
    .sort((a, b) => ideologyDistance(state.parties[a].ideology, lead.ideology) - ideologyDistance(state.parties[b].ideology, lead.ideology));
  for (const id of others) {
    if (total > majority) break;
    // player parties only join coalitions they are already part of
    if (state.parties[id].playerId && !c.coalition.includes(id)) continue;
    if (ideologyDistance(state.parties[id].ideology, lead.ideology) > 1.3) continue;
    coalition.push(id); total += seats[id];
  }
  return coalition;
}

/** The player whose party rules a country controls it. */
export function syncCountryController(state: GameState, c: Country) {
  const ruler = state.parties[c.rulingParty];
  if (ruler?.playerId) c.playerId = ruler.playerId;
  else {
    // keep the player attached (as opposition) so they still see the country
    const playerParty = Object.keys(c.seats).map((id) => state.parties[id]).find((p) => p?.playerId);
    c.playerId = playerParty?.playerId ?? null;
  }
}

/** True if the player controls the government (not just their party). */
export function playerGoverns(state: GameState, c: Country, playerId: string) {
  return state.parties[c.rulingParty]?.playerId === playerId;
}

// ---------------- Legislation ----------------

export function canDecree(c: Country) {
  return !isDemocracy(c.gov) || c.laws.emergency_powers === 'martial_law';
}

export function proposeBill(state: GameState, c: Country, partyId: string, law: string, option: string): Bill | null {
  if (!LAW_BY_ID[law] || !lawOption(law, option) || c.laws[law] === option) return null;
  if (Object.values(state.bills).some((b) => b.country === c.id && b.law === law)) return null;
  const id = newId(state, 'b');
  const bill: Bill = { id, country: c.id, law, option, sponsor: partyId, introduced: state.tick, voteOn: state.tick + 21 };
  state.bills[id] = bill;
  return bill;
}

export function billVotes(state: GameState, c: Country, bill: Bill): { yes: number; no: number; byParty: Record<string, 'yes' | 'no'> } {
  const opt = lawOption(bill.law, bill.option)!;
  const cur = lawOption(bill.law, c.laws[bill.law]);
  let yes = 0, no = 0;
  const byParty: Record<string, 'yes' | 'no'> = {};
  for (const [pid, n] of Object.entries(c.seats)) {
    const p = state.parties[pid];
    if (!p || n <= 0) continue;
    const dNew = ideologyDistance(p.ideology, opt.ideology);
    const dCur = cur ? ideologyDistance(p.ideology, cur.ideology) : 1;
    let support = dCur - dNew; // positive = prefers new option
    const sponsorInGov = c.coalition.includes(bill.sponsor);
    if (pid === bill.sponsor) support += 2;
    else if (c.coalition.includes(pid) && sponsorInGov) support += 0.45; // coalition discipline
    else if (!c.coalition.includes(pid) && sponsorInGov) support -= 0.15; // opposition reflex
    const stance = p.playerId && p.id !== bill.sponsor ? p.billStance[bill.id] : undefined;
    if (stance) support = stance === 'yes' ? 1 : -1;
    const v = support > 0 ? 'yes' : 'no';
    byParty[pid] = v;
    if (v === 'yes') yes += n; else no += n;
  }
  return { yes, no, byParty };
}

export function resolveBills(state: GameState) {
  for (const bill of Object.values(state.bills)) {
    if (bill.voteOn > state.tick) continue;
    const c = state.countries[bill.country];
    delete state.bills[bill.id];
    if (!c) continue;
    const { yes, no } = billVotes(state, c, bill);
    const law = LAW_BY_ID[bill.law];
    const opt = lawOption(bill.law, bill.option)!;
    if (yes > no) {
      c.laws[bill.law] = bill.option;
      addNews(state, 'politics', `${c.name} passes ${law.name}: ${opt.name} (${yes}–${no})`, [c.id], undefined, Boolean(c.playerId));
      const sponsor = state.parties[bill.sponsor];
      if (sponsor) sponsor.momentum += 0.05;
    } else {
      addNews(state, 'politics', `${c.name} legislature rejects ${law.name}: ${opt.name} (${yes}–${no})`, [c.id], undefined, Boolean(c.playerId));
      if (c.coalition.includes(bill.sponsor)) c.modifiers.push({ id: 'bill_defeat', label: 'Legislative defeat', until: state.tick + 60, approval: -2 });
    }
  }
}

export function groupName(g: GroupId) { return GROUP_BY_ID[g].name; }
