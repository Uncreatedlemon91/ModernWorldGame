import { useState } from 'react';
import { useGame, useStore } from '../store';

const STEPS = (country: string, party: string) => [
  { title: `Welcome, leader of ${country}`, body: `You lead ${party}. Keep your party in power, keep the country stable and prosperous, and shape the world through diplomacy — or force. Every other nation is run by the AI or by your friends.` },
  { title: 'The top bar', body: 'Treasury, GDP growth, approval, stability, debt and the next election are always visible. Use the speed controls (or Space and keys 1–5 as host) to pause and speed up time. The game pauses itself when a decision needs you in single-player.' },
  { title: 'Governing', body: 'Overview gives a briefing and explains your growth. Politics shows the legislature, polls, cabinet and campaigning. Laws are passed as bills (democracies), decrees (autocracies) or referendums. Economy sets taxes, spending, research and shows trade.' },
  { title: 'The map', body: 'Click a region to inspect it, build infrastructure, or campaign. Switch map modes at the bottom (wealth, unrest, elections, diplomacy…). Zoom in to see cities grow, buildings, and civilian traffic — ships, planes, cars and trains.' },
  { title: 'Armed forces', body: 'Build battalions, squadrons and flotillas at bases (Military → Production). Group battalions into regiments, then regiments and squadrons into armies or task forces. Select a formation and right-click the map to move, or pick an order. Enemy forces are hidden by fog of war unless near your territory or units.' },
  { title: 'Diplomacy & events', body: 'Sign treaties, join or found alliances, sanction rivals, send aid, or declare war in Diplomacy. Disasters, protests, scandals and crises demand decisions. Watch the news ticker. Good luck.' },
];

export function Tutorial() {
  const { state, me, country } = useGame();
  const open = useStore((s) => s.showTutorial);
  const [step, setStep] = useState(0);
  if (!open || !state || !me) return null;
  const party = me.partyId ? state.parties[me.partyId]?.name ?? 'your party' : 'your party';
  const steps = STEPS(country?.name ?? 'your nation', party);
  const s = steps[step];
  const close = () => { try { localStorage.setItem('mw.tutorial.done', '1'); } catch { /* ignore */ } useStore.setState({ showTutorial: false }); setStep(0); };
  return (
    <div className="tutorial-backdrop">
      <div className="tutorial panel">
        <div className="eyebrow">How to play · {step + 1}/{steps.length}</div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="tutorial-dots">{steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        <div className="row-actions">
          <button className="ghost" onClick={close}>Skip</button>
          <span className="grow" />
          {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
          {step < steps.length - 1 ? <button className="primary" onClick={() => setStep(step + 1)}>Next</button> : <button className="primary" onClick={close}>Start playing</button>}
        </div>
      </div>
    </div>
  );
}
