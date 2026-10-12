import { useGame, useStore } from '../store';
import { Flag } from './common';
import { TREATY_INFO } from '../sim/diplomacy';
import { playerGoverns } from '../sim/politics';
import type { Proposal } from '../sim/types';
import type { GameState } from '../sim/types';
import { iconDataUrl } from '../map/icons';
import { EVENTS } from '../sim/events';

export function Decisions() {
  const { state, me, country, world } = useGame();
  const send = useStore((s) => s.send);
  if (!state || !me || !country || !playerGoverns(state, country, me.id)) return null;
  const decisions = Object.values(state.decisions).filter((d) => d.country === country.id).sort((a, b) => a.created - b.created);
  if (!decisions.length) return null;
  const d = decisions[0];
  const kind = EVENTS.find((e) => e.id === d.event)?.kind ?? 'protest';
  return (
    <div className="decision panel">
      <div className="decision-head">
        <img src={iconDataUrl(kind, '#ffd27a', 40)} alt="" />
        <div>
          <div className="eyebrow">Decision required{decisions.length > 1 ? ` · ${decisions.length} pending` : ''}</div>
          <h3>{d.title}</h3>
        </div>
      </div>
      <p>{d.text}</p>
      {d.region !== undefined && world && (
        <button className="link" onClick={() => { const r = world.regions[d.region!]; useStore.getState().fly(r.lon, r.lat, 4.5); useStore.setState({ selectedRegion: d.region!, selectedCountry: country.id }); }}>Show on map</button>
      )}
      <div className="decision-options">
        {d.options.map((o) => (
          <button key={o.id} onClick={() => send({ type: 'decision', id: d.id, option: o.id })}>
            <b>{o.label}</b>
            <span>{o.detail}</span>
          </button>
        ))}
      </div>
      <div className="muted small">Expires in {d.expires - state.tick} days</div>
    </div>
  );
}

export function describeProposal(state: GameState, p: Proposal): string {
  const from = state.countries[p.from]?.name ?? p.from;
  switch (p.kind.type) {
    case 'treaty': return `${from} proposes a ${TREATY_INFO[p.kind.treaty].name}.`;
    case 'join_org': return `${from} invites you to join ${state.orgs[p.kind.org]?.name ?? 'an organization'}.`;
    case 'peace': {
      const w = state.wars[p.kind.war];
      return `${from} offers peace to end the ${w?.name ?? 'war'}: ${p.kind.cede.length} region(s) change hands${p.kind.reparations ? `, $${p.kind.reparations.toFixed(1)}B reparations` : ''}.`;
    }
    case 'join_war': return `${from} calls on you to join the ${state.wars[p.kind.war]?.name ?? 'war'}. Refusing will damage relations.`;
    case 'aid': return `${from} offers $${p.kind.amount.toFixed(1)}B in aid.`;
  }
}

export function Proposals() {
  const { state, me, country, world } = useGame();
  const send = useStore((s) => s.send);
  if (!state || !me || !country || !playerGoverns(state, country, me.id)) return null;
  const incoming = Object.values(state.proposals).filter((p) => p.to === country.id);
  if (!incoming.length) return null;
  return (
    <div className="proposals">
      {incoming.slice(0, 3).map((p) => (
        <div key={p.id} className="proposal panel">
          <Flag country={state.countries[p.from]} iso2={world?.countryByA3.get(p.from)?.iso2} />
          <div className="grow">
            <div className="small">{describeProposal(state, p)}</div>
            <div className="row-actions">
              <button className="small primary" onClick={() => send({ type: 'respond', proposal: p.id, accept: true })}>Accept</button>
              <button className="small" onClick={() => send({ type: 'respond', proposal: p.id, accept: false })}>Decline</button>
            </div>
          </div>
        </div>
      ))}
      {incoming.length > 3 && <div className="muted small">+{incoming.length - 3} more in Diplomacy</div>}
    </div>
  );
}
