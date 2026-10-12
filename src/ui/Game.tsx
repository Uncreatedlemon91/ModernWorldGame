import { useEffect, useRef } from 'react';
import { useGame, useStore, type Panel, type MapMode } from '../store';
import { Flag, Pill } from './common';
import { fmtMoney, formatTickDate, pct } from '../sim/util';
import { rgbCss } from '../map/colors';
import { computeRegionColors } from '../map/colors';
import { playerGoverns, isDemocracy } from '../sim/politics';
import { Overview } from './panels/Overview';
import { Politics } from './panels/Politics';
import { Laws } from './panels/Laws';
import { Economy } from './panels/Economy';
import { Military } from './panels/Military';
import { Diplomacy } from './panels/Diplomacy';
import { News } from './panels/News';
import { Chat } from './panels/Chat';
import { GameMenu } from './panels/GameMenu';
import { Inspector } from './Inspector';
import { Decisions, Proposals } from './Notifications';

const NAV: { id: Exclude<Panel, null>; icon: string; label: string }[] = [
  { id: 'overview', icon: '◉', label: 'Overview' },
  { id: 'politics', icon: '🗳', label: 'Politics' },
  { id: 'laws', icon: '⚖', label: 'Laws' },
  { id: 'economy', icon: '$', label: 'Economy' },
  { id: 'military', icon: '✪', label: 'Military' },
  { id: 'diplomacy', icon: '🤝', label: 'Diplomacy' },
  { id: 'news', icon: '📰', label: 'News' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'menu', icon: '☰', label: 'Menu' },
];

const MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: 'Political' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'relations', label: 'Diplomacy' },
  { id: 'alliances', label: 'Alliances' },
  { id: 'elections', label: 'Elections' },
  { id: 'economy', label: 'Wealth' },
  { id: 'prosperity', label: 'Prosperity' },
  { id: 'unrest', label: 'Unrest' },
  { id: 'terrain', label: 'Terrain' },
];

export function Game() {
  const { session, state, me, country, world } = useGame();
  const panel = useStore((s) => s.panel);
  const flewHome = useRef(false);

  useEffect(() => {
    if (country && world && !flewHome.current) {
      flewHome.current = true;
      const cap = world.regions[country.capital];
      useStore.getState().fly(cap.lon, cap.lat, (world.countryByA3.get(country.id)?.regions.length ?? 1) > 20 ? 2.8 : 3.8);
    }
  }, [country, world]);

  // Single-player: pause when a decision needs the player's attention.
  const decisionCount = state && country ? Object.values(state.decisions).filter((d) => d.country === country.id).length : 0;
  const prevDecisions = useRef(0);
  useEffect(() => {
    if (session?.isHost && !session.roomCode && decisionCount > prevDecisions.current && !state?.paused) void session.send({ type: 'setPaused', paused: true });
    prevDecisions.current = decisionCount;
  }, [decisionCount, session, state]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const s = useStore.getState();
      const st = s.session?.state;
      if (!st) return;
      if (e.code === 'Space') { e.preventDefault(); void s.send({ type: 'setPaused', paused: !st.paused }); }
      else if (/^Digit[1-5]$/.test(e.code)) void s.send({ type: 'setSpeed', speed: Number(e.code.slice(5)) });
      else if (e.code === 'Escape') useStore.setState({ orderMode: null, selectedFormation: null, selectedRegion: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session || !state || !me) return null;

  return (
    <div className="hud">
      <TopBar />
      <nav className="sidenav">
        {NAV.filter((n) => n.id !== 'chat' || session.roomCode || !session.isHost).map((n) => (
          <button key={n.id} className={panel === n.id ? 'active' : ''} onClick={() => useStore.setState({ panel: panel === n.id ? null : n.id })} title={n.label}>
            <span className="nav-icon">{n.icon}</span><span className="nav-label">{n.label}</span>
          </button>
        ))}
      </nav>
      {panel && (
        <div className="main-panel panel">
          <button className="close" onClick={() => useStore.setState({ panel: null })}>✕</button>
          {panel === 'overview' && <Overview />}
          {panel === 'politics' && <Politics />}
          {panel === 'laws' && <Laws />}
          {panel === 'economy' && <Economy />}
          {panel === 'military' && <Military />}
          {panel === 'diplomacy' && <Diplomacy />}
          {panel === 'news' && <News />}
          {panel === 'chat' && <Chat />}
          {panel === 'menu' && <GameMenu />}
        </div>
      )}
      <div className="right-column">
        <Decisions />
        <Proposals />
        <Inspector />
      </div>
      <BottomBar />
      {!country && <div className="spectator-banner">You are spectating — open the menu to take over a free country.</div>}
    </div>
  );
}

function TopBar() {
  const { session, state, me, country, world } = useGame();
  if (!session || !state || !me) return null;
  const governs = country ? playerGoverns(state, country, me.id) : false;
  const party = me.partyId ? state.parties[me.partyId] : null;
  const growth = country?.gdpGrowth ?? 0;
  const deficit = country ? (country.revenue - country.expenses) : 0;
  const host = me.isHost;
  return (
    <header className="topbar">
      <div className="tb-country" onClick={() => useStore.setState({ panel: 'overview' })}>
        {country ? <Flag country={country} iso2={world?.countryByA3.get(country.id)?.iso2} size={34} /> : null}
        <div>
          <div className="tb-name">{country?.name ?? 'Spectator'}</div>
          {country && party && (
            <div className="tb-sub">
              <span className="party-dot" style={{ background: rgbCss(party.color) }} />{party.short} · {governs ? <span className="good">Governing</span> : <span className="bad">Opposition</span>}
            </div>
          )}
        </div>
      </div>
      {country && (
        <div className="tb-stats">
          <TopStat label="Treasury" value={fmtMoney(country.treasury)} sub={`${deficit >= 0 ? '+' : ''}${fmtMoney(deficit)}/yr`} tone={deficit >= 0 ? 'good' : 'bad'} />
          <TopStat label="GDP" value={fmtMoney(country.gdp)} sub={`${growth >= 0 ? '▲' : '▼'} ${pct(growth)}`} tone={growth >= 0.01 ? 'good' : growth >= 0 ? 'warn' : 'bad'} />
          <TopStat label="Approval" value={`${country.approval.toFixed(0)}%`} tone={country.approval > 50 ? 'good' : country.approval > 35 ? 'warn' : 'bad'} />
          <TopStat label="Stability" value={country.stability.toFixed(0)} tone={country.stability > 60 ? 'good' : country.stability > 40 ? 'warn' : 'bad'} />
          <TopStat label="Debt" value={`${((country.debt / country.gdp) * 100).toFixed(0)}%`} sub="of GDP" tone={country.debt / country.gdp < 0.9 ? 'neutral' : 'bad'} />
          {isDemocracy(country.gov) && country.nextElection >= 0 && (
            <TopStat label="Election" value={formatTickDate(state, country.nextElection).replace(/^\d+ /, '')} sub={`${Math.max(0, Math.round((country.nextElection - state.tick) / 30))} months`} tone="neutral" />
          )}
        </div>
      )}
      <div className="tb-time">
        <div className="tb-date">{formatTickDate(state, state.tick)}</div>
        <div className="speed">
          <button disabled={!host} className={state.paused ? 'active' : ''} onClick={() => session.send({ type: 'setPaused', paused: !state.paused })} title="Pause (Space)">{state.paused ? '▶' : '❚❚'}</button>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} disabled={!host} className={!state.paused && state.speed === s ? 'active' : state.speed >= s ? 'lit' : ''} onClick={() => { void session.send({ type: 'setSpeed', speed: s }); if (state.paused) void session.send({ type: 'setPaused', paused: false }); }} title={`Speed ${s}`}>{'›'.repeat(Math.min(s, 3))}{s > 3 ? s : ''}</button>
          ))}
        </div>
      </div>
      {session.roomCode && <Pill title="Room code">{session.roomCode} · {Object.values(state.players).filter((p) => p.connected).length} online</Pill>}
    </header>
  );
}

function TopStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className={`tb-stat ${tone}`}>
      <span className="tb-label">{label}</span>
      <span className="tb-value">{value}</span>
      {sub && <span className="tb-subv">{sub}</span>}
    </div>
  );
}

function BottomBar() {
  const { state, me, world } = useGame();
  const mode = useStore((s) => s.mapMode);
  const selectedCountry = useStore((s) => s.selectedCountry);
  const showTraffic = useStore((s) => s.showTraffic);
  if (!state || !world) return null;
  const legend = mode === 'political' || mode === 'satellite' ? [] : computeRegionColors(state, world, mode, me?.country ?? null, selectedCountry).legend;
  const latest = [...state.news].reverse().filter((n) => n.important || (me?.country && n.countries.includes(me.country))).slice(0, 1)[0];
  return (
    <div className="bottombar">
      <div className="modes panel">
        {MODES.map((m) => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => useStore.setState({ mapMode: m.id })}>{m.label}</button>)}
        <span className="divider" />
        <button className={showTraffic ? 'active' : ''} onClick={() => useStore.setState({ showTraffic: !showTraffic })} title="Civilian traffic">Traffic</button>
        {legend.length > 0 && (
          <div className="legend">
            {legend.map((l) => <span key={l.label}><i style={{ background: rgbCss(l.color) }} />{l.label}</span>)}
          </div>
        )}
      </div>
      {latest && (
        <div className="ticker panel" onClick={() => {
          useStore.setState({ panel: 'news' });
          if (latest.region !== undefined) { const r = world.regions[latest.region]; useStore.getState().fly(r.lon, r.lat); }
        }}>
          <span className={`cat ${latest.cat}`}>{latest.cat}</span>
          <span className="ticker-date">{formatTickDate(state, latest.tick)}</span>
          <span className="ticker-text">{latest.text}</span>
        </div>
      )}
    </div>
  );
}
