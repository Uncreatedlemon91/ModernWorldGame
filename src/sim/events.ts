import type { StaticWorld } from '../data/static';
import type { Country, Decision, GameState, MapEventKind } from './types';
import { Rng } from './rng';
import { clamp, newId, dateOf, fmtMoney } from './util';
import { addNews } from './news';
import { atWar } from './diplomacy';
import { isDemocracy, syncCountryController } from './politics';

interface EventOption { id: string; label: string; detail: string; apply: (s: GameState, c: Country, region: number) => void }
interface EventDef {
  id: string;
  kind: MapEventKind;
  title: string;
  /** daily probability for a given country (region chosen by pickRegion) */
  chance: (s: GameState, w: StaticWorld, c: Country) => number;
  pickRegion: (s: GameState, w: StaticWorld, c: Country, rng: Rng) => number | null;
  duration: number;
  severity: (rng: Rng) => number;
  text: (c: Country, regionName: string, sev: number) => string;
  /** immediate consequences */
  impact: (s: GameState, w: StaticWorld, c: Country, region: number, sev: number) => void;
  options: EventOption[];
  aiChoice?: (s: GameState, c: Country) => number;
  globalNews?: (sev: number) => boolean;
}

let regionCache: { tick: number; state: GameState | null; map: Map<string, GameState['regions']> } = { tick: -1, state: null, map: new Map() };
const regionsOf = (s: GameState, c: Country) => {
  if (regionCache.tick !== s.tick || regionCache.state !== s) {
    const map = new Map<string, GameState['regions']>();
    for (const r of s.regions) {
      if (r.owner !== r.controller) continue;
      if (!map.has(r.owner)) map.set(r.owner, []);
      map.get(r.owner)!.push(r);
    }
    regionCache = { tick: s.tick, state: s, map };
  }
  return regionCache.map.get(c.id) ?? [];
};
const weightedPick = (rng: Rng, ids: number[], w: (id: number) => number) => {
  const ws = ids.map(w);
  const t = ws.reduce((a, b) => a + b, 0);
  if (t <= 0) return null;
  let x = rng.next() * t;
  for (let i = 0; i < ids.length; i++) { x -= ws[i]; if (x <= 0) return ids[i]; }
  return ids[ids.length - 1];
};
const month = (s: GameState) => dateOf(s).getUTCMonth();
const mod = (c: Country, id: string, label: string, s: GameState, days: number, fx: Partial<Country['modifiers'][number]>) =>
  c.modifiers.push({ id, label, until: s.tick + days, ...fx });

const reliefCost = (c: Country, sev: number) => Math.max(0.05, c.gdp * 0.002 * sev);

export const EVENTS: EventDef[] = [
  {
    id: 'hurricane', kind: 'hurricane', title: 'Hurricane',
    chance: (s, w, c) => {
      const m = month(s);
      const regs = regionsOf(s, c).filter((r) => w.regions[r.id].coastal && Math.abs(w.regions[r.id].lat) > 8 && Math.abs(w.regions[r.id].lat) < 38);
      const north = regs.some((r) => w.regions[r.id].lat > 0);
      const season = north ? (m >= 5 && m <= 10) : (m <= 3 || m === 11);
      return regs.length && season ? 0.0025 * Math.min(3, regs.length ** 0.5) : 0;
    },
    pickRegion: (s, w, c, rng) => weightedPick(rng, regionsOf(s, c).filter((r) => w.regions[r.id].coastal && Math.abs(w.regions[r.id].lat) > 8 && Math.abs(w.regions[r.id].lat) < 38).map((r) => r.id), () => 1),
    duration: 10, severity: (rng) => rng.range(0.3, 1),
    text: (c, rn, sev) => `Category ${Math.ceil(sev * 5)} hurricane makes landfall in ${rn}, ${c.name}`,
    impact: (s, _w, _c, r, sev) => { const reg = s.regions[r]; reg.devastation = Math.min(100, reg.devastation + 25 * sev); reg.productivity *= 1 - 0.02 * sev; reg.pop *= 1 - 0.0005 * sev; },
    options: [
      { id: 'relief', label: 'Emergency relief package', detail: 'Costs money; boosts approval and speeds recovery.', apply: (s, c, r) => { c.treasury -= reliefCost(c, 1); s.regions[r].devastation *= 0.6; mod(c, 'relief', 'Disaster response praised', s, 120, { approval: 4 }); } },
      { id: 'minimal', label: 'Minimal federal response', detail: 'Saves money; the region resents it.', apply: (s, c, r) => { s.regions[r].unrest += 15; mod(c, 'neglect', 'Disaster response criticised', s, 120, { approval: -5 }); } },
    ],
    globalNews: (sev) => sev > 0.7,
  },
  {
    id: 'earthquake', kind: 'earthquake', title: 'Earthquake',
    chance: (s, w, c) => { const n = regionsOf(s, c).filter((r) => w.regions[r.id].elev > 60).length; return n ? 0.0006 * Math.min(4, n ** 0.5) : 0; },
    pickRegion: (s, w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => w.regions[id].elev),
    duration: 7, severity: (rng) => rng.range(0.2, 1),
    text: (c, rn, sev) => `Magnitude ${(5.5 + sev * 3).toFixed(1)} earthquake strikes ${rn}, ${c.name}`,
    impact: (s, _w, _c, r, sev) => { const reg = s.regions[r]; reg.devastation = Math.min(100, reg.devastation + 35 * sev); reg.pop *= 1 - 0.001 * sev; const bs = Object.keys(reg.buildings); if (sev > 0.7 && bs.length) { const b = bs[0]; reg.buildings[b]--; if (reg.buildings[b] <= 0) delete reg.buildings[b]; } },
    options: [
      { id: 'rebuild', label: 'Fund reconstruction', detail: 'Expensive, but the region recovers quickly.', apply: (s, c, r) => { c.treasury -= reliefCost(c, 1.5); s.regions[r].devastation *= 0.5; mod(c, 'rebuild', 'Reconstruction effort', s, 180, { approval: 3 }); } },
      { id: 'aid', label: 'Appeal for international aid', detail: 'Cheaper, but looks weak.', apply: (s, c, r) => { s.regions[r].devastation *= 0.8; mod(c, 'aid', 'Relied on foreign aid', s, 120, { approval: -2 }); } },
    ],
    globalNews: (sev) => sev > 0.6,
  },
  {
    id: 'wildfire', kind: 'wildfire', title: 'Wildfires',
    chance: (s, w, c) => {
      const m = month(s);
      const regs = regionsOf(s, c).filter((r) => ['forest', 'desert', 'hills'].includes(w.regions[r.id].terrain));
      const summer = regs.some((r) => (w.regions[r.id].lat > 0 ? m >= 5 && m <= 8 : m <= 1 || m === 11));
      return regs.length && summer ? 0.0015 * (1 + c.pollution / 100) : 0;
    },
    pickRegion: (s, w, c, rng) => weightedPick(rng, regionsOf(s, c).filter((r) => ['forest', 'desert', 'hills'].includes(w.regions[r.id].terrain)).map((r) => r.id), () => 1),
    duration: 20, severity: (rng) => rng.range(0.2, 0.9),
    text: (c, rn) => `Wildfires rage across ${rn}, ${c.name}`,
    impact: (s, _w, _c, r, sev) => { s.regions[r].devastation += 12 * sev; },
    options: [
      { id: 'firefight', label: 'Deploy national firefighting', detail: 'Costs money, limits damage.', apply: (s, c, r) => { c.treasury -= reliefCost(c, 0.5); s.regions[r].devastation *= 0.7; } },
      { id: 'climate', label: 'Blame climate change, pledge action', detail: 'Greens approve, business wary.', apply: (s, c) => { c.groups.greens.approval += 6; c.groups.business.approval -= 3; void s; } },
    ],
  },
  {
    id: 'flood', kind: 'flood', title: 'Flooding',
    chance: (s, w, c) => regionsOf(s, c).some((r) => ['plains', 'jungle'].includes(w.regions[r.id].terrain)) ? 0.001 : 0,
    pickRegion: (s, w, c, rng) => weightedPick(rng, regionsOf(s, c).filter((r) => ['plains', 'jungle'].includes(w.regions[r.id].terrain)).map((r) => r.id), (id) => s.regions[id].pop),
    duration: 14, severity: (rng) => rng.range(0.2, 0.8),
    text: (c, rn) => `Severe flooding in ${rn}, ${c.name}`,
    impact: (s, _w, _c, r, sev) => { s.regions[r].devastation += 15 * sev; s.regions[r].productivity *= 1 - 0.01 * sev; },
    options: [
      { id: 'relief', label: 'Send relief and build levees', detail: 'Costs money, approval up.', apply: (s, c, r) => { c.treasury -= reliefCost(c, 0.8); s.regions[r].devastation *= 0.6; mod(c, 'flood_relief', 'Flood relief', s, 90, { approval: 2 }); } },
      { id: 'local', label: 'Leave it to local authorities', detail: 'No cost; regional unrest rises.', apply: (s, _c, r) => { s.regions[r].unrest += 10; } },
    ],
  },
  {
    id: 'protest', kind: 'protest', title: 'Mass Protests',
    chance: (s, _w, c) => { const regs = regionsOf(s, c); const hot = regs.filter((r) => r.unrest > 40).length; return hot ? 0.004 * Math.min(3, hot ** 0.5) * (c.freedom / 60) : 0; },
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).filter((r) => r.unrest > 40).map((r) => r.id), (id) => s.regions[id].unrest * Math.sqrt(s.regions[id].pop)),
    duration: 25, severity: (rng) => rng.range(0.3, 1),
    text: (c, rn) => `Tens of thousands protest against the government in ${rn}, ${c.name}`,
    impact: (s, _w, c, r, sev) => { s.regions[r].unrest += 5 * sev; c.stability -= 2 * sev; },
    options: [
      { id: 'concede', label: 'Meet protesters and offer concessions', detail: 'Calms unrest; small budget cost; looks weak to hardliners.', apply: (s, c, r) => { s.regions[r].unrest *= 0.6; c.treasury -= c.gdp * 0.0005; c.groups.nationalists.approval -= 3; c.groups.liberals.approval += 4; void s; } },
      { id: 'crackdown', label: 'Disperse with riot police', detail: 'Ends protests; freedom-lovers furious, legitimacy falls.', apply: (s, c, r) => { s.regions[r].unrest *= 0.75; c.legitimacy -= 6; c.groups.liberals.approval -= 8; c.groups.youth.approval -= 6; c.groups.military.approval += 3; void s; } },
      { id: 'ignore', label: 'Ignore them', detail: 'No cost now. Protests may spread.', apply: (s, _c, r) => { s.regions[r].unrest += 6; } },
    ],
    aiChoice: (_s, c) => (isDemocracy(c.gov) ? 0 : 1),
  },
  {
    id: 'riot', kind: 'riot', title: 'Riots',
    chance: (s, _w, c) => regionsOf(s, c).some((r) => r.unrest > 70) ? 0.004 : 0,
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).filter((r) => r.unrest > 70).map((r) => r.id), (id) => s.regions[id].unrest),
    duration: 12, severity: (rng) => rng.range(0.4, 1),
    text: (c, rn) => `Riots and looting break out in ${rn}, ${c.name}`,
    impact: (s, _w, c, r, sev) => { s.regions[r].devastation += 6 * sev; c.stability -= 3 * sev; },
    options: [
      { id: 'guard', label: 'Deploy the National Guard', detail: 'Restores order; military approval up.', apply: (s, c, r) => { s.regions[r].unrest *= 0.7; c.groups.military.approval += 3; c.groups.liberals.approval -= 4; void s; } },
      { id: 'curfew', label: 'Impose a curfew', detail: 'Cheaper; slower to work.', apply: (s, _c, r) => { s.regions[r].unrest *= 0.85; } },
    ],
  },
  {
    id: 'strike', kind: 'strike', title: 'General Strike',
    chance: (_s, _w, c) => (c.groups.workers.approval < 38 && c.laws.labor_rights !== 'weak' ? 0.002 : 0),
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => (s.regions[id].buildings.factory ?? 0) + 0.1),
    duration: 20, severity: (rng) => rng.range(0.3, 1),
    text: (c) => `Unions call a general strike across ${c.name}`,
    impact: (s, _w, c, _r, sev) => mod(c, 'strike', 'General strike', s, 30, { growth: -0.02 * sev }),
    options: [
      { id: 'deal', label: 'Negotiate a wage deal', detail: 'Workers happy; business grumbles; costs money.', apply: (s, c) => { c.groups.workers.approval += 10; c.groups.business.approval -= 6; c.treasury -= c.gdp * 0.001; c.modifiers = c.modifiers.filter((m) => m.id !== 'strike'); void s; } },
      { id: 'hold', label: 'Refuse to negotiate', detail: 'Strike drags on.', apply: (s, c) => { c.groups.workers.approval -= 6; c.groups.business.approval += 4; void s; } },
    ],
  },
  {
    id: 'scandal', kind: 'protest', title: 'Government Scandal',
    chance: (_s, _w, c) => 0.0006 + c.corruption * 0.00002,
    pickRegion: (_s, _w, c) => c.capital,
    duration: 5, severity: (rng) => rng.range(0.3, 1),
    text: (c) => `Corruption scandal engulfs ${c.name}'s ${c.leaderTitle.toLowerCase()}'s cabinet`,
    impact: (s, _w, c, _r, sev) => mod(c, 'scandal', 'Corruption scandal', s, 150, { approval: -6 * sev }),
    options: [
      { id: 'resign', label: 'Force the minister to resign', detail: 'Stability dip now, scandal fades faster.', apply: (s, c) => { c.stability -= 3; const m = c.modifiers.find((x) => x.id === 'scandal'); if (m) m.until = s.tick + 30; c.corruption -= 2; } },
      { id: 'deny', label: 'Deny everything', detail: 'Legitimacy suffers if it drags on.', apply: (_s, c) => { c.legitimacy -= 4; } },
    ],
  },
  {
    id: 'terror', kind: 'terror', title: 'Terror Attack',
    chance: (s, _w, c) => 0.00025 + (atWar(s, c.id) ? 0.0006 : 0) + Math.max(0, 50 - c.stability) * 0.00001,
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => s.regions[id].pop),
    duration: 6, severity: (rng) => rng.range(0.2, 1),
    text: (c, rn) => `Terror attack in ${rn}, ${c.name}`,
    impact: (s, _w, c, r, sev) => { s.regions[r].unrest += 8 * sev; c.stability -= 2; mod(c, 'terror', 'National mourning', s, 60, { approval: 2 }); },
    options: [
      { id: 'security', label: 'Expand surveillance powers', detail: 'Safer, less free.', apply: (_s, c) => { if (c.laws.surveillance === 'limited') c.laws.surveillance = 'targeted'; else if (c.laws.surveillance === 'targeted') c.laws.surveillance = 'mass'; c.groups.liberals.approval -= 5; c.groups.military.approval += 4; } },
      { id: 'unity', label: 'Call for national unity', detail: 'Stability boost, no new laws.', apply: (s, c) => { c.stability += 3; void s; } },
    ],
  },
  {
    id: 'epidemic', kind: 'epidemic', title: 'Disease Outbreak',
    chance: (s, _w, c) => 0.0003 * (1.5 - c.health / 100) + (s.global.pandemic.active ? 0.004 : 0),
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => s.regions[id].pop),
    duration: 45, severity: (rng) => rng.range(0.2, 1),
    text: (c, rn) => `Disease outbreak spreads in ${rn}, ${c.name}`,
    impact: (s, _w, c, r, sev) => {
      s.regions[r].pop *= 1 - 0.0008 * sev * (1.2 - c.health / 100);
      mod(c, 'outbreak', 'Disease outbreak', s, 60, { growth: -0.006 * sev });
      // a severe outbreak in a poorly prepared country can become a pandemic
      if (!s.global.pandemic.active && sev > 0.9 && c.health < 55 && Math.random() < 0.15) {
        s.global.pandemic = { active: true, severity: sev * 0.6, until: s.tick + 540 };
        addNews(s, 'world', `WHO declares a global pandemic after outbreak in ${c.name}`, [c.id], r, true);
      }
    },
    options: [
      { id: 'lockdown', label: 'Impose lockdowns', detail: 'Stops spread; hurts the economy.', apply: (s, c) => { mod(c, 'lockdown', 'Lockdown', s, 60, { growth: -0.015, unrest: 5 }); c.groups.business.approval -= 6; c.groups.retirees.approval += 5; } },
      { id: 'open', label: 'Keep the economy open', detail: 'Business happy; more deaths.', apply: (s, c, r) => { s.regions[r].pop *= 0.9995; c.groups.retirees.approval -= 6; c.groups.business.approval += 4; } },
    ],
  },
  {
    id: 'discovery', kind: 'discovery', title: 'Resource Discovery',
    chance: () => 0.0003,
    pickRegion: (s, w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => (['desert', 'mountains', 'hills', 'arctic'].includes(w.regions[id].terrain) ? 3 : 1)),
    duration: 30, severity: (rng) => rng.range(0.3, 1),
    text: (c, rn) => `Major oil and gas deposits discovered in ${rn}, ${c.name}`,
    impact: () => {},
    options: [
      { id: 'develop', label: 'Fast-track extraction', detail: 'Free oil field; pollution and green anger.', apply: (s, c, r) => { const reg = s.regions[r]; reg.buildings.oil = Math.min(3, (reg.buildings.oil ?? 0) + 1); c.groups.greens.approval -= 6; c.groups.workers.approval += 3; } },
      { id: 'fund', label: 'Create a sovereign wealth fund', detail: 'Cash windfall over time.', apply: (s, c) => { c.treasury += c.gdp * 0.01; void s; } },
      { id: 'protect', label: 'Protect the land', detail: 'Greens and locals approve.', apply: (_s, c) => { c.groups.greens.approval += 6; } },
    ],
  },
  {
    id: 'boom', kind: 'boom', title: 'Investment Boom',
    chance: (_s, _w, c) => 0.0004 * (c.stability / 60),
    pickRegion: (s, _w, c, rng) => weightedPick(rng, regionsOf(s, c).map((r) => r.id), (id) => s.regions[id].prosperity),
    duration: 30, severity: (rng) => rng.range(0.3, 1),
    text: (c, rn) => `Foreign investment pours into ${rn}, ${c.name}`,
    impact: (s, _w, _c, r, sev) => { s.regions[r].productivity *= 1 + 0.02 * sev; },
    options: [
      { id: 'welcome', label: 'Welcome it', detail: 'Growth and jobs.', apply: (s, c) => { mod(c, 'boom', 'Investment boom', s, 180, { growth: 0.005 }); } },
      { id: 'tax', label: 'Tax windfall profits', detail: 'Cash now, smaller boom.', apply: (s, c) => { c.treasury += c.gdp * 0.002; c.groups.business.approval -= 4; void s; } },
    ],
  },
  {
    id: 'coup', kind: 'riot', title: 'Coup Attempt',
    chance: (_s, _w, c) => (c.coupRisk > 30 ? 0.0004 * (c.coupRisk / 30) : 0),
    pickRegion: (_s, _w, c) => c.capital,
    duration: 10, severity: (rng) => rng.range(0.3, 1),
    text: (c) => `Army officers attempt a coup in ${c.name}!`,
    impact: (s, _w, c) => { c.stability -= 8; void s; },
    options: [
      { id: 'loyalists', label: 'Rally loyal units', detail: 'Succeeds if the military still backs you.', apply: (s, c) => resolveCoup(s, c, c.groups.military.approval / 100 + 0.25) },
      { id: 'bribe', label: 'Buy off the plotters', detail: 'Costs money; usually works.', apply: (s, c) => { c.treasury -= c.gdp * 0.005; resolveCoup(s, c, 0.75 + c.groups.military.approval / 400); } },
      { id: 'people', label: 'Call the people into the streets', detail: 'Works if you are popular.', apply: (s, c) => resolveCoup(s, c, c.approval / 100 + 0.2) },
    ],
  },
];

function resolveCoup(s: GameState, c: Country, chance: number) {
  if (Math.random() < chance) {
    c.stability += 5;
    c.groups.military.approval += 5;
    addNews(s, 'politics', `Coup attempt in ${c.name} fails; plotters arrested`, [c.id], c.capital, true);
    return;
  }
  const prevRuling = s.parties[c.rulingParty];
  const juntaId = `${c.id}_JUNTA`;
  if (!s.parties[juntaId]) {
    s.parties[juntaId] = { id: juntaId, country: c.id, name: 'National Salvation Council', short: 'NSC', color: [78, 93, 58], ideology: { econ: 0.2, social: 0.9 }, popularity: 0, funds: 10, playerId: null, momentum: 0, billStance: {} };
  }
  c.gov = 'military_junta';
  c.leaderTitle = 'General';
  c.rulingParty = juntaId;
  c.coalition = [juntaId];
  c.seats[juntaId] = c.seats[juntaId] ?? 0;
  c.laws.emergency_powers = 'martial_law';
  c.nextElection = -1;
  c.electionInterval = -1;
  syncCountryController(s, c);
  addNews(s, 'politics', `COUP: the military seizes power in ${c.name}${prevRuling ? `, toppling ${prevRuling.name}` : ''}`, [c.id], c.capital, true);
}

export function resolveDecision(state: GameState, d: Decision, optionId: string) {
  const c = state.countries[d.country];
  delete state.decisions[d.id];
  if (!c) return;
  const def = EVENTS.find((e) => e.id === d.event);
  const opt = def?.options.find((o) => o.id === optionId) ?? def?.options[0];
  opt?.apply(state, c, d.region ?? c.capital);
  for (const g of Object.values(c.groups)) g.approval = clamp(g.approval, 0, 100);
}

export function eventsDaily(state: GameState, world: StaticWorld, rng: Rng) {
  const freq = state.settings.disasterFrequency;
  for (const c of Object.values(state.countries)) {
    for (const ev of EVENTS) {
      const natural = ['hurricane', 'earthquake', 'wildfire', 'flood'].includes(ev.id);
      const p = ev.chance(state, world, c) * (natural ? freq : 1);
      if (p <= 0 || !rng.chance(p)) continue;
      const region = ev.pickRegion(state, world, c, rng);
      if (region === null || region === undefined) continue;
      if (Object.values(state.decisions).some((d) => d.country === c.id && d.event === ev.id)) continue;
      const sev = ev.severity(rng);
      const rn = world.regions[region].n;
      ev.impact(state, world, c, region, sev);
      const id = newId(state, 'e');
      state.mapEvents[id] = { id, kind: ev.kind, region, lon: world.regions[region].lon, lat: world.regions[region].lat, start: state.tick, until: state.tick + ev.duration, severity: sev };
      const text = ev.text(c, rn, sev);
      const important = Boolean(c.playerId) || (ev.globalNews?.(sev) ?? false) || ev.id === 'coup';
      addNews(state, ev.id === 'coup' || ev.id === 'scandal' || ev.id === 'protest' || ev.id === 'riot' || ev.id === 'strike' ? 'politics' : ['boom', 'discovery'].includes(ev.id) ? 'economy' : 'disaster', text, [c.id], region, important);
      if (c.playerId) {
        const did = newId(state, 'd');
        state.decisions[did] = {
          id: did, country: c.id, event: ev.id, title: ev.title, text, region,
          options: ev.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail.replace('{cost}', fmtMoney(reliefCost(c, 1))) })),
          created: state.tick, expires: state.tick + 20,
        };
      } else {
        const idx = ev.aiChoice ? ev.aiChoice(state, c) : (c.treasury > c.gdp * 0.01 ? 0 : ev.options.length - 1);
        ev.options[Math.min(idx, ev.options.length - 1)].apply(state, c, region);
      }
      break; // at most one event per country per day
    }
  }
  // decisions time out with the first option
  for (const d of Object.values(state.decisions)) if (d.expires <= state.tick) resolveDecision(state, d, d.options[d.options.length - 1].id);
  // map events expire
  for (const e of Object.values(state.mapEvents)) if (e.until <= state.tick) delete state.mapEvents[e.id];
  // modifiers expire
  for (const c of Object.values(state.countries)) if (c.modifiers.length) c.modifiers = c.modifiers.filter((m) => m.until > state.tick);
}

/** Global economy: oil price random walk, occasional recessions. */
export function globalMonthly(state: GameState, rng: Rng) {
  const g = state.global;
  g.oilPrice = clamp(g.oilPrice * (1 + rng.normal() * 0.05) + (75 - g.oilPrice) * 0.03, 30, 200);
  g.worldGrowth *= 0.9;
  if (rng.chance(0.006)) {
    g.worldGrowth = -0.025;
    addNews(state, 'world', 'Global financial crisis: markets crash worldwide', [], undefined, true);
  } else if (rng.chance(0.01)) {
    g.oilPrice *= 1.6;
    addNews(state, 'world', `Oil price shock: crude jumps to $${g.oilPrice.toFixed(0)} a barrel`, [], undefined, true);
  }
  if (g.pandemic.active && state.tick > g.pandemic.until) {
    g.pandemic.active = false;
    addNews(state, 'world', 'WHO declares the pandemic over', [], undefined, true);
  }
}
