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
