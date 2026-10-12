import { useGame, useStore } from '../../store';
import { Section, Empty, Swatch, Meter } from '../common';
import { rgbCss } from '../../map/colors';
import { billVotes, isDemocracy, nationalVote, playerGoverns, ideologyDistance } from '../../sim/politics';
import { LAW_BY_ID, lawOption } from '../../sim/content/laws';
import { formatTickDate } from '../../sim/util';
import { GOV_NAMES } from '../labels';

export function Politics() {
  const { state, me, country, world } = useGame();
  const send = useStore((s) => s.send);
  const selectedRegion = useStore((s) => s.selectedRegion);
  if (!state || !me || !world) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const party = me.partyId ? state.parties[me.partyId] : null;
  const governs = playerGoverns(state, country, me.id);
  const parties = Object.keys(country.seats).map((id) => state.parties[id]).filter(Boolean).sort((a, b) => (country.seats[b.id] ?? 0) - (country.seats[a.id] ?? 0));
  const poll = isDemocracy(country.gov) ? nationalVote(state, world, country) : {};
  const bills = Object.values(state.bills).filter((b) => b.country === country.id);
  const total = country.legislatureSize;
  const coalitionSeats = country.coalition.reduce((s, id) => s + (country.seats[id] ?? 0), 0);
  const campaignRegion = selectedRegion !== null && state.regions[selectedRegion]?.owner === country.id ? selectedRegion : country.capital;

  return (
    <div className="panel-content">
      <h2>Politics</h2>
      <div className="muted">{GOV_NAMES[country.gov]} · Legislature of {total} seats</div>
      {!isDemocracy(country.gov) && <div className="callout">There are no competitive elections. Your power rests on stability, legitimacy and the security establishment. Laws pass by decree.</div>}

      <Section title="Legislature" right={<span className="small">{country.coalition.length > 1 ? 'Coalition' : 'Government'}: <b>{coalitionSeats}</b>/{total}</span>}>
        <div className="seat-bar">
          {parties.map((p) => (
            <div key={p.id} style={{ flex: country.seats[p.id] ?? 0, background: rgbCss(p.color), opacity: country.coalition.includes(p.id) ? 1 : 0.55 }} title={`${p.name}: ${country.seats[p.id]} seats`} />
          ))}
        </div>
        <div className="majority-line"><span style={{ left: '50%' }} /></div>
        <table className="table">
          <thead><tr><th>Party</th><th>Seats</th><th>Poll</th><th /></tr></thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id} className={p.playerId ? 'me' : ''}>
                <td><Swatch color={p.color} /> <b>{p.short}</b> <span className="muted small">{p.name}</span></td>
                <td className="mono">{country.seats[p.id] ?? 0}</td>
                <td className="mono">{((poll[p.id] ?? p.popularity) * 100).toFixed(1)}%</td>
                <td className="small">{p.id === country.rulingParty ? <span className="tag">ruling</span> : country.coalition.includes(p.id) ? <span className="tag">coalition</span> : ''}{p.playerId ? <span className="tag me">{state.players[p.playerId]?.name}</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isDemocracy(country.gov) && country.nextElection >= 0 && (
          <div className="kv"><span>Next election</span><b>{formatTickDate(state, country.nextElection)}</b></div>
        )}
        {country.lastElection && <div className="kv"><span>Last election</span><span>{formatTickDate(state, country.lastElection.tick)}</span></div>}
        <button className="small" onClick={() => useStore.setState({ mapMode: 'elections', selectedCountry: country.id })}>Show electoral map</button>
      </Section>

      {party && isDemocracy(country.gov) && (
        <Section title="Campaign" right={<span className="small">Party funds <b>${party.funds.toFixed(1)}M</b></span>}>
          <p className="muted small">Target: <b>{world.regions[campaignRegion].n}</b> (select a region on the map to change)</p>
          <div className="row-actions wrap">
            <button onClick={() => send({ type: 'campaign', region: campaignRegion, kind: 'rally' })}>Hold rally · $1M</button>
            <button onClick={() => send({ type: 'campaign', region: campaignRegion, kind: 'canvass' })}>Door-to-door · $2M</button>
            <button onClick={() => send({ type: 'campaign', region: campaignRegion, kind: 'ads' })}>National ad blitz · $4M</button>
          </div>
          <Meter label="Momentum" value={50 + party.momentum * 100} right={(party.momentum * 100).toFixed(0)} />
        </Section>
      )}

      <Section title={`Bills before the legislature (${bills.length})`}>
        {bills.length === 0 && <div className="muted small">No pending legislation. Propose changes in the Laws panel.</div>}
        {bills.map((b) => {
          const law = LAW_BY_ID[b.law];
          const opt = lawOption(b.law, b.option)!;
          const v = billVotes(state, country, b);
          const sponsor = state.parties[b.sponsor];
          const mine = party?.id === b.sponsor;
          return (
            <div key={b.id} className="bill">
              <div><b>{law.name}: {opt.name}</b></div>
              <div className="muted small">Sponsored by {sponsor?.short} · vote {formatTickDate(state, b.voteOn)}</div>
              <div className="vote-bar"><div className="yes" style={{ flex: v.yes }}>{v.yes} yes</div><div className="no" style={{ flex: v.no }}>{v.no} no</div></div>
              {party && !mine && (country.seats[party.id] ?? 0) > 0 && (
                <div className="row-actions">
                  <span className="small muted">Your party votes:</span>
                  <button className={`small ${party.billStance[b.id] === 'yes' ? 'primary' : ''}`} onClick={() => send({ type: 'billStance', bill: b.id, vote: 'yes' })}>Yes</button>
                  <button className={`small ${party.billStance[b.id] === 'no' ? 'primary' : ''}`} onClick={() => send({ type: 'billStance', bill: b.id, vote: 'no' })}>No</button>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Party platforms" collapsible>
        <div className="ideology-plot">
          <span className="axis-x">Economic left ← → right</span>
          <span className="axis-y">Progressive ↑ ↓ Conservative</span>
          {parties.map((p) => (
            <div key={p.id} className="dot" title={p.name} style={{ left: `${50 + p.ideology.econ * 45}%`, top: `${50 + p.ideology.social * 45}%`, background: rgbCss(p.color), width: 10 + Math.sqrt(country.seats[p.id] ?? 1) * 1.2, height: 10 + Math.sqrt(country.seats[p.id] ?? 1) * 1.2 }}>
              <span>{p.short}</span>
            </div>
          ))}
        </div>
        {party && (
          <div className="small muted">Closest rival: {parties.filter((p) => p.id !== party.id).sort((a, b) => ideologyDistance(a.ideology, party.ideology) - ideologyDistance(b.ideology, party.ideology))[0]?.name ?? '—'}</div>
        )}
      </Section>
      {!governs && <div className="callout">In opposition you cannot set budgets, build, command forces or conduct diplomacy.</div>}
    </div>
  );
}
