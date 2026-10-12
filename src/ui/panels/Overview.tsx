import { useGame } from '../../store';
import { Meter, Section, Stat, signed, Empty } from '../common';
import { fmtMoney, fmtPop, pct, formatTickDate } from '../../sim/util';
import { GROUPS } from '../../sim/content/groups';
import { countryPop } from '../../sim/economy';
import { isDemocracy, playerGoverns } from '../../sim/politics';
import { warsOf } from '../../sim/diplomacy';
import { GOV_NAMES } from '../labels';

export function Overview() {
  const { state, me, country } = useGame();
  if (!state || !me) return null;
  if (!country) return <Empty>You are not leading a country.</Empty>;
  const governs = playerGoverns(state, country, me.id);
  const deficit = country.revenue - country.expenses;
  const advice: { tone: 'bad' | 'warn' | 'good'; text: string }[] = [];
  if (deficit / country.gdp < -0.05) advice.push({ tone: 'bad', text: `Large budget deficit (${pct(deficit / country.gdp)} of GDP). Raise taxes or cut spending.` });
  if (country.energy < 1) advice.push({ tone: 'bad', text: `Energy shortage (${(country.energy * 100).toFixed(0)}% of demand). Build power plants.` });
  if (country.unemployment > 0.1) advice.push({ tone: 'warn', text: `High unemployment (${pct(country.unemployment)}).` });
  if (country.inflation > 0.08) advice.push({ tone: 'warn', text: `Inflation is running hot (${pct(country.inflation)}).` });
  if (country.stability < 40) advice.push({ tone: 'bad', text: 'Stability is low — protests and coups become likely.' });
  const angry = GROUPS.filter((g) => country.groups[g.id].approval < 30 && country.groups[g.id].size > 0.06);
  if (angry.length) advice.push({ tone: 'warn', text: `${angry.map((g) => g.name).join(', ')} strongly disapprove of the government.` });
  if (!advice.length) advice.push({ tone: 'good', text: 'No urgent problems. Consider investing in infrastructure and research.' });
  const wars = warsOf(state, country.id);
  const parts = Object.entries(country.growthParts ?? {}).filter(([, v]) => Math.abs(v) >= 0.0005).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel-content">
      <h2>{country.name}</h2>
      <div className="muted">{GOV_NAMES[country.gov]} · {country.leaderTitle} of {state.parties[country.rulingParty]?.name}</div>
      {!governs && <div className="callout bad">Your party is in opposition. Campaign in regions and build support to win the next election. You can still propose bills.</div>}
      <div className="stat-grid">
        <Stat label="Population" value={fmtPop(countryPop(state, country.id))} />
        <Stat label="GDP" value={fmtMoney(country.gdp)} sub={`${signed(country.gdpGrowth * 100, 2, '%')} / yr`} tone={country.gdpGrowth > 0.01 ? 'good' : country.gdpGrowth < 0 ? 'bad' : 'warn'} />
        <Stat label="Unemployment" value={pct(country.unemployment)} tone={country.unemployment > 0.09 ? 'bad' : 'neutral'} />
        <Stat label="Inflation" value={pct(country.inflation)} tone={country.inflation > 0.06 ? 'bad' : 'neutral'} />
        <Stat label="Budget" value={fmtMoney(deficit)} sub={`${pct(deficit / country.gdp)} of GDP`} tone={deficit >= 0 ? 'good' : 'bad'} />
        <Stat label="Credit" value={country.creditRating} sub={`rate ${pct(country.interestRate)}`} />
        <Stat label="Health" value={country.health.toFixed(0)} />
        <Stat label="Education" value={country.education.toFixed(0)} />
        <Stat label="Crime" value={country.crime.toFixed(0)} tone={country.crime > 50 ? 'bad' : 'neutral'} />
        <Stat label="Freedom" value={country.freedom.toFixed(0)} />
        <Stat label="Corruption" value={country.corruption.toFixed(0)} tone={country.corruption > 50 ? 'bad' : 'neutral'} />
        <Stat label="Pollution" value={country.pollution.toFixed(0)} tone={country.pollution > 60 ? 'bad' : 'neutral'} />
      </div>
      <Section title="Briefing">
        {advice.map((a, i) => <div key={i} className={`callout ${a.tone}`}>{a.text}</div>)}
        {wars.map((w) => <div key={w.id} className="callout bad">At war: {w.name} (war score {signed(w.attackers.includes(country.id) ? w.score : -w.score, 0)})</div>)}
        {isDemocracy(country.gov) && country.nextElection >= 0 && <div className="callout">Next election: {formatTickDate(state, country.nextElection)}</div>}
      </Section>
      <Section title="Public approval" right={<b>{country.approval.toFixed(0)}%</b>}>
        {GROUPS.map((g) => (
          <Meter key={g.id} label={<span title={g.desc}>{g.icon} {g.name} <span className="muted small">{(country.groups[g.id].size * 100).toFixed(0)}%</span></span>} value={country.groups[g.id].approval} right={country.groups[g.id].approval.toFixed(0)} />
        ))}
        <Meter label="Stability" value={country.stability} right={country.stability.toFixed(0)} />
        <Meter label="Legitimacy" value={country.legitimacy} right={country.legitimacy.toFixed(0)} />
        <Meter label="War support" value={country.warSupport} right={country.warSupport.toFixed(0)} />
      </Section>
      <Section title="Why is the economy growing?" collapsible>
        {parts.map(([k, v]) => (
          <div key={k} className="kv"><span>{k}</span><span className={v >= 0 ? 'good' : 'bad'}>{signed(v * 100, 2, '%')}</span></div>
        ))}
      </Section>
      {country.modifiers.length > 0 && (
        <Section title="Active effects">
          {country.modifiers.filter((m) => !m.id.startsWith('envoy_')).map((m, i) => (
            <div key={i} className="kv"><span>{m.label}</span><span className="muted small">until {formatTickDate(state, m.until)}</span></div>
          ))}
        </Section>
      )}
    </div>
  );
}
