// Cabinet ministers, referendums and monthly history for charts.
import type { StaticWorld } from '../data/static';
import type { Country, GameState, Minister, MinisterRole, Referendum } from './types';
import { Rng, hashString } from './rng';
import { clamp, newId } from './util';
import { addNews } from './news';
import { GROUPS } from './content/groups';
import { LAW_BY_ID, lawOption } from './content/laws';
import { ideologyDistance, isDemocracy } from './politics';
import { countryPop } from './economy';

export const ROLES: { id: MinisterRole; name: string; desc: string }[] = [
  { id: 'finance', name: 'Finance', desc: 'Growth and tax collection. A skilled minister adds up to ±0.6% growth.' },
  { id: 'foreign', name: 'Foreign Affairs', desc: 'Relations improve faster with a skilled diplomat.' },
  { id: 'defense', name: 'Defense', desc: 'Readiness, unit production speed and morale.' },
  { id: 'interior', name: 'Interior', desc: 'Crime, unrest and internal security.' },
];

const NAMES: Record<string, { first: string[]; last: string[] }> = {
  europe: { first: ['Anna', 'Marco', 'Sofia', 'Lukas', 'Elena', 'Jan', 'Clara', 'Pierre', 'Ingrid', 'Tomas', 'Marta', 'Henrik', 'Lucia', 'Pavel', 'Isabel', 'Oliver'], last: ['Novak', 'Rossi', 'Schmidt', 'Dubois', 'Larsen', 'Kowalski', 'Moreau', 'Fischer', 'Ferreira', 'Petrov', 'Jensen', 'Costa', 'Varga', 'Bauer', 'Martin', 'Lindqvist'] },
  americas: { first: ['James', 'Maria', 'Carlos', 'Emily', 'Diego', 'Sarah', 'Lucas', 'Ana', 'Michael', 'Gabriela', 'Daniel', 'Laura', 'Jose', 'Rachel', 'Mateo', 'Grace'], last: ['Johnson', 'Silva', 'Garcia', 'Miller', 'Rodriguez', 'Brown', 'Santos', 'Davis', 'Lopez', 'Wilson', 'Oliveira', 'Martinez', 'Taylor', 'Gomez', 'Clark', 'Pereira'] },
  asia: { first: ['Wei', 'Hiroshi', 'Priya', 'Min-jun', 'Arjun', 'Mei', 'Kenji', 'Siti', 'Anh', 'Rahul', 'Yuki', 'Ji-woo', 'Lin', 'Ravi', 'Nur', 'Haruto'], last: ['Wang', 'Tanaka', 'Sharma', 'Kim', 'Patel', 'Chen', 'Sato', 'Rahman', 'Nguyen', 'Singh', 'Suzuki', 'Park', 'Liu', 'Gupta', 'Lim', 'Watanabe'] },
  mideast: { first: ['Omar', 'Layla', 'Ahmed', 'Fatima', 'Yusuf', 'Leila', 'Karim', 'Noor', 'Hassan', 'Amira', 'Ali', 'Zainab', 'Tariq', 'Mariam', 'Reza', 'Yasmin'], last: ['Haddad', 'Rahimi', 'Al-Sayed', 'Karimi', 'Nasser', 'Hosseini', 'Aziz', 'Farouk', 'Khalil', 'Mansour', 'Saleh', 'Rostami', 'Barakat', 'Hakimi', 'Najjar', 'Yilmaz'] },
  africa: { first: ['Kwame', 'Amara', 'Chidi', 'Zanele', 'Tunde', 'Aisha', 'Kofi', 'Ngozi', 'Thabo', 'Fatou', 'Juma', 'Adaeze', 'Sipho', 'Mariama', 'Abebe', 'Wanjiru'], last: ['Mensah', 'Okafor', 'Diallo', 'Nkosi', 'Adeyemi', 'Kamau', 'Traore', 'Mwangi', 'Banda', 'Osei', 'Ndlovu', 'Keita', 'Abubakar', 'Tesfaye', 'Moyo', 'Sow'] },
};

function namePool(continent: string, subregion: string) {
  if (/Western Asia|Northern Africa/.test(subregion)) return NAMES.mideast;
  if (continent === 'Africa') return NAMES.africa;
  if (continent === 'Asia') return NAMES.asia;
  if (/America/.test(continent)) return NAMES.americas;
  return NAMES.europe;
}

export function makeMinister(state: GameState, world: StaticWorld, c: Country, role: MinisterRole, seed: number): Minister {
  const sc = world.countryByA3.get(c.id);
  const pool = namePool(sc?.continent ?? '', sc?.subregion ?? '');
  const rng = new Rng(hashString(c.id + role) ^ seed);
  return {
    id: newId(state, 'min'),
    role,
    name: `${rng.pick(pool.first)} ${rng.pick(pool.last)}`,
    party: c.rulingParty,
    competence: clamp(rng.range(0.25, 0.9), 0, 1),
    integrity: clamp(rng.range(0.3, 0.95), 0, 1),
    loyalty: clamp(rng.range(0.4, 0.95), 0, 1),
    since: state.tick,
  };
}

export function seedCabinet(state: GameState, world: StaticWorld, c: Country) {
  c.cabinet = {} as Country['cabinet'];
  for (const r of ROLES) c.cabinet[r.id] = makeMinister(state, world, c, r.id, state.seed + 1);
  c.candidates = [];
}

/** Candidate pool for appointments (only generated for player-run countries). */
export function ensureCandidates(state: GameState, world: StaticWorld, c: Country) {
  if (c.candidates?.length) return;
  c.candidates = ROLES.flatMap((r) => [0, 1].map((k) => makeMinister(state, world, c, r.id, state.seed + 100 + k * 7 + state.tick)));
}

/** Effects of the current cabinet, applied in economy/military updates. */
export function cabinetSkill(c: Country, role: MinisterRole): number {
  const m = c.cabinet?.[role];
  return m ? m.competence - 0.5 : 0; // -0.5 .. +0.5
}

export function appointMinister(state: GameState, world: StaticWorld, c: Country, candidateId: string): string | null {
  const cand = c.candidates?.find((m) => m.id === candidateId);
  if (!cand) return 'Candidate not found';
  const prev = c.cabinet[cand.role];
  c.cabinet[cand.role] = { ...cand, since: state.tick, party: c.rulingParty };
  c.candidates = c.candidates.filter((m) => m.id !== candidateId);
  // the reshuffle costs some stability; firing a loyal minister angers the party
  c.stability = Math.max(0, c.stability - 1.5);
  if (prev && prev.loyalty > 0.7) c.legitimacy = Math.max(0, c.legitimacy - 1);
  c.candidates.push(makeMinister(state, world, c, cand.role, state.tick * 13 + 1));
  addNews(state, 'politics', `${c.name}: ${cand.name} appointed Minister of ${ROLES.find((r) => r.id === cand.role)!.name}${prev ? `, replacing ${prev.name}` : ''}`, [c.id]);
  return null;
}

/** Monthly: ministers may get caught in scandals; candidate pool refreshes. */
export function cabinetMonthly(state: GameState, world: StaticWorld, c: Country, rng: Rng) {
  if (!c.cabinet) seedCabinet(state, world, c);
  for (const r of ROLES) {
    const m = c.cabinet[r.id];
    if (!m) continue;
    if (rng.chance((1 - m.integrity) * 0.012 * (1 + c.corruption / 100))) {
      c.modifiers.push({ id: `scandal_${m.id}`, label: `${m.name} scandal`, until: state.tick + 120, approval: -5 });
      addNews(state, 'politics', `${c.name}: Minister of ${r.name} ${m.name} engulfed in a corruption scandal`, [c.id], c.capital, Boolean(c.playerId));
      m.integrity = Math.max(0, m.integrity - 0.1);
      // AI governments sack scandal-hit ministers
      if (!state.parties[c.rulingParty]?.playerId) {
        c.cabinet[r.id] = makeMinister(state, world, c, r.id, state.tick + rng.int(1, 1e6));
        c.modifiers = c.modifiers.filter((x) => x.id !== `scandal_${m.id}`);
      }
    }
    // ministers from a party no longer in government are replaced
    if (!c.coalition.includes(m.party)) c.cabinet[r.id] = { ...makeMinister(state, world, c, r.id, state.tick + rng.int(1, 1e6)), party: c.rulingParty };
  }
  if (c.playerId && (!c.candidates?.length || rng.chance(0.1))) c.candidates = ROLES.flatMap((r) => [0, 1].map((k) => makeMinister(state, world, c, r.id, state.tick * 31 + k + rng.int(1, 1e6))));
  if (!c.playerId && c.candidates?.length) c.candidates = [];
}

// ---------------- Referendums ----------------

export function publicSupport(_state: GameState, c: Country, law: string, option: string): number {
  const opt = lawOption(law, option);
  const cur = lawOption(law, c.laws[law]);
  if (!opt || !cur) return 0.5;
  let yes = 0;
  for (const g of GROUPS) {
    const gs = c.groups[g.id];
    const pref = ideologyDistance(g.ideology, cur.ideology) - ideologyDistance(g.ideology, opt.ideology) + ((opt.groups[g.id] ?? 0) - (cur.groups[g.id] ?? 0)) / 20;
    const p = 1 / (1 + Math.exp(-pref * 3));
    yes += gs.size * p;
  }
  // unpopular governments drag down their own referendums
  return clamp(yes + (c.approval - 50) / 400, 0.02, 0.98);
}

export function callReferendum(state: GameState, c: Country, law: string, option: string): string | null {
  if (!isDemocracy(c.gov)) return 'Only democracies hold referendums';
  if (!LAW_BY_ID[law] || !lawOption(law, option)) return 'Unknown law';
  if (c.laws[law] === option) return 'Already in force';
  if (Object.values(state.referendums ?? {}).some((r) => r.country === c.id)) return 'A referendum is already scheduled';
  const cost = Math.max(0.05, c.gdp * 0.0002);
  if (c.treasury < cost) return 'Not enough money';
  c.treasury -= cost;
  const id = newId(state, 'ref');
  const r: Referendum = { id, country: c.id, law, option, voteOn: state.tick + 60 };
  state.referendums = state.referendums ?? {};
  state.referendums[id] = r;
  addNews(state, 'election', `${c.name} calls a referendum: ${LAW_BY_ID[law].name} → ${lawOption(law, option)!.name}. Voting in 60 days.`, [c.id], c.capital, true);
  return null;
}

export function resolveReferendums(state: GameState) {
  for (const r of Object.values(state.referendums ?? {})) {
    if (r.voteOn > state.tick) continue;
    delete state.referendums![r.id];
    const c = state.countries[r.country];
    if (!c) continue;
    const yes = publicSupport(state, c, r.law, r.option) * (0.95 + Math.random() * 0.1);
    const name = `${LAW_BY_ID[r.law].name}: ${lawOption(r.law, r.option)!.name}`;
    if (yes > 0.5) {
      c.laws[r.law] = r.option;
      c.legitimacy = Math.min(100, c.legitimacy + 5);
      addNews(state, 'election', `${c.name} referendum PASSES (${(yes * 100).toFixed(1)}% yes): ${name}`, [c.id], c.capital, true);
    } else {
      c.modifiers.push({ id: 'referendum_defeat', label: 'Referendum defeat', until: state.tick + 120, approval: -5 });
      addNews(state, 'election', `${c.name} referendum FAILS (${(yes * 100).toFixed(1)}% yes): ${name}`, [c.id], c.capital, true);
    }
  }
}

// ---------------- History (charts) ----------------

export function recordHistory(state: GameState, c: Country) {
  state.history = state.history ?? {};
  const h = (state.history[c.id] = state.history[c.id] ?? []);
  const parties: Record<string, number> = {};
  for (const pid of Object.keys(c.seats)) { const p = state.parties[pid]; if (p) parties[pid] = Math.round(p.popularity * 1000) / 1000; }
  h.push({
    tick: state.tick, approval: Math.round(c.approval), stability: Math.round(c.stability), gdp: Math.round(c.gdp * 10) / 10,
    growth: Math.round(c.gdpGrowth * 10000) / 10000, debt: Math.round((c.debt / c.gdp) * 1000) / 1000, parties,
    market: Math.round((c.market ?? 100) * 10) / 10, pop: Math.round(countryPop(state, c.id)),
  });
  if (h.length > 120) h.splice(0, h.length - 120);
}
