import type { GroupId, Ideology } from '../types';

// Effects are steady-state modifiers applied while the option is active.
export interface LawEffects {
  growth?: number; // added to annual GDP growth (fraction)
  stability?: number;
  freedom?: number;
  corruption?: number;
  crime?: number;
  health?: number;
  education?: number;
  pollution?: number;
  trade?: number; // trade openness delta
  manpower?: number; // fraction of population available as recruits
  unrest?: number;
  revenue?: number; // multiplier delta on tax revenue
  cost?: number; // % of GDP of extra spending
  research?: number; // research multiplier delta
  legitimacy?: number;
  energy?: number;
  unemployment?: number;
  popGrowth?: number; // annual
}

export interface LawOption {
  id: string;
  name: string;
  desc: string;
  ideology: Ideology;
  effects: LawEffects;
  groups: Partial<Record<GroupId, number>>; // approval delta
}

export interface LawDef {
  id: string;
  name: string;
  category: 'economy' | 'society' | 'security' | 'government' | 'environment';
  options: LawOption[];
  autocracyOnly?: boolean;
}

const o = (id: string, name: string, desc: string, ideology: Ideology, effects: LawEffects, groups: LawOption['groups']): LawOption =>
  ({ id, name, desc, ideology, effects, groups });

export const LAWS: LawDef[] = [
  // ---------------- Economy ----------------
  { id: 'healthcare', name: 'Healthcare System', category: 'economy', options: [
    o('private', 'Private Insurance', 'Healthcare is market-driven.', { econ: 0.8, social: 0 }, { health: -8, cost: 0, growth: 0.002 }, { business: 6, workers: -6, retirees: -6, liberals: -2 }),
    o('mixed', 'Mixed System', 'Public safety net with private options.', { econ: 0.1, social: 0 }, { health: 0, cost: 1.5 }, {}),
    o('universal', 'Universal Healthcare', 'Single-payer care free at point of use.', { econ: -0.7, social: -0.2 }, { health: 10, cost: 4, growth: -0.002 }, { workers: 8, retirees: 8, youth: 4, business: -6 }),
  ] },
  { id: 'minimum_wage', name: 'Minimum Wage', category: 'economy', options: [
    o('none', 'None', 'Wages set entirely by the market.', { econ: 0.9, social: 0 }, { unemployment: -0.01, growth: 0.002, crime: 3 }, { business: 6, workers: -10 }),
    o('low', 'Low', 'A modest wage floor.', { econ: 0.2, social: 0 }, {}, {}),
    o('high', 'High', 'A living wage mandated by law.', { econ: -0.7, social: 0 }, { unemployment: 0.012, growth: -0.002, crime: -2 }, { workers: 10, youth: 4, business: -8 }),
  ] },
  { id: 'labor_rights', name: 'Labor Rights', category: 'economy', options: [
    o('weak', 'At-Will Employment', 'Few protections, unions restricted.', { econ: 0.8, social: 0.2 }, { growth: 0.002, unrest: 3 }, { business: 6, workers: -10 }),
    o('standard', 'Standard Protections', 'Unions legal, basic protections.', { econ: 0, social: 0 }, {}, {}),
    o('strong', 'Strong Unions', 'Collective bargaining, strong job security.', { econ: -0.8, social: -0.1 }, { growth: -0.003, unemployment: 0.005, unrest: -2 }, { workers: 12, business: -10 }),
  ] },
  { id: 'trade_policy', name: 'Trade Policy', category: 'economy', options: [
    o('free_trade', 'Free Trade', 'Minimal barriers. More trade and shipping.', { econ: 0.7, social: -0.3 }, { trade: 0.25, growth: 0.004 }, { business: 8, farmers: -6, workers: -4, nationalists: -6 }),
    o('balanced', 'Balanced', 'Selective tariffs.', { econ: 0, social: 0 }, {}, {}),
    o('protectionism', 'Protectionism', 'High tariffs shield domestic industry.', { econ: -0.2, social: 0.6 }, { trade: -0.3, growth: -0.004, unemployment: -0.005 }, { workers: 4, farmers: 8, nationalists: 8, business: -8 }),
  ] },
  { id: 'pensions', name: 'Pensions', category: 'economy', options: [
    o('private', 'Private Savings', 'Retirement is a personal responsibility.', { econ: 0.8, social: 0 }, { cost: 0 }, { business: 4, retirees: -12 }),
    o('state_basic', 'Basic State Pension', 'A modest universal pension.', { econ: 0, social: 0 }, { cost: 1.5 }, {}),
    o('generous', 'Generous Pensions', 'Comfortable retirement funded by the state.', { econ: -0.6, social: 0.1 }, { cost: 3.5 }, { retirees: 14, youth: -4, business: -4 }),
  ] },
  { id: 'central_bank', name: 'Central Bank', category: 'economy', options: [
    o('independent', 'Independent', 'Inflation targeting by technocrats.', { econ: 0.3, social: 0 }, { growth: 0.001, corruption: -3 }, { business: 4 }),
    o('political', 'Political Control', 'Government directs monetary policy.', { econ: -0.3, social: 0.3 }, { growth: 0.003, corruption: 5 }, { business: -6 }),
  ] },
  { id: 'industry', name: 'Industrial Policy', category: 'economy', options: [
    o('laissez_faire', 'Laissez-faire', 'Government stays out of industry.', { econ: 0.9, social: 0 }, { growth: 0.002, corruption: -2 }, { business: 6, workers: -4 }),
    o('subsidies', 'Strategic Subsidies', 'Targeted support for key sectors.', { econ: 0, social: 0.1 }, { cost: 0.7, growth: 0.003 }, { farmers: 4, workers: 2 }),
    o('state_owned', 'State-Owned Enterprises', 'Government owns major industries.', { econ: -0.9, social: 0.2 }, { growth: -0.006, corruption: 8, unemployment: -0.02, revenue: 0.08 }, { workers: 6, business: -14 }),
  ] },
  // ---------------- Society ----------------
  { id: 'education_system', name: 'Education', category: 'society', options: [
    o('private', 'Mostly Private', 'Tuition-based schools and universities.', { econ: 0.7, social: 0.2 }, { education: -6 }, { business: 2, youth: -8 }),
    o('public', 'Public Schools', 'Free schools, paid university.', { econ: 0, social: 0 }, { cost: 1 }, {}),
    o('free_university', 'Free University', 'Education free through university.', { econ: -0.6, social: -0.4 }, { cost: 2, education: 8, research: 0.15 }, { youth: 12, liberals: 6, business: -3 }),
  ] },
  { id: 'immigration', name: 'Immigration', category: 'society', options: [
    o('closed', 'Closed Borders', 'Immigration all but stopped.', { econ: 0, social: 0.9 }, { growth: -0.004, popGrowth: -0.003 }, { nationalists: 14, liberals: -10, business: -6 }),
    o('selective', 'Selective', 'Points-based skilled immigration.', { econ: 0.3, social: 0.2 }, { growth: 0.001 }, { business: 2 }),
    o('open', 'Open Borders', 'Welcoming migrants and refugees.', { econ: -0.1, social: -0.9 }, { growth: 0.004, popGrowth: 0.006, unrest: 4 }, { liberals: 10, business: 6, nationalists: -16, workers: -4 }),
  ] },
  { id: 'press', name: 'Press Freedom', category: 'society', options: [
    o('state_media', 'State Media', 'Media controlled by the state.', { econ: 0, social: 0.8 }, { freedom: -25, stability: 6, corruption: 8 }, { liberals: -16, youth: -8, nationalists: 4 }),
    o('regulated', 'Regulated', 'Licensing and content rules.', { econ: 0, social: 0.3 }, { freedom: -8, stability: 2 }, { liberals: -4 }),
    o('free', 'Free Press', 'Independent media scrutinise power.', { econ: 0, social: -0.6 }, { freedom: 15, corruption: -6, stability: -2 }, { liberals: 8, youth: 4 }),
  ] },
  { id: 'religion', name: 'Religion & State', category: 'society', options: [
    o('state_religion', 'State Religion', 'An official faith shapes law.', { econ: 0, social: 1 }, { freedom: -10, stability: 3 }, { religious: 14, liberals: -12, youth: -6 }),
    o('tolerant', 'Tolerant', 'Faiths respected, state neutral-ish.', { econ: 0, social: 0.2 }, {}, {}),
    o('secular', 'Strictly Secular', 'Religion fully separated from state.', { econ: 0, social: -0.7 }, { freedom: 4 }, { liberals: 6, religious: -12 }),
  ] },
  { id: 'drugs', name: 'Drug Policy', category: 'society', options: [
    o('prohibition', 'Prohibition', 'All recreational drugs illegal.', { econ: 0.1, social: 0.7 }, { crime: 6, cost: 0.2 }, { religious: 6, retirees: 4, youth: -8 }),
    o('decriminalized', 'Decriminalised', 'Possession treated as a health issue.', { econ: -0.2, social: -0.4 }, { crime: -2, health: 1 }, { liberals: 4, religious: -4 }),
    o('legal', 'Legal & Taxed', 'Regulated market, taxed sales.', { econ: 0.2, social: -0.8 }, { crime: -6, revenue: 0.02 }, { youth: 10, liberals: 6, religious: -12, retirees: -6 }),
  ] },
  { id: 'social_rights', name: 'Civil Rights', category: 'society', options: [
    o('traditional', 'Traditional', 'Laws reflect traditional values.', { econ: 0, social: 0.9 }, { freedom: -8 }, { religious: 10, nationalists: 4, liberals: -14, youth: -8 }),
    o('moderate', 'Moderate', 'Gradual expansion of rights.', { econ: 0, social: 0 }, {}, {}),
    o('progressive', 'Progressive', 'Strong anti-discrimination and equality laws.', { econ: -0.2, social: -0.9 }, { freedom: 8, growth: 0.001 }, { liberals: 12, youth: 8, religious: -12, nationalists: -6 }),
  ] },
  // ---------------- Security ----------------
  { id: 'conscription', name: 'Military Service', category: 'security', options: [
    o('volunteer', 'All-Volunteer', 'Professional volunteer forces.', { econ: 0.2, social: -0.3 }, { manpower: 0.004 }, { youth: 4 }),
    o('selective', 'Selective Service', 'Limited draft when needed.', { econ: 0, social: 0.3 }, { manpower: 0.01, stability: -1 }, { military: 4, youth: -4 }),
    o('universal', 'Universal Conscription', 'All young adults serve.', { econ: 0, social: 0.7 }, { manpower: 0.025, growth: -0.003, stability: -2 }, { military: 10, nationalists: 6, youth: -14, liberals: -6 }),
  ] },
  { id: 'policing', name: 'Policing', category: 'security', options: [
    o('community', 'Community Policing', 'Focus on prevention and trust.', { econ: -0.2, social: -0.6 }, { crime: 2, freedom: 4, unrest: -3 }, { liberals: 6, youth: 4, military: -6 }),
    o('standard', 'Standard', 'Conventional law enforcement.', { econ: 0, social: 0 }, {}, {}),
    o('tough', 'Tough on Crime', 'Harsh sentences, broad police powers.', { econ: 0.2, social: 0.8 }, { crime: -8, freedom: -8, cost: 0.4, unrest: 2 }, { retirees: 6, military: 6, nationalists: 6, liberals: -10, youth: -8 }),
  ] },
  { id: 'surveillance', name: 'Surveillance', category: 'security', options: [
    o('limited', 'Warrants Required', 'Strong privacy protections.', { econ: 0, social: -0.7 }, { freedom: 6, crime: 2 }, { liberals: 8, military: -4 }),
    o('targeted', 'Targeted', 'Intelligence with oversight.', { econ: 0, social: 0.1 }, {}, {}),
    o('mass', 'Mass Surveillance', 'Pervasive monitoring of citizens.', { econ: 0, social: 0.9 }, { freedom: -18, crime: -6, stability: 5, cost: 0.3 }, { military: 6, liberals: -16, youth: -10 }),
  ] },
  { id: 'guns', name: 'Gun Control', category: 'security', options: [
    o('permissive', 'Permissive', 'Right to bear arms broadly protected.', { econ: 0.4, social: 0.7 }, { crime: 5, freedom: 3 }, { farmers: 8, nationalists: 8, liberals: -10 }),
    o('licensed', 'Licensed', 'Ownership with licensing.', { econ: 0, social: 0 }, {}, {}),
    o('banned', 'Strict Ban', 'Private firearms largely banned.', { econ: -0.2, social: -0.5 }, { crime: -4, freedom: -3 }, { liberals: 6, farmers: -10, nationalists: -8 }),
  ] },
  { id: 'death_penalty', name: 'Capital Punishment', category: 'security', options: [
    o('abolished', 'Abolished', 'No death penalty.', { econ: 0, social: -0.6 }, { freedom: 2 }, { liberals: 6, religious: -2 }),
    o('legal', 'Legal', 'Death penalty for severe crimes.', { econ: 0, social: 0.7 }, { crime: -1, freedom: -2 }, { nationalists: 4, retirees: 2, liberals: -6 }),
  ] },
  { id: 'nuclear_weapons', name: 'Nuclear Doctrine', category: 'security', options: [
    o('none', 'Non-Nuclear', 'Renounce nuclear weapons.', { econ: 0, social: -0.5 }, {}, { greens: 6, liberals: 4, nationalists: -4 }),
    o('deterrent', 'Minimal Deterrent', 'Maintain a small arsenal.', { econ: 0, social: 0.3 }, { cost: 0.2 }, { military: 4, greens: -4 }),
    o('first_use', 'First-Use Doctrine', 'Reserve the right to strike first.', { econ: 0, social: 0.9 }, { cost: 0.4, stability: -2 }, { military: 8, nationalists: 8, greens: -10, liberals: -10 }),
  ] },
  // ---------------- Government ----------------
  { id: 'electoral_system', name: 'Electoral System', category: 'government', options: [
    o('fptp', 'First Past the Post', 'Each region elects its winner. Favours big parties.', { econ: 0, social: 0.2 }, { stability: 2 }, {}),
    o('proportional', 'Proportional', 'Seats proportional to national vote.', { econ: 0, social: -0.3 }, { legitimacy: 4 }, { liberals: 4 }),
  ] },
  { id: 'term_limits', name: 'Term Limits', category: 'government', options: [
    o('strict', 'Strict', 'Leaders limited to two terms.', { econ: 0, social: -0.3 }, { legitimacy: 4, corruption: -3 }, { liberals: 4 }),
    o('none', 'None', 'Leaders may serve indefinitely.', { econ: 0, social: 0.4 }, { legitimacy: -6, corruption: 4, stability: 2 }, { liberals: -8, youth: -4 }),
  ] },
  { id: 'anti_corruption', name: 'Anti-Corruption', category: 'government', options: [
    o('lax', 'Lax', 'Few checks on officials.', { econ: 0.1, social: 0.2 }, { corruption: 8 }, { business: 2 }),
    o('standard', 'Standard', 'Courts and auditors.', { econ: 0, social: 0 }, { cost: 0.1 }, {}),
    o('aggressive', 'Independent Commission', 'Powerful anti-graft agency.', { econ: 0, social: -0.2 }, { corruption: -12, cost: 0.3, stability: -1 }, { liberals: 6, business: -2 }),
  ] },
  { id: 'emergency_powers', name: 'Emergency Powers', category: 'government', options: [
    o('none', 'Constitutional Rule', 'Normal checks and balances.', { econ: 0, social: 0 }, {}, {}),
    o('martial_law', 'Martial Law', 'Military enforces order. Elections suspended.', { econ: 0, social: 1 }, { freedom: -30, stability: 10, legitimacy: -20, growth: -0.01, unrest: -15 }, { military: 12, liberals: -25, youth: -15, business: -8 }),
  ] },
  { id: 'federalism', name: 'Regional Autonomy', category: 'government', options: [
    o('centralised', 'Centralised', 'Power concentrated in the capital.', { econ: 0, social: 0.4 }, { unrest: 3, corruption: 2 }, { nationalists: 4 }),
    o('federal', 'Federal', 'States share power with the centre.', { econ: 0, social: 0 }, { unrest: -2 }, {}),
    o('devolved', 'Highly Devolved', 'Regions largely self-governing.', { econ: 0, social: -0.3 }, { unrest: -5, growth: -0.001 }, { nationalists: -6, liberals: 2 }),
  ] },
  // ---------------- Environment ----------------
  { id: 'carbon', name: 'Carbon Policy', category: 'environment', options: [
    o('none', 'No Carbon Pricing', 'Emissions are free.', { econ: 0.7, social: 0.3 }, { pollution: 8, growth: 0.002 }, { business: 6, greens: -14, farmers: 2 }),
    o('cap_trade', 'Cap & Trade', 'Tradable emission permits.', { econ: 0.2, social: -0.2 }, { pollution: -4, revenue: 0.01 }, { greens: 4 }),
    o('carbon_tax', 'Carbon Tax', 'Heavy tax on emissions.', { econ: -0.4, social: -0.5 }, { pollution: -10, growth: -0.003, revenue: 0.03 }, { greens: 14, business: -8, farmers: -4, workers: -3 }),
  ] },
  { id: 'energy_mix', name: 'Energy Strategy', category: 'environment', options: [
    o('fossil', 'Fossil Fuels', 'Coal, oil and gas first.', { econ: 0.5, social: 0.5 }, { pollution: 10, energy: 0.08, growth: 0.001 }, { workers: 3, greens: -12 }),
    o('mixed', 'Mixed', 'Balanced energy portfolio.', { econ: 0, social: 0 }, {}, {}),
    o('nuclear', 'Nuclear Push', 'Expand nuclear power.', { econ: 0.2, social: 0.1 }, { pollution: -6, energy: 0.06, cost: 0.3 }, { greens: -4, business: 2 }),
    o('renewables', 'Renewables Transition', 'Wind, solar and storage.', { econ: -0.4, social: -0.5 }, { pollution: -10, energy: -0.03, cost: 0.5 }, { greens: 14, youth: 6, workers: -2 }),
  ] },
  { id: 'land_use', name: 'Land Use', category: 'environment', options: [
    o('development', 'Pro-Development', 'Fast permitting, few restrictions.', { econ: 0.6, social: 0 }, { growth: 0.003, pollution: 4 }, { business: 6, greens: -8 }),
    o('balanced', 'Balanced', 'Standard zoning and reviews.', { econ: 0, social: 0 }, {}, {}),
    o('conservation', 'Conservation', 'Protected lands, strict reviews.', { econ: -0.4, social: -0.3 }, { growth: -0.002, pollution: -5 }, { greens: 10, farmers: -4, business: -4 }),
  ] },
];

export const LAW_BY_ID: Record<string, LawDef> = Object.fromEntries(LAWS.map((l) => [l.id, l]));

export function lawOption(lawId: string, optionId: string): LawOption | undefined {
  return LAW_BY_ID[lawId]?.options.find((op) => op.id === optionId);
}

export const LAW_CATEGORIES: { id: LawDef['category']; name: string }[] = [
  { id: 'economy', name: 'Economy' },
  { id: 'society', name: 'Society' },
  { id: 'security', name: 'Security' },
  { id: 'government', name: 'Government' },
  { id: 'environment', name: 'Environment' },
];
