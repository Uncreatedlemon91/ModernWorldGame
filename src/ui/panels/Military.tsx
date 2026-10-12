import { useMemo, useState } from 'react';
import { useGame, useStore } from '../../store';
import { Empty, Flag, Meter, Section, Tabs, signed } from '../common';
import type { Formation, FormationKind, Unit } from '../../sim/types';
import { UNITS, UNIT_BY_ID } from '../../sim/content/units';
import { formationDomain, formationStrength, formationUnits, productionCapacity, unitCost, canAssignUnit, canAssignFormation } from '../../sim/military';
import { fmtMoney, formatTickDate, fmtPop } from '../../sim/util';
import { playerGoverns } from '../../sim/politics';
import { warsOf, warSide } from '../../sim/diplomacy';
import { iconDataUrl } from '../../map/icons';

type Tab = 'forces' | 'production' | 'wars';

export function Military() {
  const { state, me, country } = useGame();
  const [tab, setTab] = useState<Tab>('forces');
  if (!state || !me) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const governs = playerGoverns(state, country, me.id);
  return (
    <div className="panel-content">
      <h2>Armed Forces</h2>
      <div className="row small muted">
        <span>Manpower {fmtPop(country.manpower)}</span> · <span>Procurement {fmtMoney(country.milFund)}</span> · <span>Readiness {(country.militaryReadiness * 100).toFixed(0)}%</span> · <span>Tech Lv {Math.floor(country.tech.military)}</span>
        {country.nukes > 0 && <> · <span>☢ {country.nukes}</span></>}
      </div>
      {!governs && <div className="callout bad">Only the governing party commands the armed forces.</div>}
      <Tabs tabs={[{ id: 'forces', label: 'Forces' }, { id: 'production', label: 'Production' }, { id: 'wars', label: `Wars (${warsOf(state, country.id).length})` }]} value={tab} onChange={setTab} />
      {tab === 'forces' && <Forces />}
      {tab === 'production' && <Production />}
      {tab === 'wars' && <Wars />}
    </div>
  );
}

const domainIcon = (d: string) => (d === 'naval' ? 'unit_naval' : d === 'air' ? 'unit_air' : 'unit_land');
const KIND_LABEL: Record<FormationKind, string> = { regiment: 'Regiment', army: 'Army', taskforce: 'Task Force' };

function UnitRow({ u, onDetach }: { u: Unit; onDetach?: () => void }) {
  const def = UNIT_BY_ID[u.type];
  return (
    <div className="unit-row">
      <img src={iconDataUrl(def.domain === 'naval' ? 'warship' : def.domain === 'air' ? 'plane' : def.id === 'armor' ? 'unit_armor' : 'unit_land', '#cfe3ff', 18)} alt="" />
      <span className="grow">{u.name} <span className="muted small">{def.echelon}</span></span>
      <div className="mini-meter" title={`Strength ${(u.strength * 100).toFixed(0)}%`}><div style={{ width: `${u.strength * 100}%` }} /></div>
      <div className="mini-meter org" title={`Organisation ${(u.org * 100).toFixed(0)}%`}><div style={{ width: `${u.org * 100}%` }} /></div>
      {onDetach && <button className="small ghost" title="Detach to reserve" onClick={onDetach}>⤴</button>}
    </div>
  );
}

function FormationCard({ f, depth = 0 }: { f: Formation; depth?: number }) {
  const { state } = useGame();
  const send = useStore((s) => s.send);
  const selected = useStore((s) => s.selectedFormation);
  const world = useStore((s) => s.world)!;
  const [open, setOpen] = useState(depth > 0 ? false : selected === f.id);
  if (!state) return null;
  const st = formationStrength(state, f);
  const domain = formationDomain(state, f);
  const where = f.pos.atSea ? 'At sea' : world.regions[f.pos.region]?.n;
  const select = () => {
    useStore.setState({ selectedFormation: f.parent ? f.parent : f.id });
    if (!f.parent) useStore.getState().fly(f.pos.lon, f.pos.lat);
    setOpen(!open);
  };
  return (
    <div className={`formation depth${depth} ${selected === f.id ? 'sel' : ''}`}>
      <div className="formation-head" onClick={select}>
        <img src={iconDataUrl(domainIcon(domain), '#fff', 22)} alt="" />
        <div className="grow">
          <b>{f.name}</b> <span className="muted small">{KIND_LABEL[f.kind]} · {st.count} units · {where}</span>
          <div className="row small">
            <Meter value={st.strength * 100} right={`${(st.strength * 100).toFixed(0)}%`} />
          </div>
        </div>
        {f.inCombat && <span className="tag bad">combat</span>}
        {f.order.kind !== 'hold' && <span className="tag">{f.order.kind}</span>}
        <span className="chev">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="formation-body">
          {f.children.map((cid) => state.formations[cid]).filter(Boolean).map((c) => (
            <div key={c.id} className="child">
              <FormationCard f={c} depth={depth + 1} />
              <button className="small ghost detach" onClick={() => send({ type: 'detachFormation', formation: c.id })} title="Detach">⤴</button>
            </div>
          ))}
          {f.units.map((id) => state.units[id]).filter(Boolean).map((u) => <UnitRow key={u.id} u={u} onDetach={() => send({ type: 'detachUnit', unit: u.id })} />)}
          {!f.parent && (
            <div className="row-actions">
              <input className="small-input" defaultValue={f.name} onBlur={(e) => e.target.value !== f.name && send({ type: 'renameFormation', formation: f.id, name: e.target.value })} />
              <button className="small ghost" onClick={() => send({ type: 'disbandFormation', formation: f.id })}>Disband</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Forces() {
  const { state, country } = useGame();
  const send = useStore((s) => s.send);
  const world = useStore((s) => s.world)!;
  const selectedRegion = useStore((s) => s.selectedRegion);
  const [kind, setKind] = useState<FormationKind>('regiment');
  const [name, setName] = useState('');
  const mine = useMemo(() => (state && country ? Object.values(state.formations).filter((f) => f.owner === country.id) : []), [state, country, state?.tick]); // eslint-disable-line
  if (!state || !country) return null;
  const tops = mine.filter((f) => !f.parent);
  const reserves = Object.values(state.units).filter((u) => u.owner === country.id && !u.parent);
  const regionForNew = selectedRegion !== null && state.regions[selectedRegion]?.controller === country.id ? selectedRegion : country.capital;
  const groups: { label: string; list: Formation[] }[] = [
    { label: 'Armies & land forces', list: tops.filter((f) => formationDomain(state, f) === 'land') },
    { label: 'Naval task forces', list: tops.filter((f) => formationDomain(state, f) === 'naval') },
    { label: 'Air groups', list: tops.filter((f) => formationDomain(state, f) === 'air') },
  ];
  return (
    <>
      <Section title="Raise a formation" collapsible>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as FormationKind)}>
            <option value="regiment">Regiment (battalions)</option>
            <option value="army">Army (regiments + squadrons)</option>
            <option value="taskforce">Task Force (flotillas, squadrons, regiments)</option>
          </select>
          <input className="grow" placeholder={`New ${KIND_LABEL[kind]}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row small muted">Based in {world.regions[regionForNew].n} (select one of your regions to change)</div>
        <button className="primary small" onClick={() => { void send({ type: 'createFormation', kind, name: name || `New ${KIND_LABEL[kind]}`, region: regionForNew }); setName(''); }}>Create</button>
      </Section>
      <Section title={`Reserves (${reserves.length})`} collapsible>
        {reserves.length === 0 && <div className="muted small">All units are assigned. Build more in Production.</div>}
        {reserves.map((u) => {
          const options = mine.filter((f) => !canAssignUnit(state, u, f));
          return (
            <div key={u.id} className="reserve-row">
              <UnitRow u={u} />
              <span className="muted small">{world.regions[u.home]?.n}</span>
              <select value="" onChange={(e) => e.target.value && send({ type: 'assignUnit', unit: u.id, formation: e.target.value })}>
                <option value="">Assign to…</option>
                {options.map((f) => <option key={f.id} value={f.id}>{f.name} ({KIND_LABEL[f.kind]})</option>)}
              </select>
              <button className="small ghost" title="Disband unit" onClick={() => send({ type: 'disbandUnit', unit: u.id })}>✕</button>
            </div>
          );
        })}
      </Section>
      {mine.filter((f) => f.kind === 'regiment' && !f.parent).length > 0 && (
        <Section title="Attach regiments" collapsible>
          {mine.filter((f) => f.kind === 'regiment' && !f.parent).map((r) => {
            const parents = mine.filter((p) => p.id !== r.id && !canAssignFormation(state, r, p));
            return (
              <div key={r.id} className="reserve-row">
                <span className="grow">{r.name} <span className="muted small">{formationUnits(state, r).length} bn</span></span>
                <select value="" onChange={(e) => e.target.value && send({ type: 'assignFormation', child: r.id, parent: e.target.value })}>
                  <option value="">Attach to…</option>
                  {parents.map((p) => <option key={p.id} value={p.id}>{p.name} ({KIND_LABEL[p.kind]})</option>)}
                </select>
              </div>
            );
          })}
        </Section>
      )}
      {groups.map((g) => g.list.length > 0 && (
        <Section key={g.label} title={`${g.label} (${g.list.length})`}>
          {g.list.map((f) => <FormationCard key={f.id} f={f} />)}
        </Section>
      ))}
    </>
  );
}

function Production() {
  const { state, country } = useGame();
  const send = useStore((s) => s.send);
  const world = useStore((s) => s.world)!;
  const [region, setRegion] = useState<number | null>(null);
  if (!state || !country) return null;
  const bases = state.regions.filter((r) => r.owner === country.id && r.controller === country.id && (r.buildings.military_base || r.buildings.air_base || r.buildings.naval_base));
  const sel = region ?? bases[0]?.id ?? null;
  const techLvl = Math.floor(country.tech.military);
  return (
    <>
      <Section title={`Queue (${country.production.length})`}>
        {country.production.length === 0 && <div className="muted small">No units in production.</div>}
        {country.production.map((p) => (
          <div key={p.id} className="build-row">
            <span className="grow">{p.name} <span className="muted small">{world.regions[p.region].n}</span></span>
            <div className="mini-meter"><div style={{ width: `${(p.progress / p.days) * 100}%` }} /></div>
            <span className="mono small">{Math.max(0, Math.ceil(p.days - p.progress))}d</span>
            <button className="small ghost" onClick={() => send({ type: 'cancelProduction', id: p.id })}>✕</button>
          </div>
        ))}
      </Section>
      <Section title="Recruit & build">
        {bases.length === 0 ? <div className="muted small">Build an Army Base, Air Base or Naval Base in one of your regions first.</div> : (
          <>
            <select value={sel ?? ''} onChange={(e) => setRegion(Number(e.target.value))}>
              {bases.map((r) => <option key={r.id} value={r.id}>{world.regions[r.id].n} — {[r.buildings.military_base && `Army ${r.buildings.military_base}`, r.buildings.air_base && `Air ${r.buildings.air_base}`, r.buildings.naval_base && `Naval ${r.buildings.naval_base}`].filter(Boolean).join(', ')}</option>)}
            </select>
            {sel !== null && (['land', 'air', 'naval'] as const).map((domain) => {
              const cap = productionCapacity(state, country.id, domain, sel);
              if (!cap) return null;
              const used = country.production.filter((p) => p.region === sel && UNIT_BY_ID[p.unitType].domain === domain).length;
              return (
                <div key={domain} className="prod-group">
                  <div className="muted small">{domain === 'land' ? 'Battalions' : domain === 'air' ? 'Squadrons' : 'Flotillas'} · lines {used}/{cap}</div>
                  {UNITS.filter((u) => u.domain === domain).map((u) => {
                    const locked = u.techReq > techLvl;
                    return (
                      <button key={u.id} className="prod-item" disabled={locked || used >= cap} onClick={() => send({ type: 'queueUnit', unitType: u.id, region: sel })} title={u.desc}>
                        <span className="grow"><b>{u.name}</b> {locked && <span className="tag">Tech {u.techReq}</span>}<br /><span className="muted small">ATK {u.attack} · DEF {u.defense} · AIR {u.air} · SEA {u.naval}</span></span>
                        <span className="mono small">{fmtMoney(unitCost(state, country.id, u.id))}<br />{u.days}d · {fmtPop(u.manpower)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </Section>
    </>
  );
}

function Wars() {
  const { state, country } = useGame();
  const send = useStore((s) => s.send);
  const world = useStore((s) => s.world)!;
  if (!state || !country) return null;
  const wars = warsOf(state, country.id);
  if (!wars.length) return <div className="muted">At peace. Declare war from the Diplomacy panel.</div>;
  return (
    <>
      {wars.map((w) => {
        const side = warSide(w, country.id)!;
        const myScore = side === 'attackers' ? w.score : -w.score;
        const enemies = side === 'attackers' ? w.defenders : w.attackers;
        const allies = side === 'attackers' ? w.attackers : w.defenders;
        const occupiedByMe = state.regions.filter((r) => enemies.includes(r.owner) && allies.includes(r.controller)).map((r) => r.id);
        const occupiedByThem = state.regions.filter((r) => allies.includes(r.owner) && enemies.includes(r.controller)).map((r) => r.id);
        const cas = (ids: string[]) => ids.reduce((s, c) => s + (w.casualties[c] ?? 0), 0);
        const leader = enemies[0];
        return (
          <Section key={w.id} title={w.name} right={<span className={myScore >= 0 ? 'good' : 'bad'}>{signed(myScore, 0)}</span>}>
            <div className="war-sides">
              <div>{allies.map((c) => <Flag key={c} country={state.countries[c]} iso2={world.countryByA3.get(c)?.iso2} />)}</div>
              <span className="muted">vs</span>
              <div>{enemies.map((c) => <Flag key={c} country={state.countries[c]} iso2={world.countryByA3.get(c)?.iso2} />)}</div>
            </div>
            <div className="score-bar"><div style={{ width: `${50 + myScore / 2}%` }} /></div>
            <div className="kv"><span>Started</span><span>{formatTickDate(state, w.start)}</span></div>
            <div className="kv"><span>Regions occupied</span><span>{occupiedByMe.length} taken · {occupiedByThem.length} lost</span></div>
            <div className="kv"><span>Casualties</span><span>{fmtPop(cas(allies))} ours · {fmtPop(cas(enemies))} theirs</span></div>
            <div className="kv"><span>Active battles</span><span>{w.battles.length}</span></div>
            {allies[0] === country.id && (
              <div className="row-actions wrap">
                <button className="small" onClick={() => send({ type: 'propose', to: leader, kind: { type: 'peace', war: w.id, cede: [], reparations: 0 } })}>Offer white peace</button>
                <button className="small" onClick={() => send({ type: 'propose', to: leader, kind: { type: 'peace', war: w.id, cede: occupiedByMe, reparations: 0 } })}>Demand occupied land ({occupiedByMe.length})</button>
                <button className="small" onClick={() => send({ type: 'propose', to: leader, kind: { type: 'peace', war: w.id, cede: [...occupiedByMe, ...occupiedByThem], reparations: 0 } })}>Status quo</button>
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}
