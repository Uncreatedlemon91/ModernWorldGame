import { useMemo, useState } from 'react';
import { useGame, useStore } from '../../store';
import { Empty, Flag, Section, Swatch, Tabs } from '../common';
import { TREATY_INFO, areEnemies, hasTreaty, opinion, defenders } from '../../sim/diplomacy';
import { playerGoverns } from '../../sim/politics';
import { militaryPower } from '../../sim/ai';
import { fmtMoney } from '../../sim/util';
import type { TreatyType } from '../../sim/types';
import { GOV_NAMES, TREATY_ICON } from '../labels';
import { BLOC_NAMES } from '../../sim/blocs';
import { describeProposal } from '../Notifications';

type Tab = 'nations' | 'orgs' | 'proposals';

export function Diplomacy() {
  const { state, me, country } = useGame();
  const [tab, setTab] = useState<Tab>('nations');
  if (!state || !me) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const pending = Object.values(state.proposals).filter((p) => p.to === country.id || p.from === country.id).length;
  return (
    <div className="panel-content">
      <h2>Diplomacy</h2>
      {!playerGoverns(state, country, me.id) && <div className="callout bad">Only the government conducts foreign policy.</div>}
      <Tabs tabs={[{ id: 'nations', label: 'Nations' }, { id: 'orgs', label: 'Alliances & blocs' }, { id: 'proposals', label: `Proposals (${pending})` }]} value={tab} onChange={setTab} />
      {tab === 'nations' && <Nations />}
      {tab === 'orgs' && <Orgs />}
      {tab === 'proposals' && <ProposalsList />}
    </div>
  );
}

function Nations() {
  const { state, country, world } = useGame();
  const selected = useStore((s) => s.selectedCountry);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!state || !country) return [];
    return Object.values(state.countries).filter((c) => c.id !== country.id && state.regions.some((r) => r.owner === c.id))
      .map((c) => ({ c, op: opinion(state, country.id, c.id) }))
      .sort((a, b) => b.c.gdp - a.c.gdp);
  }, [state, country, state?.tick]); // eslint-disable-line
  if (!state || !country || !world) return null;
  const target = selected && selected !== country.id ? state.countries[selected] : null;
  return (
    <>
      {target ? <ForeignCountry id={target.id} /> : <div className="muted small">Select a nation below or click one on the map.</div>}
      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="nation-list">
        {list.filter(({ c }) => c.name.toLowerCase().includes(q.toLowerCase())).map(({ c, op }) => (
          <button key={c.id} className={`country-row ${selected === c.id ? 'sel' : ''}`} onClick={() => useStore.setState({ selectedCountry: c.id })}>
            <Flag country={c} iso2={world.countryByA3.get(c.id)?.iso2} />
            <span className="grow name">{c.name}</span>
            {areEnemies(state, country.id, c.id) && <span className="tag bad">war</span>}
            {(['alliance', 'defensive_pact', 'trade', 'non_aggression', 'military_access', 'research'] as TreatyType[]).filter((t) => hasTreaty(state, country.id, c.id, t)).map((t) => <span key={t} title={TREATY_INFO[t].name} className="treaty-ico">{TREATY_ICON[t]}</span>)}
            <span className={`mono small ${op > 20 ? 'good' : op < -20 ? 'bad' : ''}`}>{op > 0 ? '+' : ''}{op}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function ForeignCountry({ id }: { id: string }) {
  const { state, country, world, me } = useGame();
  const send = useStore((s) => s.send);
  const [aid, setAid] = useState(1);
  if (!state || !country || !world || !me) return null;
  const c = state.countries[id];
  if (!c) return null;
  const op = opinion(state, country.id, id);
  const theirOp = opinion(state, id, country.id);
  const enemy = areEnemies(state, country.id, id);
  const governs = playerGoverns(state, country, me.id);
  const sanctioned = Boolean(state.sanctions[`${country.id}>${id}`]);
  const controller = c.playerId ? state.players[c.playerId]?.name : null;
  const myPow = militaryPower(state, country.id), theirPow = militaryPower(state, id);
  const theirAllies = defenders(state, id).filter((a) => state.countries[a]);
  const myOrgs = Object.values(state.orgs).filter((o) => o.members.includes(country.id) && !o.members.includes(id));
  return (
    <div className="foreign">
      <div className="preview-head">
        <Flag country={c} iso2={world.countryByA3.get(id)?.iso2} size={38} />
        <div className="grow">
          <h3>{c.name}</h3>
          <div className="muted small">{GOV_NAMES[c.gov]} · {BLOC_NAMES[c.bloc]} · {controller ? `Player: ${controller}` : 'AI'}</div>
        </div>
      </div>
      <div className="preview-grid">
        <div><span className="muted small">Their view of us</span><b className={theirOp > 0 ? 'good' : 'bad'}>{theirOp}</b></div>
        <div><span className="muted small">GDP</span><b>{fmtMoney(c.gdp)}</b></div>
        <div><span className="muted small">Military</span><b>{theirPow > myPow * 1.3 ? 'Stronger' : theirPow < myPow / 1.3 ? 'Weaker' : 'Comparable'}</b></div>
        <div><span className="muted small">Ruling party</span><b><Swatch color={state.parties[c.rulingParty]?.color ?? [99, 99, 99]} /> {state.parties[c.rulingParty]?.short}</b></div>
        <div><span className="muted small">Stability</span><b>{c.stability.toFixed(0)}</b></div>
        <div><span className="muted small">Allies</span><b>{theirAllies.length}</b></div>
      </div>
      {governs && (
        <>
          <div className="muted small">Treaties (opinion {op}):</div>
          <div className="treaty-grid">
            {(Object.keys(TREATY_INFO) as TreatyType[]).map((t) => {
              const has = hasTreaty(state, country.id, id, t);
              return (
                <button key={t} className={`small ${has ? 'active' : ''}`} disabled={enemy} title={TREATY_INFO[t].desc}
                  onClick={() => (has ? send({ type: 'cancelTreaty', with: id, treaty: t }) : send({ type: 'propose', to: id, kind: { type: 'treaty', treaty: t } }))}>
                  {TREATY_ICON[t]} {has ? `Cancel ${TREATY_INFO[t].name}` : TREATY_INFO[t].name}
                </button>
              );
            })}
          </div>
          <div className="row-actions wrap">
            <button className="small" disabled={enemy} onClick={() => send({ type: 'improveRelations', target: id })}>Send envoy</button>
            <span className="row"><input type="number" className="small-input" min={0.1} step={0.5} value={aid} onChange={(e) => setAid(Number(e.target.value))} /><button className="small" onClick={() => send({ type: 'propose', to: id, kind: { type: 'aid', amount: aid } })}>Send ${aid}B aid</button></span>
            <button className="small" onClick={() => send({ type: 'sanction', target: id, on: !sanctioned })}>{sanctioned ? 'Lift sanctions' : 'Impose sanctions'}</button>
            {myOrgs.map((o) => <button key={o.id} className="small" onClick={() => send({ type: 'inviteOrg', org: o.id, to: id })}>Invite to {o.short}</button>)}
            {!enemy && (
              <button className="small danger" onClick={() => {
                if (confirm(`Declare war on ${c.name}?${theirAllies.length ? ` Their allies (${theirAllies.map((a) => state.countries[a].name).slice(0, 6).join(', ')}) may join.` : ''}`)) void send({ type: 'declareWar', target: id });
              }}>Declare war</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Orgs() {
  const { state, country, world, me } = useGame();
  const send = useStore((s) => s.send);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [kind, setKind] = useState<'military' | 'economic' | 'political'>('military');
  const [color, setColor] = useState('#5b8def');
  if (!state || !country || !world || !me) return null;
  const governs = playerGoverns(state, country, me.id);
  return (
    <>
      {Object.values(state.orgs).map((o) => (
        <Section key={o.id} title={<span><Swatch color={o.color} /> {o.name} ({o.short})</span>} right={<span className="muted small">{o.kind} · {o.members.length}</span>} collapsible>
          <div className="flag-cloud">{o.members.map((m) => <span key={m} title={state.countries[m]?.name} onClick={() => useStore.setState({ selectedCountry: m })}><Flag country={state.countries[m]} iso2={world.countryByA3.get(m)?.iso2} /></span>)}</div>
          {governs && o.members.includes(country.id) && <button className="small ghost" onClick={() => confirm(`Leave ${o.short}?`) && send({ type: 'leaveOrg', org: o.id })}>Leave {o.short}</button>}
          {o.kind === 'military' && <div className="muted small">Members defend each other when attacked.</div>}
        </Section>
      ))}
      {governs && (
        <Section title="Found a new organization" collapsible>
          <input placeholder="Name, e.g. Pacific Defense Pact" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="row">
            <input placeholder="Short" value={short} maxLength={10} onChange={(e) => setShort(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="military">Military alliance</option><option value="economic">Economic union</option><option value="political">Political forum</option>
            </select>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <button className="primary small" disabled={!name} onClick={() => { void send({ type: 'createOrg', name, short: short || name.slice(0, 4).toUpperCase(), kind, color }); setName(''); setShort(''); }}>Found</button>
        </Section>
      )}
    </>
  );
}

function ProposalsList() {
  const { state, country } = useGame();
  const send = useStore((s) => s.send);
  if (!state || !country) return null;
  const incoming = Object.values(state.proposals).filter((p) => p.to === country.id);
  const outgoing = Object.values(state.proposals).filter((p) => p.from === country.id);
  return (
    <>
      <Section title={`Incoming (${incoming.length})`}>
        {incoming.length === 0 && <div className="muted small">None.</div>}
        {incoming.map((p) => (
          <div key={p.id} className="bill">
            <div className="small">{describeProposal(state, p)}</div>
            <div className="row-actions">
              <button className="small primary" onClick={() => send({ type: 'respond', proposal: p.id, accept: true })}>Accept</button>
              <button className="small" onClick={() => send({ type: 'respond', proposal: p.id, accept: false })}>Decline</button>
            </div>
          </div>
        ))}
      </Section>
      <Section title={`Awaiting reply (${outgoing.length})`}>
        {outgoing.length === 0 && <div className="muted small">None.</div>}
        {outgoing.map((p) => <div key={p.id} className="small">→ {state.countries[p.to]?.name}: {p.kind.type === 'treaty' ? TREATY_INFO[p.kind.treaty].name : p.kind.type.replace('_', ' ')}</div>)}
      </Section>
    </>
  );
}
