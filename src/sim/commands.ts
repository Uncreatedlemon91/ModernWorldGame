import type { StaticWorld } from '../data/static';
import type { BudgetKey, FormationKind, GameState, Order, ProposalKind, TaxKey, TechField, TreatyType } from './types';
import { LAW_BY_ID, lawOption } from './content/laws';
import { BUILDING_BY_ID } from './content/buildings';
import { clamp, hexToRgb, newId } from './util';
import { addNews } from './news';
import { canDecree, playerGoverns, proposeBill, syncCountryController } from './politics';
import { startConstruction, buildingCost } from './construction';
import {
  acceptProposal, areEnemies, cancelTreaty, changeRelation, createProposal, declareWar, rejectProposal, TREATY_INFO, warSide,
} from './diplomacy';
import {
  assignFormation, assignUnit, canAssignFormation, canAssignUnit, destroyUnit, disbandFormation, issueOrder, queueUnit, unitCost,
} from './military';
import { makeFormation } from './init';
import { resolveDecision } from './events';

export type Command =
  | { type: 'setBudget'; key: BudgetKey; value: number }
  | { type: 'setTax'; key: TaxKey; value: number }
  | { type: 'proposeLaw'; law: string; option: string }
  | { type: 'billStance'; bill: string; vote: 'yes' | 'no' }
  | { type: 'researchFocus'; field: TechField }
  | { type: 'build'; region: number; building: string }
  | { type: 'cancelBuild'; region: number; index: number }
  | { type: 'queueUnit'; unitType: string; region: number }
  | { type: 'cancelProduction'; id: string }
  | { type: 'createFormation'; kind: FormationKind; name: string; region: number }
  | { type: 'assignUnit'; unit: string; formation: string }
  | { type: 'assignFormation'; child: string; parent: string }
  | { type: 'detachUnit'; unit: string }
  | { type: 'detachFormation'; formation: string }
  | { type: 'disbandFormation'; formation: string }
  | { type: 'renameFormation'; formation: string; name: string }
  | { type: 'disbandUnit'; unit: string }
  | { type: 'order'; formation: string; order: Order }
  | { type: 'stance'; formation: string; stance: 'balanced' | 'aggressive' | 'defensive' }
  | { type: 'propose'; to: string; kind: ProposalKind }
  | { type: 'respond'; proposal: string; accept: boolean }
  | { type: 'cancelTreaty'; with: string; treaty: TreatyType }
  | { type: 'declareWar'; target: string }
  | { type: 'sanction'; target: string; on: boolean }
  | { type: 'improveRelations'; target: string }
  | { type: 'createOrg'; name: string; short: string; kind: 'military' | 'economic' | 'political'; color: string }
  | { type: 'inviteOrg'; org: string; to: string }
  | { type: 'leaveOrg'; org: string }
  | { type: 'campaign'; region: number; kind: 'rally' | 'ads' | 'canvass' }
  | { type: 'decision'; id: string; option: string }
  | { type: 'chat'; text: string; to?: string }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'party'; name?: string; short?: string; color?: string; econ?: number; social?: number };

export interface CommandResult { ok: boolean; error?: string }

const GOV_COMMANDS = new Set<Command['type']>([
  'setBudget', 'setTax', 'researchFocus', 'build', 'cancelBuild', 'queueUnit', 'cancelProduction', 'createFormation', 'assignUnit', 'assignFormation',
  'detachUnit', 'detachFormation', 'disbandFormation', 'renameFormation', 'disbandUnit', 'order', 'stance', 'propose', 'respond', 'cancelTreaty',
  'declareWar', 'sanction', 'improveRelations', 'createOrg', 'inviteOrg', 'leaveOrg',
]);

export function applyCommand(state: GameState, world: StaticWorld, playerId: string, cmd: Command): CommandResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'Unknown player' };
  const err = (e: string): CommandResult => ({ ok: false, error: e });
  const ok: CommandResult = { ok: true };

  if (cmd.type === 'chat') {
    const text = cmd.text.trim().slice(0, 400);
    if (!text) return err('Empty');
    state.chat.push({ id: newId(state, 'm'), tick: state.tick, from: playerId, name: player.name, text, to: cmd.to });
    if (state.chat.length > 200) state.chat.splice(0, state.chat.length - 200);
    return ok;
  }
  if (cmd.type === 'setSpeed' || cmd.type === 'setPaused') {
    if (!player.isHost) return err('Only the host controls time');
    if (cmd.type === 'setSpeed') state.speed = clamp(Math.round(cmd.speed), 1, 5);
    else state.paused = cmd.paused;
    return ok;
  }

  const c = player.country ? state.countries[player.country] : null;
  if (!c) return err('You have no country');
  const party = player.partyId ? state.parties[player.partyId] : null;
  const governs = playerGoverns(state, c, playerId);
  if (GOV_COMMANDS.has(cmd.type) && !governs) return err('Your party is in opposition — win an election to govern');

  switch (cmd.type) {
    case 'setBudget': {
      if (!(cmd.key in c.budget)) return err('Bad budget line');
      c.budget[cmd.key] = clamp(cmd.value, 0, cmd.key === 'military' ? 40 : 20);
      return ok;
    }
    case 'setTax': {
      if (!(cmd.key in c.taxes)) return err('Bad tax');
      c.taxes[cmd.key] = clamp(cmd.value, 0, cmd.key === 'tariffs' ? 60 : 75);
      return ok;
    }
    case 'proposeLaw': {
      const law = LAW_BY_ID[cmd.law];
      if (!law || !lawOption(cmd.law, cmd.option)) return err('Unknown law');
      if (c.laws[cmd.law] === cmd.option) return err('Already in force');
      if (!party) return err('No party');
      if (governs && canDecree(c)) {
        c.laws[cmd.law] = cmd.option;
        addNews(state, 'politics', `${c.name} enacts ${law.name}: ${lawOption(cmd.law, cmd.option)!.name} by decree`, [c.id]);
        return ok;
      }
      if (party.funds < 2 && !governs) return err('Opposition bills cost $2M in party funds');
      if (!governs) party.funds -= 2;
      const bill = proposeBill(state, c, party.id, cmd.law, cmd.option);
      if (!bill) return err('A bill on this law is already pending');
      addNews(state, 'politics', `${party.name} introduces a bill: ${law.name} → ${lawOption(cmd.law, cmd.option)!.name}. Vote in 21 days.`, [c.id]);
      return ok;
    }
    case 'billStance': {
      if (!party) return err('No party');
      party.billStance[cmd.bill] = cmd.vote;
      return ok;
    }
    case 'researchFocus':
      c.researchFocus = cmd.field;
      return ok;
    case 'build': {
      if (!BUILDING_BY_ID[cmd.building]) return err('Unknown building');
      const e = startConstruction(state, world, c.id, cmd.region, cmd.building);
      return e ? err(e) : ok;
    }
    case 'cancelBuild': {
      const r = state.regions[cmd.region];
      if (!r || r.owner !== c.id || !r.construction[cmd.index]) return err('Nothing to cancel');
      const job = r.construction[cmd.index];
      c.treasury += buildingCost(state, c.id, job.building) * 0.5 * (1 - job.progress / job.days);
      r.construction.splice(cmd.index, 1);
      return ok;
    }
    case 'queueUnit': {
      const e = queueUnit(state, c.id, cmd.unitType, cmd.region);
      return e ? err(e) : ok;
    }
    case 'cancelProduction': {
      const item = c.production.find((p) => p.id === cmd.id);
      if (!item) return err('Not found');
      c.production = c.production.filter((p) => p.id !== cmd.id);
      c.milFund += unitCost(state, c.id, item.unitType) * 0.5;
      return ok;
    }
    case 'createFormation': {
      const r = state.regions[cmd.region];
      if (!r || r.controller !== c.id) return err('Formations must be raised in your territory');
      const f = makeFormation(state, world, c.id, cmd.kind, cmd.name.trim().slice(0, 40) || 'New Formation', cmd.region);
      void f;
      return ok;
    }
    case 'assignUnit': {
      const u = state.units[cmd.unit], f = state.formations[cmd.formation];
      if (!u || !f) return err('Not found');
      const e = canAssignUnit(state, u, f);
      if (e) return err(e);
      assignUnit(state, u, f);
      return ok;
    }
    case 'assignFormation': {
      const ch = state.formations[cmd.child], p = state.formations[cmd.parent];
      if (!ch || !p) return err('Not found');
      const e = canAssignFormation(state, ch, p);
      if (e) return err(e);
      assignFormation(state, ch, p);
      return ok;
    }
    case 'detachUnit': {
      const u = state.units[cmd.unit];
      if (!u || u.owner !== c.id || !u.parent) return err('Not found');
      const f = state.formations[u.parent];
      f.units = f.units.filter((id) => id !== u.id);
      u.parent = null;
      const region = f.pos.region;
      u.home = state.regions[region]?.controller === c.id ? region : c.capital;
      return ok;
    }
    case 'detachFormation': {
      const f = state.formations[cmd.formation];
      if (!f || f.owner !== c.id || !f.parent) return err('Not found');
      const p = state.formations[f.parent];
      if (p) p.children = p.children.filter((id) => id !== f.id);
      f.parent = null;
      f.order = { kind: 'hold' };
      if (p) f.pos = { ...p.pos, path: [], pathRegions: [] };
      if (f.pos.atSea) return err('Cannot detach at sea');
      return ok;
    }
    case 'disbandFormation': {
      const f = state.formations[cmd.formation];
      if (!f || f.owner !== c.id) return err('Not found');
      if (f.pos.atSea) return err('Cannot disband at sea');
      disbandFormation(state, f);
      return ok;
    }
    case 'renameFormation': {
      const f = state.formations[cmd.formation];
      if (!f || f.owner !== c.id) return err('Not found');
      f.name = cmd.name.trim().slice(0, 40) || f.name;
      return ok;
    }
    case 'disbandUnit': {
      const u = state.units[cmd.unit];
      if (!u || u.owner !== c.id) return err('Not found');
      destroyUnit(state, u);
      return ok;
    }
    case 'order': {
      const f = state.formations[cmd.formation];
      if (!f || f.owner !== c.id) return err('Not found');
      const e = issueOrder(state, world, f, cmd.order);
      return e ? err(e) : ok;
    }
    case 'stance': {
      const f = state.formations[cmd.formation];
      if (!f || f.owner !== c.id) return err('Not found');
      f.stance = cmd.stance;
      return ok;
    }
    case 'propose': {
      if (!state.countries[cmd.to]) return err('Unknown country');
      if (cmd.kind.type === 'aid') {
        if (cmd.kind.amount <= 0 || c.treasury < cmd.kind.amount) return err('Not enough money');
        c.treasury -= cmd.kind.amount;
        const p = createProposal(state, c.id, cmd.to, cmd.kind);
        if (p) acceptProposal(state, world, p);
        return ok;
      }
      if (cmd.kind.type === 'peace') {
        const w = state.wars[cmd.kind.war];
        if (!w || !warSide(w, c.id)) return err('Not in that war');
      }
      if (cmd.kind.type === 'join_org') {
        const org = state.orgs[cmd.kind.org];
        if (!org || !org.members.includes(c.id)) return err('You are not a member');
      }
      const p = createProposal(state, c.id, cmd.to, cmd.kind);
      return p ? ok : err('Proposal already pending');
    }
    case 'respond': {
      const p = state.proposals[cmd.proposal];
      if (!p || p.to !== c.id) return err('Not found');
      if (cmd.accept) acceptProposal(state, world, p); else rejectProposal(state, p);
      return ok;
    }
    case 'cancelTreaty': {
      cancelTreaty(state, c.id, cmd.with, cmd.treaty);
      changeRelation(state, c.id, cmd.with, -15);
      addNews(state, 'diplomacy', `${c.name} cancels its ${TREATY_INFO[cmd.treaty].name} with ${state.countries[cmd.with]?.name}`, [c.id, cmd.with]);
      return ok;
    }
    case 'declareWar': {
      if (cmd.target === c.id || !state.countries[cmd.target]) return err('Invalid target');
      if (areEnemies(state, c.id, cmd.target)) return err('Already at war');
      declareWar(state, world, c.id, cmd.target);
      return ok;
    }
    case 'sanction': {
      const k = `${c.id}>${cmd.target}`;
      if (cmd.on) {
        state.sanctions[k] = true;
        changeRelation(state, c.id, cmd.target, -20);
        addNews(state, 'diplomacy', `${c.name} imposes sanctions on ${state.countries[cmd.target]?.name}`, [c.id, cmd.target], undefined, true);
      } else delete state.sanctions[k];
      return ok;
    }
    case 'improveRelations': {
      const cost = Math.max(0.05, c.gdp * 0.0003);
      if (c.treasury < cost) return err('Not enough money');
      const cd = c.modifiers.find((m) => m.id === `envoy_${cmd.target}`);
      if (cd) return err('Diplomatic mission already underway');
      c.treasury -= cost;
      changeRelation(state, c.id, cmd.target, 8);
      c.modifiers.push({ id: `envoy_${cmd.target}`, label: `Envoy to ${state.countries[cmd.target]?.name}`, until: state.tick + 60 });
      return ok;
    }
    case 'createOrg': {
      const id = newId(state, 'org');
      state.orgs[id] = { id, name: cmd.name.slice(0, 60) || 'New Alliance', short: cmd.short.slice(0, 10) || 'NEW', kind: cmd.kind, members: [c.id], founder: c.id, color: hexToRgb(cmd.color || '#888888') };
      addNews(state, 'diplomacy', `${c.name} founds ${state.orgs[id].name}`, [c.id], undefined, true);
      return ok;
    }
    case 'inviteOrg': {
      const org = state.orgs[cmd.org];
      if (!org || !org.members.includes(c.id)) return err('Not a member');
      if (org.members.includes(cmd.to)) return err('Already a member');
      return createProposal(state, c.id, cmd.to, { type: 'join_org', org: cmd.org }) ? ok : err('Invitation already pending');
    }
    case 'leaveOrg': {
      const org = state.orgs[cmd.org];
      if (!org) return err('Not found');
      org.members = org.members.filter((m) => m !== c.id);
      for (const m of org.members) changeRelation(state, c.id, m, -10);
      addNews(state, 'diplomacy', `${c.name} leaves ${org.short}`, [c.id], undefined, true);
      if (!org.members.length) delete state.orgs[org.id];
      return ok;
    }
    case 'campaign': {
      if (!party) return err('No party');
      const r = state.regions[cmd.region];
      if (!r || r.owner !== c.id) return err('Campaign in your own country');
      const cost = { rally: 1, ads: 4, canvass: 2 }[cmd.kind];
      if (party.funds < cost) return err(`Needs $${cost}M party funds`);
      party.funds -= cost;
      r.supportByParty = r.supportByParty ?? {};
      const boost = { rally: 0.25, ads: 0.12, canvass: 0.35 }[cmd.kind];
      if (cmd.kind === 'ads') {
        party.momentum += 0.08;
      } else {
        r.supportByParty[party.id] = Math.min(1.2, (r.supportByParty[party.id] ?? 0) + boost);
        for (const n of world.regions[cmd.region].nb) {
          const nr = state.regions[n];
          if (nr.owner !== c.id) continue;
          nr.supportByParty = nr.supportByParty ?? {};
          nr.supportByParty[party.id] = Math.min(1.2, (nr.supportByParty[party.id] ?? 0) + boost * 0.3);
        }
      }
      return ok;
    }
    case 'decision': {
      const d = state.decisions[cmd.id];
      if (!d || d.country !== c.id) return err('Not found');
      if (!governs) return err('Only the government can decide');
      resolveDecision(state, d, cmd.option);
      return ok;
    }
    case 'party': {
      if (!party) return err('No party');
      if (cmd.name) party.name = cmd.name.slice(0, 50);
      if (cmd.short) party.short = cmd.short.slice(0, 8);
      if (cmd.color) party.color = hexToRgb(cmd.color);
      const before = { ...party.ideology };
      if (cmd.econ !== undefined) party.ideology.econ = clamp(cmd.econ, -1, 1);
      if (cmd.social !== undefined) party.ideology.social = clamp(cmd.social, -1, 1);
      // Flip-flopping during the game costs credibility with voters.
      if (state.phase === 'playing') {
        const shift = Math.abs(party.ideology.econ - before.econ) + Math.abs(party.ideology.social - before.social);
        if (shift > 0.05) {
          party.momentum -= shift * 0.8;
          addNews(state, 'politics', `${party.name} shifts its platform; critics accuse it of flip-flopping`, [c.id]);
        }
      }
      return ok;
    }
  }
  return err('Unknown command');
}

/** Attach a player to a country by taking over its ruling party (lobby). */
export function assignPlayerCountry(state: GameState, playerId: string, countryId: string | null) {
  const player = state.players[playerId];
  if (!player) return;
  // release previous
  if (player.partyId && state.parties[player.partyId]) state.parties[player.partyId].playerId = null;
  if (player.country && state.countries[player.country]) syncCountryController(state, state.countries[player.country]);
  player.country = null; player.partyId = null;
  if (!countryId) return;
  const c = state.countries[countryId];
  if (!c) return;
  const taken = Object.values(state.players).some((p) => p.id !== playerId && p.country === countryId);
  if (taken) return;
  const party = state.parties[c.rulingParty];
  party.playerId = playerId;
  player.country = countryId;
  player.partyId = party.id;
  syncCountryController(state, c);
}

/** Decay campaign effects monthly. */
export function campaignDecay(state: GameState) {
  for (const r of state.regions) {
    if (!r.supportByParty) continue;
    for (const k of Object.keys(r.supportByParty)) {
      r.supportByParty[k] *= 0.9;
      if (r.supportByParty[k] < 0.01) delete r.supportByParty[k];
    }
    if (!Object.keys(r.supportByParty).length) delete r.supportByParty;
  }
}
