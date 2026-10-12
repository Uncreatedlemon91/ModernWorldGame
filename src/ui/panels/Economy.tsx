import { useGame, useStore } from '../../store';
import { Empty, Meter, Section, Slider, Stat } from '../common';
import { budgetLabel, budgetTotal, lawEffects, ownedRegions, regionGdp } from '../../sim/economy';
import { fmtMoney, pct } from '../../sim/util';
import { playerGoverns } from '../../sim/politics';
import { BUILDING_BY_ID } from '../../sim/content/buildings';
import type { BudgetKey, TaxKey, TechField } from '../../sim/types';

const BUDGET_KEYS: BudgetKey[] = ['military', 'health', 'education', 'welfare', 'infrastructure', 'research', 'police', 'admin'];
const BUDGET_HINT: Record<BudgetKey, string> = {
  military: 'Funds upkeep, readiness and new units. Pleases the security establishment and nationalists.',
  health: 'Raises public health. Retirees care most.',
  education: 'Raises education and long-run growth. Youth care most.',
  welfare: 'Pensions and benefits. Workers and retirees care most.',
  infrastructure: 'Boosts GDP growth and business approval.',
  research: 'Speeds up technology. Greens and business like it.',
  police: 'Reduces crime and unrest.',
  admin: 'Reduces corruption.',
};
const TAX_KEYS: TaxKey[] = ['income', 'corporate', 'sales', 'tariffs'];
const TAX_LABEL: Record<TaxKey, string> = { income: 'Income tax', corporate: 'Corporate tax', sales: 'Sales / VAT', tariffs: 'Import tariffs' };
const TECH: { id: TechField; label: string; desc: string }[] = [
  { id: 'economy', label: 'Economy', desc: '+0.2% growth per level' },
  { id: 'military', label: 'Military', desc: '+8% combat power per level, unlocks units' },
  { id: 'society', label: 'Society', desc: 'Health, education and stability' },
];

export function Economy() {
  const { state, me, country, world } = useGame();
  const send = useStore((s) => s.send);
  if (!state || !me || !world) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const governs = playerGoverns(state, country, me.id);
  const deficit = country.revenue - country.expenses;
  const interest = country.debt * country.interestRate;
  const lawCost = (country.gdp * lawEffects(country).cost * 0.3) / 100;
  const regions = ownedRegions(state, country.id);
  const constructions = regions.flatMap((r) => r.construction.map((j, i) => ({ r, j, i })));
  const rate = (country as typeof country & { researchRate?: number }).researchRate ?? 0;
  const topRegions = [...regions].sort((a, b) => regionGdp(b) - regionGdp(a)).slice(0, 6);

  return (
    <div className="panel-content">
      <h2>Economy & Budget</h2>
      <div className="stat-grid">
        <Stat label="Revenue" value={fmtMoney(country.revenue)} sub={pct(country.revenue / country.gdp)} />
        <Stat label="Spending" value={fmtMoney(country.expenses)} sub={pct(country.expenses / country.gdp)} />
        <Stat label="Balance" value={fmtMoney(deficit)} sub={pct(deficit / country.gdp)} tone={deficit >= 0 ? 'good' : 'bad'} />
        <Stat label="Debt" value={fmtMoney(country.debt)} sub={`${pct(country.debt / country.gdp, 0)} of GDP`} tone={country.debt / country.gdp > 1 ? 'bad' : 'neutral'} />
        <Stat label="Interest" value={fmtMoney(interest)} sub={pct(country.interestRate)} />
        <Stat label="Energy" value={`${(country.energy * 100).toFixed(0)}%`} sub="supply/demand" tone={country.energy < 1 ? 'bad' : 'good'} />
      </div>
      {!governs && <div className="callout bad">Only the governing party controls the budget.</div>}

      <Section title="Taxes" right={<span className="small">Tax take {pct(country.revenue / country.gdp)}</span>}>
        {TAX_KEYS.map((k) => (
          <div key={k} className="budget-row">
            <span>{TAX_LABEL[k]}</span>
            <Slider value={country.taxes[k]} min={0} max={k === 'tariffs' ? 40 : 60} step={0.5} disabled={!governs} format={(v) => `${v.toFixed(1)}%`}
              onCommit={(v) => send({ type: 'setTax', key: k, value: v })} />
          </div>
        ))}
      </Section>

      <Section title="Spending (% of GDP)" right={<span className="small">Total {budgetTotal(country).toFixed(1)}%</span>}>
        {BUDGET_KEYS.map((k) => (
          <div key={k} className="budget-row" title={BUDGET_HINT[k]}>
            <span>{budgetLabel(k)}</span>
            <Slider value={country.budget[k]} min={0} max={k === 'military' ? 15 : 12} step={0.1} disabled={!governs} format={(v) => `${v.toFixed(1)}% · ${fmtMoney((country.gdp * v) / 100)}`}
              onCommit={(v) => send({ type: 'setBudget', key: k, value: v })} />
          </div>
        ))}
        <div className="kv"><span>Programme costs from laws</span><span>{fmtMoney(lawCost)}</span></div>
        <div className="kv"><span>Debt interest</span><span>{fmtMoney(interest)}</span></div>
        <div className="kv"><span>Military procurement fund</span><span>{fmtMoney(country.milFund)}</span></div>
      </Section>

      <Section title="Research" right={<span className="small">{rate.toFixed(0)} pts/yr</span>}>
        {TECH.map((t) => {
          const lvl = Math.floor(country.tech[t.id]);
          return (
            <div key={t.id} className={`tech-row ${country.researchFocus === t.id ? 'focus' : ''}`}>
              <button className="small" disabled={!governs} onClick={() => send({ type: 'researchFocus', field: t.id })}>{country.researchFocus === t.id ? '★ Focus' : 'Focus'}</button>
              <div className="grow">
                <Meter label={<span>{t.label} <b>Lv {lvl}</b> <span className="muted small">{t.desc}</span></span>} value={(country.tech[t.id] - lvl) * 100} color="var(--accent)" />
              </div>
            </div>
          );
        })}
      </Section>

      <Section title={`Construction (${constructions.length})`}>
        {constructions.length === 0 && <div className="muted small">Nothing under construction. Select one of your regions on the map to build.</div>}
        {constructions.map(({ r, j, i }) => (
          <div key={`${r.id}-${i}`} className="build-row">
            <span className="grow">{BUILDING_BY_ID[j.building]?.name} <span className="muted small">in {world.regions[r.id].n}</span></span>
            <div className="mini-meter"><div style={{ width: `${(j.progress / j.days) * 100}%` }} /></div>
            <span className="mono small">{Math.max(0, j.days - Math.floor(j.progress))}d</span>
            {governs && <button className="small ghost" onClick={() => send({ type: 'cancelBuild', region: r.id, index: i })}>✕</button>}
          </div>
        ))}
      </Section>

      <Section title="Largest regional economies" collapsible>
        {topRegions.map((r) => (
          <div key={r.id} className="kv clickable" onClick={() => { useStore.setState({ selectedRegion: r.id, selectedCountry: r.owner }); useStore.getState().fly(world.regions[r.id].lon, world.regions[r.id].lat, 4.5); }}>
            <span>{world.regions[r.id].n}</span><span className="mono">{fmtMoney(regionGdp(r))}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}
