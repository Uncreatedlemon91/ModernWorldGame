import { useState } from 'react';
import { useGame, useStore } from '../../store';
import { Empty, Tabs } from '../common';
import { LAWS, LAW_CATEGORIES, type LawDef, type LawOption } from '../../sim/content/laws';
import { GROUP_BY_ID } from '../../sim/content/groups';
import { billVotes, canDecree, playerGoverns, isDemocracy } from '../../sim/politics';
import { publicSupport } from '../../sim/cabinet';
import type { GroupId } from '../../sim/types';

const EFFECT_LABEL: Record<string, [string, number]> = {
  growth: ['GDP growth', 100], stability: ['Stability', 1], freedom: ['Freedom', 1], corruption: ['Corruption', 1], crime: ['Crime', 1],
  health: ['Health', 1], education: ['Education', 1], pollution: ['Pollution', 1], trade: ['Trade', 100], manpower: ['Manpower', 100],
  unrest: ['Unrest', 1], revenue: ['Tax revenue', 100], cost: ['Spending (% GDP)', 1], research: ['Research', 100], legitimacy: ['Legitimacy', 1],
  energy: ['Energy', 100], unemployment: ['Unemployment', 100], popGrowth: ['Pop. growth', 100],
};
const BAD_UP = new Set(['corruption', 'crime', 'pollution', 'unrest', 'cost', 'unemployment']);

function Effects({ opt }: { opt: LawOption }) {
  const fx = Object.entries(opt.effects).filter(([, v]) => v);
  const groups = Object.entries(opt.groups) as [GroupId, number][];
  return (
    <div className="effects">
      {fx.map(([k, v]) => {
        const [label, mul] = EFFECT_LABEL[k] ?? [k, 1];
        const good = BAD_UP.has(k) ? v! < 0 : v! > 0;
        return <span key={k} className={good ? 'good' : 'bad'}>{label} {v! > 0 ? '+' : ''}{(v! * mul).toFixed(mul === 100 ? 1 : 0)}{mul === 100 ? '%' : ''}</span>;
      })}
      {groups.map(([g, v]) => <span key={g} className={v > 0 ? 'good' : 'bad'}>{GROUP_BY_ID[g].icon} {v > 0 ? '+' : ''}{v}</span>)}
    </div>
  );
}

export function Laws() {
  const { state, me, country } = useGame();
  const send = useStore((s) => s.send);
  const [cat, setCat] = useState<LawDef['category']>('economy');
  const [hover, setHover] = useState<{ law: string; opt: string } | null>(null);
  if (!state || !me) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const governs = playerGoverns(state, country, me.id);
  const decree = governs && canDecree(country);
  const party = me.partyId ? state.parties[me.partyId] : null;
  const referendum = Object.values(state.referendums ?? {}).find((r) => r.country === country.id);

  return (
    <div className="panel-content">
      <h2>Laws</h2>
      <div className="muted small">{decree ? 'You rule by decree: changes take effect immediately.' : 'Changes are introduced as bills and voted on by the legislature after 21 days. Projected votes are shown on hover.'}</div>
      <Tabs tabs={LAW_CATEGORIES.map((c) => ({ id: c.id, label: c.name }))} value={cat} onChange={setCat} />
      {LAWS.filter((l) => l.category === cat).map((law) => {
        const current = country.laws[law.id];
        const pending = Object.values(state.bills).find((b) => b.country === country.id && b.law === law.id);
        return (
          <div key={law.id} className="law">
            <div className="law-head row">
              <b className="grow">{law.name}</b>
              {pending && <span className="tag warn">bill pending</span>}
              {referendum?.law === law.id && <span className="tag warn">referendum</span>}
              {governs && isDemocracy(country.gov) && !referendum && (
                <select className="small-select" value="" title="Put this question to the people. Bypasses the legislature; costs money; failure hurts approval." onChange={(e) => e.target.value && send({ type: 'referendum', law: law.id, option: e.target.value })}>
                  <option value="">Referendum…</option>
                  {law.options.filter((o) => o.id !== current).map((o) => <option key={o.id} value={o.id}>{o.name} ({(publicSupport(state, country, law.id, o.id) * 100).toFixed(0)}% support)</option>)}
                </select>
              )}
            </div>
            <div className="law-options">
              {law.options.map((o) => {
                const active = current === o.id;
                let projection = '';
                if (hover?.law === law.id && hover.opt === o.id && !active && !decree && party) {
                  const v = billVotes(state, country, { id: 'preview', country: country.id, law: law.id, option: o.id, sponsor: party.id, introduced: state.tick, voteOn: state.tick });
                  projection = `${v.yes}–${v.no} ${v.yes > v.no ? '✓ likely passes' : '✗ likely fails'}`;
                }
                return (
                  <button key={o.id} className={`law-opt ${active ? 'active' : ''} ${pending?.option === o.id ? 'pending' : ''}`}
                    disabled={active || Boolean(pending)} onMouseEnter={() => setHover({ law: law.id, opt: o.id })} onMouseLeave={() => setHover(null)}
                    onClick={() => send({ type: 'proposeLaw', law: law.id, option: o.id })}>
                    <span className="opt-name">{o.name}</span>
                    <span className="opt-desc">{o.desc}</span>
                    <Effects opt={o} />
                    {projection && <span className={`projection ${projection.includes('✓') ? 'good' : 'bad'}`}>{projection}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
