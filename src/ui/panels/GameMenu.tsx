import { useState } from 'react';
import { useGame, useStore } from '../../store';
import { saveToBrowser, serializeSave } from '../../net/session';
import { formatTickDate } from '../../sim/util';
import { Flag, Section } from '../common';
import { soundEnabled, setSoundEnabled } from '../sound';

export function GameMenu() {
  const { session, state, me, country, world } = useGame();
  const showLabels = useStore((s) => s.showLabels);
  const showTraffic = useStore((s) => s.showTraffic);
  const [busy, setBusy] = useState(false);
  if (!session || !state || !me || !world) return null;
  const free = Object.values(state.countries).filter((c) => !Object.values(state.players).some((p) => p.country === c.id && p.connected) && state.regions.some((r) => r.owner === c.id)).sort((a, b) => b.gdp - a.gdp);
  const label = `${country?.name ?? 'Spectator'} — ${formatTickDate(state, state.tick)}`;
  return (
    <div className="panel-content">
      <h2>Menu</h2>
      {session.isHost && (
        <Section title="Save game">
          <div className="row-actions wrap">
            <button disabled={busy} onClick={async () => {
              setBusy(true);
              try { await saveToBrowser(state, label, country?.name ?? '—', formatTickDate(state, state.tick)); useStore.getState().toast('Game saved'); }
              catch (e) { useStore.getState().toast((e as Error).message, 'error'); }
              setBusy(false);
            }}>Save in browser</button>
            <button disabled={busy} onClick={async () => {
              const data = await serializeSave(state);
              const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/gzip' }));
              const a = document.createElement('a');
              a.href = url; a.download = `${label.replace(/[^\w-]+/g, '_')}.mwsave`; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
            }}>Download save file</button>
          </div>
          {session.roomCode && <p className="muted small">Saves include every player's country. Load as host later and your friends can rejoin with the new room code.</p>}
        </Section>
      )}
      <Section title="Help">
        <button onClick={() => useStore.setState({ showTutorial: true, panel: null })}>How to play</button>
      </Section>
      <Section title="Display">
        <label className="check"><input type="checkbox" checked={showLabels} onChange={(e) => useStore.setState({ showLabels: e.target.checked })} /> Labels</label>
        <label className="check"><input type="checkbox" defaultChecked={soundEnabled()} onChange={(e) => setSoundEnabled(e.target.checked)} /> Sound cues</label>
        <label className="check"><input type="checkbox" checked={showTraffic} onChange={(e) => useStore.setState({ showTraffic: e.target.checked })} /> Civilian traffic (ships, planes, cars, trains)</label>
      </Section>
      {!country && (
        <Section title="Take over a country">
          <div className="nation-list">
            {free.slice(0, 80).map((c) => (
              <button key={c.id} className="country-row" onClick={() => session.send({ type: 'lobbyPick', country: c.id })}>
                <Flag country={c} iso2={world.countryByA3.get(c.id)?.iso2} /><span className="grow name">{c.name}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Controls">
        <div className="small muted">
          <div><b>Click</b> region: inspect · <b>Click</b> unit counter: select</div>
          <div><b>Right-click</b> with a formation selected: move there</div>
          <div><b>Space</b>: pause · <b>1–5</b>: speed (host) · <b>Esc</b>: cancel</div>
        </div>
      </Section>
      <button className="danger" onClick={() => { if (confirm(session.isHost && session.roomCode ? 'Quit? This ends the game for everyone.' : 'Quit to main menu?')) useStore.getState().setSession(null); }}>Quit to main menu</button>
    </div>
  );
}
