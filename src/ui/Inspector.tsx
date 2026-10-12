import { useGame, useStore } from '../store';
import { Flag, Meter, Section } from './common';
import { BUILDINGS, BUILDING_BY_ID } from '../sim/content/buildings';
import { UNIT_BY_ID } from '../sim/content/units';
import { buildingCost, canBuild } from '../sim/construction';
import { regionGdp } from '../sim/economy';
import { fmtMoney, fmtPop, haversineKm } from '../sim/util';
import { formationDomain, formationStrength, formationUnits } from '../sim/military';
import { playerGoverns, isDemocracy, regionVote } from '../sim/politics';
import { iconDataUrl, BUILDING_ICON_COLOR } from '../map/icons';
import { rgbCss } from '../map/colors';
import { ForeignCountry } from './panels/Diplomacy';
import type { Order } from '../sim/types';
import { formationVisible } from '../sim/visibility';

export function Inspector() {
  const selectedFormation = useStore((s) => s.selectedFormation);
  const selectedRegion = useStore((s) => s.selectedRegion);
  if (selectedFormation) return <FormationInspector id={selectedFormation} />;
  if (selectedRegion !== null) return <RegionInspector id={selectedRegion} />;
  return null;
}

const ORDER_LABEL: Record<Order['kind'], string> = {
  hold: 'Hold', move: 'Move', patrol: 'Patrol', blockade: 'Blockade', airSuperiority: 'Air superiority', groundSupport: 'Ground support', strategicBombing: 'Strategic bombing', amphibious: 'Amphibious landing', missileStrike: 'Missile strike',
};

function FormationInspector({ id }: { id: string }) {
  const { state, me, world } = useGame();
  const send = useStore((s) => s.send);
  const orderMode = useStore((s) => s.orderMode);
  if (!state || !world || !me) return null;
  const f = state.formations[id];
  if (!f || !formationVisible(state, world, me.country, f)) return null;
  const owner = state.countries[f.owner];
  const mine = me.country === f.owner && owner && playerGoverns(state, owner, me.id);
  const domain = formationDomain(state, f);
  const st = formationStrength(state, f);
  const units = formationUnits(state, f);
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const hasMissiles = units.some((u) => UNIT_BY_ID[u.type].strike);
  const orders: Order['kind'][] = [...(domain === 'land' ? ['move', 'hold'] as Order['kind'][] : domain === 'naval' ? ['move', 'patrol', 'blockade', ...(f.children.length ? ['amphibious' as const] : []), 'hold'] as Order['kind'][] : ['airSuperiority', 'groundSupport', 'strategicBombing', 'move', 'hold'] as Order['kind'][]), ...(hasMissiles ? ['missileStrike' as const] : [])];
  const airRange = domain === 'air' ? Math.min(...units.filter((u) => UNIT_BY_ID[u.type].domain === 'air').map((u) => UNIT_BY_ID[u.type].range ?? 0)) : 0;
  let eta = '';
  if (f.pos.path.length) {
    let d = 0, prev: [number, number] = [f.pos.lon, f.pos.lat];
    for (const p of f.pos.path) { d += haversineKm(prev[0], prev[1], p[0], p[1]); prev = p; }
    const speed = Math.min(...units.map((u) => UNIT_BY_ID[u.type].speed).filter((s) => domain !== 'land' || s < 200));
    eta = `${Math.ceil(d / (f.pos.atSea && domain === 'land' ? 400 : speed))} days`;
  }
  const target = 'target' in f.order ? (f.order as { target: number }).target : null;
  return (
    <div className="inspector panel">
      <button className="close" onClick={() => useStore.setState({ selectedFormation: null, orderMode: null })}>✕</button>
      <div className="preview-head">
        <img src={iconDataUrl(domain === 'naval' ? 'unit_naval' : domain === 'air' ? 'unit_air' : 'unit_land', rgbCss(owner?.color ?? [200, 200, 200]), 34)} alt="" />
        <div className="grow">
          <h3>{f.name}</h3>
          <div className="muted small">{owner?.name} · {f.kind === 'taskforce' ? 'Task Force' : f.kind === 'army' ? 'Army' : 'Regiment'} · {f.pos.atSea ? 'At sea' : world.regions[f.pos.region]?.n}</div>
        </div>
      </div>
      <Meter label="Strength" value={st.strength * 100} right={`${(st.strength * 100).toFixed(0)}%`} />
      <Meter label="Organisation" value={st.org * 100} right={`${(st.org * 100).toFixed(0)}%`} />
      <div className="unit-chips">
        {[...counts].map(([t, n]) => <span key={t} className="chip" title={UNIT_BY_ID[t].desc}>{n}× {UNIT_BY_ID[t].name}</span>)}
        {f.children.length > 0 && <span className="chip">{f.children.length} regiment(s)</span>}
      </div>
      <div className="kv"><span>Orders</span><b>{ORDER_LABEL[f.order.kind]}{target !== null ? ` → ${world.regions[target]?.n}` : ''}</b></div>
      {eta && <div className="kv"><span>ETA</span><span>{eta}</span></div>}
      {domain === 'air' && <div className="kv"><span>Mission radius</span><span>{airRange} km</span></div>}
      <div className="kv"><span>Attack / Defense</span><span className="mono">{st.attack.toFixed(0)} / {st.defense.toFixed(0)}</span></div>
      {f.inCombat && <div className="callout bad">Engaged in combat</div>}
      {f.supplied === false && <div className="callout warn">Out of supply — losing strength and organisation</div>}
      {mine && (
        <>
          <div className="order-buttons">
            {orders.map((k) => (
              <button key={k} className={orderMode?.kind === k ? 'active' : ''} onClick={() => {
                if (k === 'hold') { void send({ type: 'order', formation: f.id, order: { kind: 'hold' } }); return; }
                useStore.setState({ orderMode: { formation: f.id, kind: k } });
              }}>{ORDER_LABEL[k]}</button>
            ))}
          </div>
          {orderMode && <div className="callout">Click a {orderMode.kind === 'patrol' ? 'point at sea' : 'region'} on the map to target · Esc to cancel</div>}
          <div className="seg small">
            {(['defensive', 'balanced', 'aggressive'] as const).map((s) => <button key={s} className={f.stance === s ? 'active' : ''} onClick={() => send({ type: 'stance', formation: f.id, stance: s })}>{s}</button>)}
          </div>
          <div className="muted small">Tip: right-click the map to move this formation.</div>
        </>
      )}
    </div>
  );
}

function RegionInspector({ id }: { id: number }) {
  const { state, me, world, country } = useGame();
  const send = useStore((s) => s.send);
  if (!state || !world || !me) return null;
  const r = state.regions[id];
  const sr = world.regions[id];
  if (!r) return null;
  const owner = state.countries[r.owner];
  const mineCountry = country && r.owner === country.id;
  const governs = mineCountry && playerGoverns(state, country, me.id);
  const cities = (world.citiesByRegion.get(id) ?? []).slice(0, 5);
  const growth = (r.pop / Math.max(1, sr.pop)) * (0.55 + r.prosperity / 110);
  const vote = owner && isDemocracy(owner.gov) ? regionVote(state, world, owner, id) : null;
  const topVote = vote ? Object.entries(vote).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  const party = me.partyId ? state.parties[me.partyId] : null;
  return (
    <div className="inspector panel">
      <button className="close" onClick={() => useStore.setState({ selectedRegion: null })}>✕</button>
      <div className="preview-head">
        <Flag country={owner} iso2={world.countryByA3.get(r.owner)?.iso2} size={34} />
        <div className="grow">
          <h3>{sr.n}</h3>
          <div className="muted small">{owner?.name}{r.controller !== r.owner && <span className="bad"> · occupied by {state.countries[r.controller]?.name}</span>}</div>
        </div>
      </div>
      <div className="preview-grid">
        <div><span className="muted small">Population</span><b>{fmtPop(r.pop)}</b></div>
        <div><span className="muted small">GDP</span><b>{fmtMoney(regionGdp(r))}</b></div>
        <div><span className="muted small">Per capita</span><b>${(r.productivity).toFixed(1)}k</b></div>
        <div><span className="muted small">Terrain</span><b style={{ textTransform: 'capitalize' }}>{sr.terrain}</b></div>
      </div>
      <Meter label="Prosperity" value={r.prosperity} right={r.prosperity.toFixed(0)} />
      <Meter label="Unrest" value={100 - r.unrest} right={r.unrest.toFixed(0)} />
      {r.devastation > 1 && <Meter label="Devastation" value={100 - r.devastation} right={r.devastation.toFixed(0)} />}
      {cities.length > 0 && (
        <div className="cities">
          {cities.map((c) => <span key={c.n} className="chip">{c.cap ? '★ ' : ''}{c.n} · {fmtPop(c.pop * growth)}</span>)}
        </div>
      )}
      {topVote.length > 0 && (
        <div className="local-poll">
          <span className="muted small">Local poll</span>
          <div className="seat-bar thin">{topVote.map(([pid, v]) => <div key={pid} style={{ flex: v, background: rgbCss(state.parties[pid]?.color ?? [99, 99, 99]) }} title={`${state.parties[pid]?.short} ${(v * 100).toFixed(0)}%`} />)}</div>
          <span className="small">{topVote.map(([pid, v]) => `${state.parties[pid]?.short} ${(v * 100).toFixed(0)}%`).join(' · ')}</span>
        </div>
      )}
      <Section title="Infrastructure">
        <div className="building-grid">
          {Object.entries(r.buildings).map(([b, lvl]) => {
            const def = BUILDING_BY_ID[b];
            return <span key={b} className="building-chip" title={def?.desc}><img src={iconDataUrl(def?.icon ?? 'dot', rgbCss(BUILDING_ICON_COLOR[def?.icon ?? ''] ?? [255, 255, 255]), 18)} alt="" />{def?.name} {lvl > 1 ? `×${lvl}` : ''}</span>;
          })}
          {Object.keys(r.buildings).length === 0 && <span className="muted small">No major infrastructure.</span>}
        </div>
        {r.construction.map((j, i) => (
          <div key={i} className="build-row">
            <span className="grow small">Building {BUILDING_BY_ID[j.building]?.name}</span>
            <div className="mini-meter"><div style={{ width: `${(j.progress / j.days) * 100}%` }} /></div>
            <span className="mono small">{Math.max(0, j.days - Math.floor(j.progress))}d</span>
          </div>
        ))}
      </Section>
      {governs && (
        <Section title="Build" collapsible>
          <div className="build-list">
            {BUILDINGS.map((b) => {
              const err = canBuild(state, world, country!.id, id, b.id);
              if (err === 'Requires a coastline' || err === 'Maximum level reached') return null;
              return (
                <button key={b.id} className="build-item" disabled={Boolean(err)} title={err ?? b.desc} onClick={() => send({ type: 'build', region: id, building: b.id })}>
                  <img src={iconDataUrl(b.icon, rgbCss(BUILDING_ICON_COLOR[b.icon] ?? [255, 255, 255]), 22)} alt="" />
                  <span className="grow"><b>{b.name}</b>{(r.buildings[b.id] ?? 0) > 0 && <span className="muted small"> Lv {r.buildings[b.id]}</span>}<br /><span className="muted small">{b.desc}</span></span>
                  <span className="mono small">{fmtMoney(buildingCost(state, country!.id, b.id, id))}<br />{b.days}d</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {mineCountry && party && owner && isDemocracy(owner.gov) && (
        <div className="row-actions wrap">
          <button className="small" onClick={() => send({ type: 'campaign', region: id, kind: 'rally' })}>Rally here · $1M</button>
          <button className="small" onClick={() => send({ type: 'campaign', region: id, kind: 'canvass' })}>Canvass · $2M</button>
        </div>
      )}
      {!mineCountry && owner && country && <ForeignCountry id={owner.id} />}
    </div>
  );
}
