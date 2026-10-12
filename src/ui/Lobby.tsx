import { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Flag, Section, Slider, Swatch } from './common';
import { fmtMoney, fmtPop } from '../sim/util';
import { MAJORS } from '../sim/content/majors';
import { formationUnits } from '../sim/military';
import { rgbCss } from '../map/colors';
import { GOV_NAMES } from './labels';
import { BLOC_NAMES } from '../sim/blocs';
import { countryPop } from '../sim/economy';
import { SCENARIOS } from '../sim/content/scenarios';

export function Lobby() {
  const { session, state, me, world } = useGame();
  const send = useStore((s) => s.send);
  const selectedCountry = useStore((s) => s.selectedCountry);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'major' | 'all'>('major');

  const countries = useMemo(() => {
    if (!state) return [];
    return Object.values(state.countries).sort((a, b) => b.gdp - a.gdp);
  }, [state]);

  if (!session) return null;
  if (!state || !me) {
    return (
      <div className="lobby-screen">
        <div className="panel lobby-status">
          <h2>{session.status === 'error' ? 'Could not connect' : 'Connecting…'}</h2>
          <p className="muted">{session.statusText}</p>
          <button onClick={() => useStore.getState().setSession(null)}>Back to menu</button>
        </div>
      </div>
    );
  }

  const myCountry = me.country ? state.countries[me.country] : null;
  const preview = state.countries[selectedCountry ?? me.country ?? ''] ?? null;
  const takenBy = (id: string) => Object.values(state.players).find((p) => p.country === id && (p.connected || p.id === me.id));
  const list = countries.filter((c) => (filter === 'all' || MAJORS[c.id]) && c.name.toLowerCase().includes(q.toLowerCase()));
  const party = me.partyId ? state.parties[me.partyId] : null;
  const pick = (id: string) => {
    useStore.setState({ selectedCountry: id });
    const sc = world!.countryByA3.get(id)!;
    const cap = world!.regions[state.countries[id].capital];
    useStore.getState().fly(cap.lon, cap.lat, sc.regions.length > 20 ? 2.6 : 3.6);
  };
  const players = Object.values(state.players);

  return (
    <div className="lobby-screen">
      <div className="panel lobby-left">
        <div className="brand">MODERN<span>WORLD</span></div>
        <Section title="Room">
          {session.roomCode ? (
            <div className="room-code">
              <span className="muted small">Share this code with friends</span>
              <div className="code" onClick={() => { void navigator.clipboard?.writeText(session.roomCode!); useStore.getState().toast('Room code copied'); }} title="Click to copy">{session.roomCode}</div>
            </div>
          ) : session.isHost ? (
            <div className="muted small">{session.status === 'error' ? session.statusText : session.statusText || 'Single-player game'}</div>
          ) : <div className="muted small">Connected to room {(session as { roomCode?: string }).roomCode}</div>}
        </Section>
        <Section title={`Players (${players.length})`}>
          {players.map((p) => {
            const c = p.country ? state.countries[p.country] : null;
            return (
              <div key={p.id} className="player-row">
                {c ? <Flag country={c} iso2={world!.countryByA3.get(c.id)?.iso2} /> : <span className="flag flag-fallback">?</span>}
                <div className="grow">
                  <b>{p.name}</b>{p.isHost && <span className="tag">host</span>}{p.id === me.id && <span className="tag me">you</span>}
                  <div className="muted small">{c ? c.name : 'Choosing a country…'}</div>
                </div>
                <span className={`ready ${p.ready ? 'on' : ''}`}>{p.ready ? 'Ready' : p.connected ? '…' : 'Offline'}</span>
              </div>
            );
          })}
        </Section>
        <Section title="Game settings">
          <div className="settings-grid">
            <label>Scenario</label>
            <select disabled={!me.isHost} value={state.settings.scenario ?? 'peaceful'} onChange={(e) => send({ type: 'lobbySettings', settings: { scenario: e.target.value as 'realworld' | 'peaceful' } })}>
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
            <span />
            <span className="muted small">{SCENARIOS.find((sc) => sc.id === (state.settings.scenario ?? 'peaceful'))?.desc}</span>
            <label>Start year</label>
            <select disabled={!me.isHost} value={state.settings.startYear} onChange={(e) => send({ type: 'lobbySettings', settings: { startYear: Number(e.target.value) } })}>
              {[2025, 2026, 2027, 2030].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <label>Losing elections</label>
            <select disabled={!me.isHost} value={state.settings.electionsCanRemovePlayers ? 'yes' : 'no'} onChange={(e) => send({ type: 'lobbySettings', settings: { electionsCanRemovePlayers: e.target.value === 'yes' } })}>
              <option value="yes">Puts you in opposition</option>
              <option value="no">You stay in power</option>
            </select>
            <label>AI aggression</label>
            <select disabled={!me.isHost} value={state.settings.aiAggression} onChange={(e) => send({ type: 'lobbySettings', settings: { aiAggression: Number(e.target.value) } })}>
              <option value={0.3}>Peaceful</option><option value={1}>Normal</option><option value={1.8}>Warlike</option>
            </select>
            <label>Disasters</label>
            <select disabled={!me.isHost} value={state.settings.disasterFrequency} onChange={(e) => send({ type: 'lobbySettings', settings: { disasterFrequency: Number(e.target.value) } })}>
              <option value={0.3}>Rare</option><option value={1}>Normal</option><option value={2}>Frequent</option>
            </select>
            <label>Economy</label>
            <select disabled={!me.isHost} value={state.settings.economyDifficulty} onChange={(e) => send({ type: 'lobbySettings', settings: { economyDifficulty: Number(e.target.value) } })}>
              <option value={0.7}>Forgiving</option><option value={1}>Realistic</option><option value={1.3}>Harsh</option>
            </select>
          </div>
        </Section>
        <div className="lobby-actions">
          <button className={me.ready ? '' : 'primary'} disabled={!myCountry} onClick={() => send({ type: 'lobbyReady', ready: !me.ready })}>{me.ready ? 'Not ready' : 'Ready'}</button>
          {me.isHost && <button className="primary" disabled={!myCountry} onClick={() => send({ type: 'start' })}>Start game</button>}
          <button className="ghost" onClick={() => useStore.getState().setSession(null)}>Leave</button>
        </div>
      </div>

      <div className="panel lobby-right">
        <h2>Choose your nation</h2>
        <div className="row">
          <input className="grow" placeholder="Search countries…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">
            <button className={filter === 'major' ? 'active' : ''} onClick={() => setFilter('major')}>Major powers</button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {countries.length}</button>
          </div>
        </div>
        <div className="country-list">
          {list.map((c) => {
            const t = takenBy(c.id);
            return (
              <button key={c.id} className={`country-row ${preview?.id === c.id ? 'sel' : ''}`} onClick={() => pick(c.id)}>
                <Flag country={c} iso2={world!.countryByA3.get(c.id)?.iso2} />
                <span className="grow name">{c.name}</span>
                {MAJORS[c.id] && <span className="tag">detailed</span>}
                {t && <span className="tag me">{t.name}</span>}
                <span className="muted small mono">{fmtMoney(c.gdp)}</span>
              </button>
            );
          })}
        </div>
        {preview && (
          <div className="preview">
            <div className="preview-head">
              <Flag country={preview} iso2={world!.countryByA3.get(preview.id)?.iso2} size={40} />
              <div className="grow">
                <h3>{preview.name}</h3>
                <div className="muted small">{GOV_NAMES[preview.gov]} · {BLOC_NAMES[preview.bloc]}</div>
              </div>
            </div>
            <div className="preview-grid">
              <div><span className="muted small">GDP</span><b>{fmtMoney(preview.gdp)}</b></div>
              <div><span className="muted small">Population</span><b>{fmtPop(countryPop(state, preview.id))}</b></div>
              <div><span className="muted small">Regions</span><b>{world!.countryByA3.get(preview.id)?.regions.length}</b></div>
              <div><span className="muted small">Units</span><b>{Object.values(state.formations).filter((f) => f.owner === preview.id && !f.parent).reduce((s, f) => s + formationUnits(state, f).length, 0)}</b></div>
              <div><span className="muted small">Approval</span><b>{preview.approval.toFixed(0)}%</b></div>
              <div><span className="muted small">Stability</span><b>{preview.stability.toFixed(0)}</b></div>
            </div>
            <div className="small">Ruling party: <Swatch color={state.parties[preview.rulingParty]?.color ?? [128, 128, 128]} /> <b>{state.parties[preview.rulingParty]?.name}</b></div>
            {takenBy(preview.id) && takenBy(preview.id)!.id !== me.id
              ? <div className="muted">Taken by {takenBy(preview.id)!.name}</div>
              : me.country === preview.id
                ? <button onClick={() => send({ type: 'lobbyPick', country: null })}>Release</button>
                : <button className="primary" onClick={() => send({ type: 'lobbyPick', country: preview.id })}>Lead {preview.name}</button>}
          </div>
        )}
        {myCountry && party && (
          <Section title="Your party">
            <div className="party-edit">
              <input defaultValue={party.name} onBlur={(e) => send({ type: 'party', name: e.target.value })} />
              <input className="short" defaultValue={party.short} maxLength={8} onBlur={(e) => send({ type: 'party', short: e.target.value })} />
              <input type="color" defaultValue={rgbHex(party.color)} onChange={(e) => send({ type: 'party', color: e.target.value })} />
            </div>
            <div className="ideology-row"><span>Economy</span><span className="muted small">Left</span>
              <Slider value={party.ideology.econ} min={-1} max={1} step={0.05} onCommit={(v) => send({ type: 'party', econ: v })} format={(v) => v.toFixed(2)} /><span className="muted small">Right</span></div>
            <div className="ideology-row"><span>Society</span><span className="muted small">Progressive</span>
              <Slider value={party.ideology.social} min={-1} max={1} step={0.05} onCommit={(v) => send({ type: 'party', social: v })} format={(v) => v.toFixed(2)} /><span className="muted small">Conservative</span></div>
            <p className="muted small">Voters and interest groups judge you by how close your platform is to them. You can change this later, but sudden shifts cost credibility.</p>
          </Section>
        )}
      </div>
    </div>
  );
}

export const rgbHex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export { rgbCss };
