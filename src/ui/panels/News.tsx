import { useState } from 'react';
import { useGame, useStore } from '../../store';
import { formatTickDate } from '../../sim/util';
import type { NewsCategory } from '../../sim/types';

const CATS: (NewsCategory | 'all' | 'mine')[] = ['all', 'mine', 'politics', 'election', 'economy', 'diplomacy', 'military', 'disaster', 'world'];

export function News() {
  const { state, world, me } = useGame();
  const [cat, setCat] = useState<(typeof CATS)[number]>('all');
  if (!state || !world) return null;
  const mine = me?.country;
  const items = [...state.news].reverse().filter((n) => (cat === 'all' ? true : cat === 'mine' ? mine && n.countries.includes(mine) : n.cat === cat));
  return (
    <div className="panel-content">
      <h2>World News</h2>
      <div className="chips">
        {CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c === 'mine' ? 'My country' : c}</button>)}
      </div>
      <div className="news-list">
        {items.length === 0 && <div className="muted small">Nothing yet.</div>}
        {items.map((n) => (
          <div key={n.id} className={`news-item ${n.important ? 'important' : ''} ${n.region !== undefined ? 'clickable' : ''}`} onClick={() => {
            if (n.region === undefined) return;
            const r = world.regions[n.region];
            useStore.getState().fly(r.lon, r.lat, 4.5);
            useStore.setState({ selectedRegion: n.region, selectedCountry: state.regions[n.region].owner });
          }}>
            <span className={`cat ${n.cat}`}>{n.cat}</span>
            <span className="news-date">{formatTickDate(state, n.tick)}</span>
            <div>{n.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
