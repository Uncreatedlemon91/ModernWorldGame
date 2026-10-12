import { describe, expect, it } from 'vitest';
import { loadWorldFromDisk } from '../../sim/__tests__/loadWorld';
import { Authority } from '../authority';
import { StateDiffer, applyPatch } from '../sync';
import { DEFAULT_SETTINGS } from '../../sim/init';

describe('authority + sync', () => {
  it('runs a lobby, starts, and keeps a replica in sync through patches', () => {
    const world = loadWorldFromDisk();
    const a = new Authority(world, { hostName: 'Host', settings: { ...DEFAULT_SETTINGS, scenario: 'peaceful' } });
    const differ = new StateDiffer();
    const replica = JSON.parse(JSON.stringify(a.state));
    differ.prime(a.state);
    const { playerId } = a.join('Guest');
    expect(playerId).toBeTruthy();
    expect(a.apply('host', { type: 'lobbyPick', country: 'FRA' }).ok).toBe(true);
    expect(a.apply(playerId!, { type: 'lobbyPick', country: 'FRA' }).ok).toBe(false);
    expect(a.apply(playerId!, { type: 'lobbyPick', country: 'DEU' }).ok).toBe(true);
    expect(a.apply(playerId!, { type: 'start' }).ok).toBe(false);
    expect(a.apply('host', { type: 'lobbySettings', settings: { scenario: 'realworld' } }).ok).toBe(true);
    expect(a.state.players[playerId!].country).toBe('DEU');
    expect(Object.keys(a.state.wars).length).toBeGreaterThan(0);
    expect(a.apply('host', { type: 'start' }).ok).toBe(true);
    for (let i = 0; i < 20; i++) a.step(1000);
    applyPatch(replica, differ.diff(a.state));
    expect(replica.tick).toBe(a.state.tick);
    expect(replica.players[playerId!].country).toBe('DEU');
    expect(JSON.stringify(replica.countries.DEU)).toBe(JSON.stringify(a.state.countries.DEU));
    expect(Object.keys(replica.wars)).toEqual(Object.keys(a.state.wars));
  });
});
