import { useRef, useState } from 'react';
import { useStore } from '../store';
import { HostSession, ClientSession, listSaves, loadFromBrowser, deserializeSave, deleteSave, type SaveMeta } from '../net/session';

export function Menu() {
  const world = useStore((s) => s.world)!;
  const [name, setName] = useState(() => localStorage.getItem('mw.name') ?? '');
  const [mode, setMode] = useState<'main' | 'join' | 'load' | 'advanced'>('main');
  const [code, setCode] = useState('');
  const [saves, setSaves] = useState<SaveMeta[]>(() => listSaves());
  const [signal, setSignal] = useState(() => localStorage.getItem('mw.signal') ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const playerName = name.trim() || 'Leader';
  const remember = () => localStorage.setItem('mw.name', playerName);

  const start = (multiplayer: boolean) => {
    remember();
    useStore.getState().setSession(new HostSession(world, { name: playerName, multiplayer }));
    useStore.setState({ screen: 'lobby' });
  };
  const join = () => {
    if (!code.trim()) return;
    remember();
    useStore.getState().setSession(new ClientSession(world, code.trim().toUpperCase(), playerName));
    useStore.setState({ screen: 'lobby' });
  };
  const load = async (getState: () => Promise<import('../sim/types').GameState>, multiplayer: boolean) => {
    try {
      const state = await getState();
      remember();
      useStore.getState().setSession(new HostSession(world, { name: playerName, multiplayer, state }));
      useStore.setState({ screen: state.phase === 'playing' ? 'game' : 'lobby' });
    } catch (e) {
      useStore.getState().toast(String((e as Error).message ?? e), 'error');
    }
  };

  return (
    <div className="menu-screen">
      <div className="menu-card">
        <div className="brand big">MODERN<span>WORLD</span></div>
        <p className="tagline">Lead a nation. Win elections. Shape the world.</p>
        <label className="field">
          <span>Your name</span>
          <input value={name} placeholder="Leader" maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        {mode === 'main' && (
          <div className="menu-buttons">
            <button className="primary" onClick={() => start(false)}>Single Player</button>
            <button className="primary" onClick={() => start(true)}>Host Multiplayer</button>
            <button onClick={() => setMode('join')}>Join Multiplayer</button>
            <button onClick={() => { setSaves(listSaves()); setMode('load'); }}>Load Game</button>
            <button className="ghost small" onClick={() => setMode('advanced')}>Network settings</button>
          </div>
        )}
        {mode === 'join' && (
          <div className="menu-buttons">
            <label className="field">
              <span>Room code</span>
              <input value={code} autoFocus placeholder="e.g. K7Q2XM" maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && join()} className="code-input" />
            </label>
            <button className="primary" onClick={join} disabled={!code.trim()}>Join</button>
            <button className="ghost" onClick={() => setMode('main')}>Back</button>
          </div>
        )}
        {mode === 'load' && (
          <div className="menu-buttons">
            <div className="save-list">
              {saves.length === 0 && <div className="muted">No saved games in this browser.</div>}
              {saves.map((s) => (
                <div key={s.key} className="save-row">
                  <div>
                    <b>{s.name}</b>
                    <div className="muted small">{s.country} · {s.date} · saved {new Date(s.savedAt).toLocaleString()}</div>
                  </div>
                  <div className="row-actions">
                    <button className="small" onClick={() => load(() => loadFromBrowser(s.key), false)}>Solo</button>
                    <button className="small" onClick={() => load(() => loadFromBrowser(s.key), true)}>Host</button>
                    <button className="small ghost" onClick={() => { deleteSave(s.key); setSaves(listSaves()); }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".mwsave,application/gzip" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(async () => deserializeSave(new Uint8Array(await f.arrayBuffer())), false);
            }} />
            <button onClick={() => fileRef.current?.click()}>Load from file…</button>
            <button className="ghost" onClick={() => setMode('main')}>Back</button>
          </div>
        )}
        {mode === 'advanced' && (
          <div className="menu-buttons">
            <p className="muted small">Multiplayer connects players directly (WebRTC). A public PeerJS signalling server is used to introduce players unless you run your own with <code>npm run signal</code> and enter it here as JSON, e.g. <code>{'{"host":"my.server","port":9000,"path":"/","secure":false}'}</code>.</p>
            <textarea value={signal} rows={3} onChange={(e) => setSignal(e.target.value)} placeholder='{"host":"localhost","port":9000,"path":"/","secure":false}' />
            <button onClick={() => {
              try { if (signal.trim()) { JSON.parse(signal); localStorage.setItem('mw.signal', signal.trim()); } else localStorage.removeItem('mw.signal'); setMode('main'); useStore.getState().toast('Saved'); }
              catch { useStore.getState().toast('Invalid JSON', 'error'); }
            }}>Save</button>
            <button className="ghost" onClick={() => setMode('main')}>Back</button>
          </div>
        )}
        <div className="credits">Map data: Natural Earth · Imagery: NASA Blue Marble</div>
      </div>
    </div>
  );
}
