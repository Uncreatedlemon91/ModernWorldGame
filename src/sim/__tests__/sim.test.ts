import { describe, expect, it } from 'vitest';
import { loadWorldFromDisk } from './loadWorld';
import { createInitialState, DEFAULT_SETTINGS } from '../init';
import { advanceDay } from '../tick';
import { applyCommand, assignPlayerCountry } from '../commands';
import { formationDomain } from '../military';
import type { GameState } from '../types';

function findNaN(obj: unknown, path = ''): string | null {
  if (typeof obj === 'number') return Number.isFinite(obj) ? null : path;
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) { const r = findNaN(v, `${path}.${k}`); if (r) return r; }
  }
  return null;
}

describe('simulation', () => {
  const world = loadWorldFromDisk();

  it('creates a sane initial world', () => {
    const s = createInitialState(world, undefined, 42);
    expect(Object.keys(s.countries).length).toBeGreaterThan(200);
    const usa = s.countries.USA;
    expect(usa.gdp).toBeGreaterThan(20000);
    expect(usa.gdp).toBeLessThan(40000);
    expect(s.countries.CHN.gov).toBe('one_party');
    expect(Object.values(s.formations).filter((f) => f.owner === 'USA').length).toBeGreaterThan(5);
    expect(findNaN(s)).toBeNull();
  });

  it('runs two years without NaNs and with plausible economies', () => {
    const s: GameState = createInitialState(world, undefined, 7);
    s.players.p1 = { id: 'p1', name: 'Tester', country: null, partyId: null, connected: true, isHost: true, ready: true };
    assignPlayerCountry(s, 'p1', 'GBR');
    const gdp0 = s.countries.USA.gdp;
    const t0 = Date.now();
    for (let i = 0; i < 730; i++) advanceDay(s, world);
    const ms = (Date.now() - t0) / 730;
    console.log(`avg ${ms.toFixed(1)} ms/day; wars: ${Object.values(s.wars).map((w) => w.name).join(', ') || 'none'}`);
    console.log('USA', s.countries.USA.gdp.toFixed(0), 'growth', (s.countries.USA.gdpGrowth * 100).toFixed(2), 'approval', s.countries.USA.approval.toFixed(1), 'stab', s.countries.USA.stability.toFixed(1), 'debt/gdp', (s.countries.USA.debt / s.countries.USA.gdp).toFixed(2));
    console.log('CHN', s.countries.CHN.gdp.toFixed(0), 'growth', (s.countries.CHN.gdpGrowth * 100).toFixed(2), 'approval', s.countries.CHN.approval.toFixed(1));
    console.log('GBR', s.countries.GBR.gdp.toFixed(0), 'ruling', s.parties[s.countries.GBR.rulingParty].name, 'approval', s.countries.GBR.approval.toFixed(1));
    console.log('NGA', s.countries.NGA.gdp.toFixed(0), 'growth', (s.countries.NGA.gdpGrowth * 100).toFixed(2), 'stab', s.countries.NGA.stability.toFixed(1));
    console.log('news sample:', s.news.slice(-8).map((n) => n.text));
    expect(findNaN(s)).toBeNull();
    expect(s.countries.USA.gdp).toBeGreaterThan(gdp0 * 0.9);
    expect(s.countries.USA.gdp).toBeLessThan(gdp0 * 1.25);
    expect(ms).toBeLessThan(60);
  });

  it('lets a player govern: budget, laws, construction, production and war', () => {
    const s = createInitialState(world, { ...DEFAULT_SETTINGS, scenario: 'peaceful' }, 3);
    s.players.p1 = { id: 'p1', name: 'A', country: null, partyId: null, connected: true, isHost: true, ready: true };
    assignPlayerCountry(s, 'p1', 'FRA');
    expect(applyCommand(s, world, 'p1', { type: 'setBudget', key: 'health', value: 8 }).ok).toBe(true);
    expect(applyCommand(s, world, 'p1', { type: 'proposeLaw', law: 'drugs', option: 'legal' }).ok).toBe(true);
    expect(Object.keys(s.bills).length).toBe(1);
    const paris = world.regions.find((r) => r.c === 'FRA' && r.n.includes('le-de-France'))!;
    expect(applyCommand(s, world, 'p1', { type: 'build', region: paris.id, building: 'tech_park' }).ok).toBe(true);
    const base = s.regions.find((r) => r.owner === 'FRA' && r.buildings.military_base)!;
    const q = applyCommand(s, world, 'p1', { type: 'queueUnit', unitType: 'infantry', region: base.id });
    expect(q.error ?? 'ok').toBe('ok');
    // war with a neighbour: armies should start fighting
    expect(applyCommand(s, world, 'p1', { type: 'declareWar', target: 'CHE' }).ok).toBe(true);
    const army = Object.values(s.formations).find((f) => f.owner === 'FRA' && !f.parent && formationDomain(s, f) === 'land')!;
    const swiss = world.regions.find((r) => r.c === 'CHE')!;
    const res = applyCommand(s, world, 'p1', { type: 'order', formation: army.id, order: { kind: 'move', target: swiss.id } });
    expect(res.error ?? 'ok').toBe('ok');
    for (let i = 0; i < 120; i++) advanceDay(s, world);
    const war = Object.values(s.wars)[0];
    console.log('war score', war?.score, 'swiss controller', s.regions[swiss.id].controller, 'battles', war?.battles.length, 'cas', war?.casualties);
    expect(findNaN(s)).toBeNull();
  });
});
