import { useEffect, useState } from 'react';
import { useStore } from './store';
import { loadStaticWorld } from './data/static';
import { MapView } from './map/MapView';
import { Menu } from './ui/Menu';
import { Lobby } from './ui/Lobby';
import { Game } from './ui/Game';
import { Toasts } from './ui/Toasts';

export function App() {
  const screen = useStore((s) => s.screen);
  const world = useStore((s) => s.world);
  const session = useStore((s) => s.session);
  const version = useStore((s) => s.version);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStaticWorld('./data/', setProgress)
      .then((w) => useStore.setState({ world: w, screen: 'menu' }))
      .catch((e) => setError(String(e)));
  }, []);

  // Route between lobby and game based on the session's phase.
  useEffect(() => {
    if (!session) { if (screen === 'lobby' || screen === 'game') useStore.setState({ screen: 'menu' }); return; }
    const phase = session.state?.phase;
    if (phase === 'playing' && screen !== 'game') useStore.setState({ screen: 'game' });
    else if (phase !== 'playing' && screen !== 'lobby') useStore.setState({ screen: 'lobby' });
  }, [session, version, screen]);

  return (
    <div className="app">
      {world && <MapView />}
      {screen === 'loading' && (
        <div className="loading">
          <div className="brand big">MODERN<span>WORLD</span></div>
          {error ? <div className="error">{error}</div> : <div className="load-bar"><div style={{ width: `${progress * 100}%` }} /></div>}
          <div className="muted">Loading the world…</div>
        </div>
      )}
      {screen === 'menu' && <Menu />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Game />}
      <Toasts />
    </div>
  );
}
