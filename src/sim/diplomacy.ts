import type { StaticWorld } from '../data/static';
import type { GameState, Proposal, ProposalKind, TreatyType, War } from './types';
import { clamp, newId, relKey } from './util';
import { addNews } from './news';
import { blocRelationOf } from './blocs';

export const TREATY_INFO: Record<TreatyType, { name: string; desc: string }> = {
  trade: { name: 'Trade Agreement', desc: 'Lower barriers: both economies grow faster and shipping increases.' },
  non_aggression: { name: 'Non-Aggression Pact', desc: 'Both sides promise not to attack each other.' },
  defensive_pact: { name: 'Defensive Pact', desc: 'Each side joins the other’s defensive wars.' },
  military_access: { name: 'Military Access', desc: 'Armies may move through each other’s territory.' },
  research: { name: 'Research Cooperation', desc: 'Both sides research faster.' },
  alliance: { name: 'Full Alliance', desc: 'Joint wars, shared access and defense.' },
};

export function relationDelta(state: GameState, a: string, b: string) { return state.relations[relKey(a, b)] ?? 0; }

export function opinion(state: GameState, a: string, b: string): number {
  if (a === b) return 100;
  const ca = state.countries[a], cb = state.countries[b];
  if (!ca || !cb) return 0;
  let v = blocRelationOf(ca.bloc, cb.bloc);
  for (const o of Object.values(state.orgs)) if (o.members.includes(a) && o.members.includes(b)) v += o.kind === 'military' ? 18 : 10;
  for (const t of Object.values(state.treaties)) if ((t.a === a && t.b === b) || (t.a === b && t.b === a)) v += t.type === 'alliance' || t.type === 'defensive_pact' ? 20 : 8;
  if (state.sanctions[`${a}>${b}`] || state.sanctions[`${b}>${a}`]) v -= 25;
  if (areEnemies(state, a, b)) v -= 80;
  v += relationDelta(state, a, b);
  return clamp(Math.round(v), -100, 100);
}

export function changeRelation(state: GameState, a: string, b: string, delta: number) {
  const k = relKey(a, b);
  state.relations[k] = clamp((state.relations[k] ?? 0) + delta, -150, 150);
}

export function hasTreaty(state: GameState, a: string, b: string, type: TreatyType) {
  return Object.values(state.treaties).some((t) => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

export function addTreaty(state: GameState, a: string, b: string, type: TreatyType) {
  if (hasTreaty(state, a, b, type)) return;
  const id = newId(state, 't');
  state.treaties[id] = { id, type, a, b, since: state.tick };
}

export function cancelTreaty(state: GameState, a: string, b: string, type: TreatyType) {
  for (const t of Object.values(state.treaties)) {
    if (t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))) delete state.treaties[t.id];
  }
}

/** Countries obliged to defend `c` (defensive pacts, alliances, military orgs). */
export function defenders(state: GameState, c: string): string[] {
  const out = new Set<string>();
  for (const t of Object.values(state.treaties)) {
    if (t.type !== 'defensive_pact' && t.type !== 'alliance') continue;
    if (t.a === c) out.add(t.b); else if (t.b === c) out.add(t.a);
  }
  for (const o of Object.values(state.orgs)) if (o.kind === 'military' && o.members.includes(c)) o.members.forEach((m) => out.add(m));
  out.delete(c);
  return [...out];
}

export function hasMilitaryAccess(state: GameState, mover: string, territory: string) {
  if (mover === territory) return true;
  if (hasTreaty(state, mover, territory, 'military_access') || hasTreaty(state, mover, territory, 'alliance')) return true;
  for (const o of Object.values(state.orgs)) if (o.kind === 'military' && o.members.includes(mover) && o.members.includes(territory)) return true;
  // co-belligerents share access
  for (const w of Object.values(state.wars)) {
    if ((w.attackers.includes(mover) && w.attackers.includes(territory)) || (w.defenders.includes(mover) && w.defenders.includes(territory))) return true;
  }
  return false;
}

export function warsOf(state: GameState, c: string): War[] {
  return Object.values(state.wars).filter((w) => w.attackers.includes(c) || w.defenders.includes(c));
}
export const atWar = (state: GameState, c: string) => warsOf(state, c).length > 0;

export function areEnemies(state: GameState, a: string, b: string) {
  for (const w of Object.values(state.wars)) {
    if ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))) return true;
  }
  return false;
}

export function warSide(w: War, c: string): 'attackers' | 'defenders' | null {
  return w.attackers.includes(c) ? 'attackers' : w.defenders.includes(c) ? 'defenders' : null;
}

export function warScoreFor(state: GameState, c: string): number {
  const ws = warsOf(state, c);
  if (!ws.length) return 0;
  return ws.reduce((s, w) => s + (w.attackers.includes(c) ? w.score : -w.score), 0) / ws.length;
}

export function declareWar(state: GameState, world: StaticWorld, attacker: string, defender: string): War | null {
  if (attacker === defender || areEnemies(state, attacker, defender)) return null;
  const a = state.countries[attacker], d = state.countries[defender];
  if (!a || !d) return null;
  const id = newId(state, 'w');
  const war: War = { id, name: `${a.name}–${d.name} War`, attackers: [attacker], defenders: [defender], start: state.tick, score: 0, casualties: {}, battles: [] };
  state.wars[id] = war;
  // Breaking a non-aggression pact or attacking a treaty partner is costly.
  const betrayal = hasTreaty(state, attacker, defender, 'non_aggression') || hasTreaty(state, attacker, defender, 'defensive_pact') || hasTreaty(state, attacker, defender, 'alliance');
  for (const t of Object.values(state.treaties)) if ((t.a === attacker && t.b === defender) || (t.a === defender && t.b === attacker)) delete state.treaties[t.id];
  a.stability -= betrayal ? 10 : 5;
  a.legitimacy -= betrayal ? 10 : 4;
  d.warSupport = Math.min(100, d.warSupport + 30);
  d.modifiers.push({ id: 'rally', label: 'Rally around the flag', until: state.tick + 180, approval: 10, stability: 8 });
  // world opinion
  for (const c of Object.values(state.countries)) if (c.id !== attacker && c.id !== defender) changeRelation(state, attacker, c.id, -(betrayal ? 12 : 6));
  changeRelation(state, attacker, defender, -60);
  addNews(state, 'military', `WAR: ${a.name} declares war on ${d.name}${betrayal ? ', breaking their treaty' : ''}`, [attacker, defender], d.capital, true);

  // Allies of the defender are called in.
  for (const ally of defenders(state, defender)) {
    if (ally === attacker || warSide(war, ally)) continue;
    if (defenders(state, attacker).includes(ally) && opinion(state, ally, attacker) > opinion(state, ally, defender)) continue;
    callToArms(state, world, war, ally, 'defenders');
  }
  return war;
}

export function callToArms(state: GameState, _world: StaticWorld, war: War, ally: string, side: 'attackers' | 'defenders') {
  const c = state.countries[ally];
  if (!c || warSide(war, ally)) return;
  if (c.playerId) {
    const lead = side === 'attackers' ? war.attackers[0] : war.defenders[0];
    createProposal(state, lead, ally, { type: 'join_war', war: war.id, side });
  } else {
    joinWar(state, war, ally, side);
  }
}

export function joinWar(state: GameState, war: War, c: string, side: 'attackers' | 'defenders') {
  if (warSide(war, c)) return;
  const enemies = side === 'attackers' ? war.defenders : war.attackers;
  if (enemies.some((e) => hasTreaty(state, c, e, 'alliance'))) return;
  war[side].push(c);
  for (const e of enemies) changeRelation(state, c, e, -40);
  addNews(state, 'military', `${state.countries[c].name} joins the ${war.name} on the side of ${state.countries[war[side][0]].name}`, [c], undefined, true);
}

export function endWar(state: GameState, war: War, text: string) {
  delete state.wars[war.id];
  for (const r of state.regions) {
    // return occupied land not ceded
    if (r.controller !== r.owner && (war.attackers.includes(r.controller) || war.defenders.includes(r.controller))
      && (war.attackers.includes(r.owner) || war.defenders.includes(r.owner))) {
      // only revert if no other war keeps them enemies
      if (!areEnemies(state, r.owner, r.controller)) r.controller = r.owner;
    }
  }
  for (const p of Object.values(state.proposals)) if (p.kind.type === 'peace' && p.kind.war === war.id) delete state.proposals[p.id];
  addNews(state, 'diplomacy', text, [...war.attackers, ...war.defenders], undefined, true);
}

export function applyPeace(state: GameState, world: StaticWorld, war: War, from: string, to: string, cede: number[], reparations: number) {
  // `from` proposes; ceded regions go to whichever side controls them.
  for (const rid of cede) {
    const r = state.regions[rid];
    if (!r) continue;
    const ctrl = r.controller;
    if (ctrl === r.owner) continue;
    const prev = r.owner;
    r.owner = ctrl;
    r.unrest = Math.max(r.unrest, 50);
    addNews(state, 'diplomacy', `${world.regions[rid].n} ceded from ${state.countries[prev]?.name} to ${state.countries[ctrl]?.name}`, [prev, ctrl], rid);
  }
  if (reparations > 0) {
    // reparations flow from `from` to `to` if positive
    const payer = state.countries[from], payee = state.countries[to];
    if (payer && payee) { payer.debt += reparations; payee.treasury += reparations; }
  }
  endWar(state, war, `Peace treaty ends the ${war.name}`);
  void world;
}

export function createProposal(state: GameState, from: string, to: string, kind: ProposalKind): Proposal | null {
  if (from === to) return null;
  for (const p of Object.values(state.proposals)) if (p.from === from && p.to === to && JSON.stringify(p.kind) === JSON.stringify(kind)) return null;
  const id = newId(state, 'p');
  const prop: Proposal = { id, from, to, kind, created: state.tick, expires: state.tick + 30 };
  state.proposals[id] = prop;
  return prop;
}

/** AI evaluation: positive = accept. */
export function aiProposalScore(state: GameState, p: Proposal): number {
  const op = opinion(state, p.to, p.from);
  const me = state.countries[p.to], them = state.countries[p.from];
  if (!me || !them) return -100;
  switch (p.kind.type) {
    case 'treaty': {
      const t = p.kind.treaty;
      const base = { trade: 5, non_aggression: 15, military_access: -15, research: 0, defensive_pact: -25, alliance: -45 }[t];
      const strength = Math.log10(them.gdp + 1) - Math.log10(me.gdp + 1);
      return op + base + (t === 'defensive_pact' || t === 'alliance' ? strength * 10 : 0) - (atWar(state, p.from) && (t === 'defensive_pact' || t === 'alliance') ? 40 : 0);
    }
    case 'join_org': {
      const org = state.orgs[p.kind.org];
      if (!org) return -100;
      const avg = org.members.reduce((s, m) => s + opinion(state, p.to, m), 0) / Math.max(1, org.members.length);
      return avg - 10;
    }
    case 'peace': {
      const war = state.wars[p.kind.war];
      if (!war) return -100;
      if ((war.noPeaceBefore ?? 0) > state.tick) return -100;
      const side = warSide(war, p.to);
      const myScore = side === 'attackers' ? war.score : -war.score;
      const lost = p.kind.cede.filter((r) => state.regions[r]?.owner === p.to).length;
      const gained = p.kind.cede.filter((r) => state.regions[r]?.controller === p.to).length;
      const duration = (state.tick - war.start) / 365;
      return -myScore * 1.2 + duration * 15 - lost * 6 + gained * 6 - p.kind.reparations / Math.max(1, me.gdp) * 50 + (me.warSupport < 30 ? 15 : 0) - 10;
    }
    case 'join_war': {
      const war = state.wars[p.kind.war];
      if (!war) return -100;
      const enemies = p.kind.side === 'attackers' ? war.defenders : war.attackers;
      const enemyOp = enemies.reduce((s, e) => s + opinion(state, p.to, e), 0) / enemies.length;
      return op - enemyOp - 40 + (defenders(state, p.to).includes(p.from) ? 50 : 0) + me.ai.aggression * 20;
    }
    case 'aid':
      return 100;
  }
}

export function acceptProposal(state: GameState, world: StaticWorld, p: Proposal) {
  delete state.proposals[p.id];
  const from = state.countries[p.from], to = state.countries[p.to];
  if (!from || !to) return;
  switch (p.kind.type) {
    case 'treaty':
      addTreaty(state, p.from, p.to, p.kind.treaty);
      changeRelation(state, p.from, p.to, 10);
      addNews(state, 'diplomacy', `${from.name} and ${to.name} sign a ${TREATY_INFO[p.kind.treaty].name}`, [p.from, p.to], undefined, Boolean(from.playerId || to.playerId));
      break;
    case 'join_org': {
      const org = state.orgs[p.kind.org];
      if (org && !org.members.includes(p.to)) {
        org.members.push(p.to);
        addNews(state, 'diplomacy', `${to.name} joins ${org.short}`, [p.to], undefined, true);
      }
      break;
    }
    case 'peace': {
      const war = state.wars[p.kind.war];
      if (war) applyPeace(state, world, war, p.to, p.from, p.kind.cede, p.kind.reparations);
      break;
    }
    case 'join_war': {
      const war = state.wars[p.kind.war];
      if (war) joinWar(state, war, p.to, p.kind.side);
      break;
    }
    case 'aid':
      to.treasury += p.kind.amount;
      changeRelation(state, p.from, p.to, 5 + Math.min(25, (p.kind.amount / Math.max(0.1, to.gdp)) * 200));
      addNews(state, 'diplomacy', `${from.name} sends ${p.kind.amount.toFixed(1)}B in aid to ${to.name}`, [p.from, p.to]);
      break;
  }
}

export function rejectProposal(state: GameState, p: Proposal) {
  delete state.proposals[p.id];
  changeRelation(state, p.from, p.to, -3);
  const from = state.countries[p.from], to = state.countries[p.to];
  if (from?.playerId || to?.playerId) addNews(state, 'diplomacy', `${to?.name} rejects a proposal from ${from?.name}`, [p.from, p.to]);
  if (p.kind.type === 'join_war') {
    // refusing a call to arms angers the ally
    changeRelation(state, p.from, p.to, -25);
  }
}

/** Update war scores and handle capitulation. Runs daily. */
export function diplomacyDaily(state: GameState, world: StaticWorld) {
  for (const war of Object.values(state.wars)) {
    const popOf = (side: string[]) => side.reduce((s, c) => s + state.regions.filter((r) => r.owner === c).reduce((a, r) => a + r.pop, 0), 0);
    const occupiedPop = (owners: string[], occupiers: string[]) => state.regions.filter((r) => owners.includes(r.owner) && occupiers.includes(r.controller)).reduce((a, r) => a + r.pop, 0);
    const attPop = popOf(war.attackers) || 1, defPop = popOf(war.defenders) || 1;
    const defLost = occupiedPop(war.defenders, war.attackers) / defPop;
    const attLost = occupiedPop(war.attackers, war.defenders) / attPop;
    const cas = (side: string[]) => side.reduce((s, c) => s + (war.casualties[c] ?? 0), 0);
    const ca = cas(war.attackers), cd = cas(war.defenders);
    const casTerm = ca + cd > 0 ? ((cd - ca) / (ca + cd)) * 25 : 0;
    war.score = clamp((defLost - attLost) * 160 + casTerm, -100, 100);
    // Capitulation: a primary belligerent with most of its population occupied
    for (const side of ['attackers', 'defenders'] as const) {
      const leader = war[side][0];
      const regs = state.regions.filter((r) => r.owner === leader);
      const lostPop = regs.filter((r) => r.controller !== leader).reduce((a, r) => a + r.pop, 0);
      const pop = regs.reduce((a, r) => a + r.pop, 0) || 1;
      if (lostPop / pop > 0.8) {
        const winners = side === 'attackers' ? war.defenders : war.attackers;
        const ceded = state.regions.filter((r) => war[side].includes(r.owner) && winners.includes(r.controller)).map((r) => r.id);
        applyPeace(state, world, war, leader, winners[0], ceded, 0);
        addNews(state, 'military', `${state.countries[leader].name} capitulates`, [leader], undefined, true);
        break;
      }
    }
    // battle bookkeeping: decay old battles
    war.battles = war.battles.filter((b) => state.tick - b.started < 60 && b.intensity > 0.05).map((b) => ({ ...b, intensity: b.intensity * 0.97 }));
  }
  // expire proposals
  for (const p of Object.values(state.proposals)) if (p.expires <= state.tick) delete state.proposals[p.id];
}

export function diplomacyMonthly(state: GameState) {
  for (const k of Object.keys(state.relations)) {
    state.relations[k] *= 0.97;
    if (Math.abs(state.relations[k]) < 0.5) delete state.relations[k];
  }
}
