import { describe, expect, it } from 'vitest';
import { loadWorldFromDisk } from './loadWorld';
import { createInitialState, makeFormation, DEFAULT_SETTINGS } from '../init';
import { advanceDay } from '../tick';
import { applyCommand, assignPlayerCountry } from '../commands';
import { formationDomain, formationUnits } from '../military';
import { holdElection } from '../politics';
import type { GameState } from '../types';

const world = loadWorldFromDisk();

function setup(country: string): GameState {
  const s = createInitialState(world, { ...DEFAULT_SETTINGS, scenario: 'peaceful' }, 11);
  s.phase = 'playing';
  s.players.p1 = { id: 'p1', name: 'A', country: null, partyId: null, connected: true, isHost: true, ready: true };
  assignPlayerCountry(s, 'p1', country);
  return s;
}

describe('military orders', () => {
  it('sails a fleet across the ocean and blockades an enemy port', () => {
    const s = setup('GBR');
    const fleet = Object.values(s.formations).find((f) => f.owner === 'GBR' && !f.parent && formationDomain(s, f) === 'naval')!;
    expect(fleet).toBeTruthy();
    const target = world.regions.find((r) => r.c === 'ISL')!; // Iceland
    expect(applyCommand(s, world, 'p1', { type: 'declareWar', target: 'ISL' }).ok).toBe(true);
    const r = applyCommand(s, world, 'p1', { type: 'order', formation: fleet.id, order: { kind: 'blockade', target: target.id } });
    expect(r.error ?? 'ok').toBe('ok');
    const start = [fleet.pos.lon, fleet.pos.lat];
    for (let i = 0; i < 20; i++) advanceDay(s, world);
    const f = s.formations[fleet.id];
    expect(Math.hypot(f.pos.lon - start[0], f.pos.lat - start[1])).toBeGreaterThan(3);
    expect(f.pos.path.length).toBe(0);
  });

  it('flies air missions within range and rejects out-of-range targets', () => {
    const s = setup('FRA');
    const air = Object.values(s.formations).find((f) => f.owner === 'FRA' && !f.parent && formationDomain(s, f) === 'air')!;
    expect(air).toBeTruthy();
    const near = world.regions.find((r) => r.c === 'BEL')!;
    const far = world.regions.find((r) => r.c === 'AUS')!;
    applyCommand(s, world, 'p1', { type: 'declareWar', target: 'BEL' });
    expect(applyCommand(s, world, 'p1', { type: 'order', formation: air.id, order: { kind: 'groundSupport', target: near.id } }).ok).toBe(true);
    expect(applyCommand(s, world, 'p1', { type: 'order', formation: air.id, order: { kind: 'strategicBombing', target: far.id } }).ok).toBe(false);
  });

  it('builds formations from reserves and moves an army over land', () => {
    const s = setup('DEU');
    const base = s.regions.find((r) => r.owner === 'DEU' && r.buildings.military_base)!;
    expect(applyCommand(s, world, 'p1', { type: 'queueUnit', unitType: 'infantry', region: base.id }).ok).toBe(true);
    for (let i = 0; i < 70; i++) advanceDay(s, world);
    const reserve = Object.values(s.units).find((u) => u.owner === 'DEU' && !u.parent)!;
    expect(reserve).toBeTruthy();
    expect(applyCommand(s, world, 'p1', { type: 'createFormation', kind: 'regiment', name: 'Test Regiment', region: base.id }).ok).toBe(true);
    const reg = Object.values(s.formations).find((f) => f.name === 'Test Regiment')!;
    expect(applyCommand(s, world, 'p1', { type: 'assignUnit', unit: reserve.id, formation: reg.id }).ok).toBe(true);
    // regiments can't hold squadrons
    const sq = Object.values(s.units).find((u) => u.owner === 'DEU' && u.type === 'fighter')!;
    expect(applyCommand(s, world, 'p1', { type: 'assignUnit', unit: sq.id, formation: reg.id }).ok).toBe(false);
    const dest = world.regions.find((r) => r.c === 'DEU' && r.id !== base.id && (r.n === 'Bayern' || r.n === 'Sachsen'))!;
    expect(applyCommand(s, world, 'p1', { type: 'order', formation: reg.id, order: { kind: 'move', target: dest.id } }).ok).toBe(true);
    for (let i = 0; i < 40; i++) advanceDay(s, world);
    expect(s.formations[reg.id].pos.region).toBe(dest.id);
  });

  it('lands an amphibious task force', () => {
    const s = setup('USA');
    const marines = Object.values(s.formations).filter((f) => f.owner === 'USA' && f.kind === 'regiment');
    const tf = Object.values(s.formations).find((f) => f.owner === 'USA' && !f.parent && formationUnits(s, f).some((u) => u.type === 'amphibious'))!;
    expect(tf).toBeTruthy();
    // detach a regiment from its army and embark it
    const reg = marines[0];
    applyCommand(s, world, 'p1', { type: 'detachFormation', formation: reg.id });
    const r = applyCommand(s, world, 'p1', { type: 'assignFormation', child: reg.id, parent: tf.id });
    expect(r.error ?? 'ok').toBe('ok');
    const target = world.regions.find((r) => r.c === 'CUB' || r.c === 'BHS')!;
    applyCommand(s, world, 'p1', { type: 'declareWar', target: target.c });
    const o = applyCommand(s, world, 'p1', { type: 'order', formation: tf.id, order: { kind: 'amphibious', target: target.id } });
    expect(o.error ?? 'ok').toBe('ok');
    let landed = false;
    for (let i = 0; i < 60; i++) {
      advanceDay(s, world);
      if (Object.values(s.formations).some((f) => f.name.includes('Landing Force'))) landed = true;
    }
    // the landing happens; whether it succeeds depends on the defenders
    expect(landed).toBe(true);
    const war = Object.values(s.wars)[0];
    expect((war?.casualties.USA ?? 0) + (war?.casualties[target.c] ?? 0)).toBeGreaterThan(0);
  });
});

describe('elections', () => {
  it('can remove a player from power when the setting allows it', () => {
    const s = setup('GBR');
    const c = s.countries.GBR;
    // make the government wildly unpopular
    for (const g of Object.values(c.groups)) g.approval = 3;
    holdElection(s, world, c);
    const ruling = s.parties[c.rulingParty];
    expect(ruling.playerId).toBeNull();
    expect(c.playerId).toBe('p1'); // still attached as opposition
    expect(applyCommand(s, world, 'p1', { type: 'setBudget', key: 'health', value: 9 }).ok).toBe(false);
    expect(applyCommand(s, world, 'p1', { type: 'proposeLaw', law: 'drugs', option: 'legal' }).ok).toBe(true);
  });

  it('keeps the player in power when elections cannot remove players', () => {
    const s = setup('GBR');
    s.settings.electionsCanRemovePlayers = false;
    const c = s.countries.GBR;
    for (const g of Object.values(c.groups)) g.approval = 3;
    holdElection(s, world, c);
    expect(s.parties[c.rulingParty].playerId).toBe('p1');
  });
});

describe('formation helpers', () => {
  it('creates empty formations that persist until used', () => {
    const s = setup('JPN');
    const f = makeFormation(s, world, 'JPN', 'army', 'Empty Army', s.countries.JPN.capital);
    for (let i = 0; i < 3; i++) advanceDay(s, world);
    expect(s.formations[f.id]).toBeTruthy();
  });
});
