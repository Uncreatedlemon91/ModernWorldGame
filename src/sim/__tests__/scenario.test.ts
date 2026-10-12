import { describe, expect, it } from 'vitest';
import { loadWorldFromDisk } from './loadWorld';
import { createInitialState, DEFAULT_SETTINGS } from '../init';
import { advanceDay } from '../tick';

const world = loadWorldFromDisk();

describe('scenarios', () => {
  it('starts the real-world scenario with ongoing wars and occupations', () => {
    const s = createInitialState(world, { ...DEFAULT_SETTINGS, scenario: 'realworld' }, 5);
    const names = Object.values(s.wars).map((w) => w.name);
    expect(names).toContain('Russia–Ukraine War');
    const occupied = s.regions.filter((r) => r.owner === 'UKR' && r.controller === 'RUS').length;
    expect(occupied).toBeGreaterThanOrEqual(5);
    expect(s.sanctions['USA>RUS']).toBe(true);
    for (let i = 0; i < 340; i++) advanceDay(s, world);
    console.log(s.news.filter((n) => /War|war|peace|capitul|captures/.test(n.text)).slice(-15).map((n) => n.tick + ' ' + n.text).join('\n'));
    expect(Object.values(s.wars).some((w) => w.name === 'Russia–Ukraine War')).toBe(true);
    const ru = Object.values(s.wars).find((w) => w.name === 'Russia–Ukraine War')!;
    console.log('after 340 days: score', ru.score.toFixed(1), 'cas', JSON.stringify(ru.casualties), 'battles', ru.battles.length, 'occupied', s.regions.filter((r) => r.owner === 'UKR' && r.controller === 'RUS').map((r) => world.regions[r.id].n).join(', '));
  });

  it('peaceful scenario has no wars', () => {
    const s = createInitialState(world, { ...DEFAULT_SETTINGS, scenario: 'peaceful' }, 5);
    expect(Object.keys(s.wars).length).toBe(0);
  });
});

import { formationVisible, visibleRegions } from '../visibility';
describe('fog of war', () => {
  it('hides distant enemy formations but shows nearby ones', () => {
    const s = createInitialState(world, { ...DEFAULT_SETTINGS, scenario: 'realworld' }, 5);
    const vis = visibleRegions(s, world, 'UKR');
    const ukrFront = Object.values(s.formations).filter((f) => f.owner === 'RUS' && !f.parent && formationVisible(s, world, 'UKR', f));
    const vladivostok = world.regions.find((r) => r.n === 'Primor\'ye')!;
    expect(vis.has(vladivostok.id)).toBe(false);
    expect(ukrFront.length).toBeGreaterThan(0);
    const hidden = Object.values(s.formations).filter((f) => f.owner === 'CHN' && !f.parent && !formationVisible(s, world, 'UKR', f));
    expect(hidden.length).toBeGreaterThan(0);
  });
});
