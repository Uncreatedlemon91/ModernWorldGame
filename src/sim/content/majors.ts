import type { GovType, Ideology } from '../types';

// Hand-tuned starting data for major powers. Everyone else is generated from
// Natural Earth statistics in init.ts.

export interface PartySeed { name: string; short: string; color: string; ideology: Ideology; share: number }
export interface MajorSeed {
  gov: GovType;
  leaderTitle: string;
  bloc: 'western' | 'eastern' | 'chinese' | 'nonaligned';
  parties: PartySeed[]; // first = ruling
  coalition?: number[]; // indexes of extra coalition partners
  laws?: Record<string, string>;
  military: number; // % GDP
  forces: Record<string, number>; // unit type -> count
  nukes?: number;
  aggression?: number;
  growth?: number; // base annual growth
}

const P = (name: string, short: string, color: string, econ: number, social: number, share: number): PartySeed => ({ name, short, color, ideology: { econ, social }, share });

export const MAJORS: Record<string, MajorSeed> = {
  USA: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'western', military: 3.4, nukes: 3700, growth: 0.022,
    parties: [P('Republican Party', 'GOP', '#d63a3a', 0.6, 0.6, 0.5), P('Democratic Party', 'DEM', '#2f6fd6', -0.3, -0.5, 0.48), P('Libertarian Party', 'LIB', '#e8c33a', 0.9, -0.4, 0.02)],
    laws: { healthcare: 'mixed', minimum_wage: 'low', trade_policy: 'protectionism', pensions: 'state_basic', guns: 'permissive', death_penalty: 'legal', electoral_system: 'fptp', federalism: 'federal', carbon: 'none', energy_mix: 'fossil', press: 'free', conscription: 'volunteer', term_limits: 'strict', nuclear_weapons: 'deterrent' },
    forces: { infantry: 30, mech_infantry: 24, armor: 16, artillery: 16, air_defense: 8, special_forces: 8, marines: 12, airborne: 8, fighter: 24, strike: 30, bomber: 8, drone: 12, helicopter: 16, awacs: 4, carrier: 11, destroyer: 22, frigate: 4, submarine: 18, amphibious: 8 },
  },
  CHN: {
    gov: 'one_party', leaderTitle: 'General Secretary', bloc: 'chinese', military: 1.7, nukes: 600, growth: 0.045, aggression: 0.5,
    parties: [P('Chinese Communist Party', 'CCP', '#d3222a', -0.4, 0.7, 1)],
    laws: { healthcare: 'mixed', press: 'state_media', surveillance: 'mass', industry: 'state_owned', central_bank: 'political', religion: 'secular', conscription: 'selective', term_limits: 'none', electoral_system: 'proportional', guns: 'banned', death_penalty: 'legal', federalism: 'centralised', trade_policy: 'balanced', energy_mix: 'fossil', nuclear_weapons: 'deterrent', social_rights: 'traditional', policing: 'tough' },
    forces: { infantry: 50, mech_infantry: 30, armor: 20, artillery: 20, air_defense: 12, special_forces: 6, marines: 8, airborne: 4, fighter: 30, strike: 24, bomber: 6, drone: 14, helicopter: 12, awacs: 3, carrier: 3, destroyer: 24, frigate: 20, submarine: 14, amphibious: 8, corvette: 20 },
  },
  RUS: {
    gov: 'semi_presidential', leaderTitle: 'President', bloc: 'eastern', military: 6, nukes: 5500, growth: 0.012, aggression: 0.8,
    parties: [P('United Russia', 'UR', '#2e5fb8', 0.2, 0.7, 0.72), P('Communist Party', 'KPRF', '#c41e1e', -0.8, 0.5, 0.14), P('LDPR', 'LDPR', '#3a8fd6', 0.3, 0.9, 0.08), P('New People', 'NP', '#33b3a6', 0.4, -0.2, 0.06)],
    laws: { press: 'state_media', surveillance: 'mass', term_limits: 'none', conscription: 'universal', social_rights: 'traditional', central_bank: 'independent', energy_mix: 'fossil', nuclear_weapons: 'first_use', federalism: 'centralised', policing: 'tough', trade_policy: 'protectionism', electoral_system: 'proportional' },
    forces: { infantry: 40, mech_infantry: 20, armor: 16, artillery: 22, air_defense: 12, special_forces: 6, marines: 4, airborne: 8, fighter: 14, strike: 18, bomber: 6, drone: 12, helicopter: 10, awacs: 2, carrier: 1, destroyer: 8, frigate: 8, submarine: 14, amphibious: 4, corvette: 14 },
  },
  IND: {
    gov: 'parliamentary', leaderTitle: 'Prime Minister', bloc: 'nonaligned', military: 2.4, nukes: 170, growth: 0.065,
    parties: [P('Bharatiya Janata Party', 'BJP', '#f08a24', 0.4, 0.7, 0.44), P('Indian National Congress', 'INC', '#1f9fd6', -0.2, -0.2, 0.32), P('Samajwadi Party', 'SP', '#d42a2a', -0.5, 0, 0.1), P('Aam Aadmi Party', 'AAP', '#2a6bd4', -0.3, -0.3, 0.06)],
    laws: { healthcare: 'mixed', religion: 'tolerant', electoral_system: 'fptp', federalism: 'federal', trade_policy: 'protectionism', energy_mix: 'fossil', death_penalty: 'legal', guns: 'licensed', nuclear_weapons: 'deterrent' },
    forces: { infantry: 50, mech_infantry: 12, armor: 12, artillery: 16, air_defense: 8, special_forces: 4, marines: 2, airborne: 3, fighter: 16, strike: 12, drone: 6, helicopter: 8, awacs: 2, carrier: 2, destroyer: 10, frigate: 12, submarine: 8, amphibious: 2, corvette: 10 },
  },
  GBR: {
    gov: 'constitutional_monarchy', leaderTitle: 'Prime Minister', bloc: 'western', military: 2.3, nukes: 225, growth: 0.012,
    parties: [P('Labour Party', 'LAB', '#d50000', -0.4, -0.3, 0.34), P('Conservative Party', 'CON', '#0087dc', 0.5, 0.4, 0.24), P('Reform UK', 'REF', '#12b6cf', 0.6, 0.8, 0.18), P('Liberal Democrats', 'LD', '#faa61a', 0, -0.5, 0.13), P('Green Party', 'GRN', '#6ab023', -0.7, -0.8, 0.07)],
    laws: { healthcare: 'universal', electoral_system: 'fptp', press: 'free', guns: 'banned', federalism: 'devolved', carbon: 'cap_trade', energy_mix: 'renewables', nuclear_weapons: 'deterrent', social_rights: 'progressive' },
    forces: { infantry: 10, mech_infantry: 5, armor: 3, artillery: 4, air_defense: 2, special_forces: 4, marines: 3, airborne: 2, fighter: 6, strike: 6, drone: 3, helicopter: 4, awacs: 1, carrier: 2, destroyer: 6, frigate: 8, submarine: 7, amphibious: 2 },
  },
  FRA: {
    gov: 'semi_presidential', leaderTitle: 'President', bloc: 'western', military: 2.1, nukes: 290, growth: 0.011,
    parties: [P('Renaissance', 'RE', '#ffd600', 0.3, -0.2, 0.28), P('National Rally', 'RN', '#0d2a6b', 0.1, 0.8, 0.3), P('La France Insoumise', 'LFI', '#cc2443', -0.9, -0.5, 0.18), P('Socialist Party', 'PS', '#ff8080', -0.5, -0.4, 0.1), P('The Republicans', 'LR', '#0066cc', 0.6, 0.5, 0.08), P('The Ecologists', 'EELV', '#00c000', -0.6, -0.7, 0.06)],
    coalition: [4],
    laws: { healthcare: 'universal', labor_rights: 'strong', pensions: 'generous', religion: 'secular', energy_mix: 'nuclear', electoral_system: 'fptp', press: 'free', guns: 'licensed', nuclear_weapons: 'deterrent', carbon: 'cap_trade', social_rights: 'progressive', education_system: 'free_university' },
    forces: { infantry: 10, mech_infantry: 6, armor: 3, artillery: 4, air_defense: 2, special_forces: 4, marines: 3, airborne: 3, fighter: 6, strike: 8, drone: 3, helicopter: 4, awacs: 1, carrier: 1, destroyer: 5, frigate: 8, submarine: 6, amphibious: 3 },
  },
  DEU: {
    gov: 'parliamentary', leaderTitle: 'Chancellor', bloc: 'western', military: 2, growth: 0.008,
    parties: [P('Christian Democratic Union', 'CDU', '#151518', 0.4, 0.3, 0.29), P('Alternative for Germany', 'AfD', '#009ee0', 0.4, 0.9, 0.21), P('Social Democratic Party', 'SPD', '#e3000f', -0.4, -0.3, 0.16), P('Alliance 90/The Greens', 'GRÜNE', '#46962b', -0.4, -0.8, 0.12), P('The Left', 'LINKE', '#be3075', -0.9, -0.6, 0.09), P('Free Democratic Party', 'FDP', '#ffed00', 0.8, -0.3, 0.05)],
    coalition: [2],
    laws: { healthcare: 'universal', labor_rights: 'strong', electoral_system: 'proportional', federalism: 'federal', carbon: 'cap_trade', energy_mix: 'renewables', guns: 'licensed', education_system: 'free_university', nuclear_weapons: 'none', central_bank: 'independent', social_rights: 'progressive' },
    forces: { infantry: 8, mech_infantry: 8, armor: 5, artillery: 4, air_defense: 4, special_forces: 2, airborne: 2, fighter: 6, strike: 5, drone: 2, helicopter: 4, awacs: 0, destroyer: 3, frigate: 6, submarine: 6, corvette: 5 },
  },
  JPN: {
    gov: 'constitutional_monarchy', leaderTitle: 'Prime Minister', bloc: 'western', military: 1.6, growth: 0.007,
    parties: [P('Liberal Democratic Party', 'LDP', '#3ca324', 0.5, 0.5, 0.42), P('Constitutional Democratic Party', 'CDP', '#004098', -0.3, -0.4, 0.26), P('Nippon Ishin', 'Ishin', '#7fbe26', 0.6, 0.2, 0.12), P('Komeito', 'Komeito', '#f55881', -0.1, 0.2, 0.08), P('Democratic Party for the People', 'DPP', '#f8bc00', 0.2, 0, 0.08), P('Japanese Communist Party', 'JCP', '#db001c', -0.9, -0.5, 0.04)],
    coalition: [3],
    laws: { healthcare: 'universal', guns: 'banned', immigration: 'closed', death_penalty: 'legal', nuclear_weapons: 'none', energy_mix: 'mixed', electoral_system: 'fptp', conscription: 'volunteer', press: 'free' },
    forces: { infantry: 12, mech_infantry: 6, armor: 3, artillery: 5, air_defense: 6, special_forces: 2, marines: 2, airborne: 1, fighter: 10, strike: 6, drone: 2, helicopter: 6, awacs: 2, destroyer: 16, frigate: 6, submarine: 12, amphibious: 3 },
  },
  BRA: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 1.1, growth: 0.022,
    parties: [P("Workers' Party", 'PT', '#cc0000', -0.6, -0.3, 0.3), P('Liberal Party', 'PL', '#0f3a8c', 0.6, 0.8, 0.26), P('Brazil Union', 'UNIÃO', '#2aa6dc', 0.4, 0.3, 0.16), P('Social Democratic Party', 'PSD', '#f2a900', 0.1, 0.1, 0.14), P('Brazilian Democratic Movement', 'MDB', '#2e8b3a', 0.2, 0.2, 0.14)],
    coalition: [3, 4],
    laws: { healthcare: 'universal', electoral_system: 'proportional', federalism: 'federal', guns: 'licensed', religion: 'tolerant', trade_policy: 'protectionism', land_use: 'development', energy_mix: 'renewables' },
    forces: { infantry: 20, mech_infantry: 6, armor: 4, artillery: 5, air_defense: 2, special_forces: 2, marines: 2, airborne: 2, fighter: 4, strike: 4, drone: 1, helicopter: 3, frigate: 6, submarine: 5, corvette: 4, amphibious: 1 },
  },
  KOR: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'western', military: 2.8, growth: 0.018,
    parties: [P('Democratic Party of Korea', 'DPK', '#152484', -0.2, -0.3, 0.55), P('People Power Party', 'PPP', '#e61e2b', 0.5, 0.5, 0.36), P('Rebuilding Korea Party', 'RKP', '#0073cf', -0.4, -0.4, 0.05), P('Reform Party', 'RP', '#ff7210', 0.4, 0, 0.04)],
    laws: { conscription: 'universal', healthcare: 'universal', guns: 'banned', electoral_system: 'fptp', death_penalty: 'legal', energy_mix: 'nuclear', press: 'free' },
    forces: { infantry: 24, mech_infantry: 10, armor: 8, artillery: 12, air_defense: 6, special_forces: 4, marines: 4, airborne: 2, fighter: 10, strike: 8, drone: 3, helicopter: 6, awacs: 1, destroyer: 10, frigate: 8, submarine: 8, amphibious: 2, corvette: 6 },
  },
  ITA: {
    gov: 'parliamentary', leaderTitle: 'Prime Minister', bloc: 'western', military: 1.5, growth: 0.007,
    parties: [P("Brothers of Italy", 'FdI', '#003f7e', 0.3, 0.8, 0.29), P('Democratic Party', 'PD', '#ef1c27', -0.3, -0.4, 0.23), P('Five Star Movement', 'M5S', '#ffeb3b', -0.3, 0, 0.12), P('Forza Italia', 'FI', '#0087dc', 0.6, 0.3, 0.09), P('Lega', 'Lega', '#008800', 0.4, 0.8, 0.09), P('Greens and Left', 'AVS', '#c4161c', -0.7, -0.7, 0.06)],
    coalition: [3, 4],
    laws: { healthcare: 'universal', pensions: 'generous', electoral_system: 'proportional', religion: 'tolerant', federalism: 'federal', nuclear_weapons: 'none' },
    forces: { infantry: 10, mech_infantry: 5, armor: 2, artillery: 3, air_defense: 2, special_forces: 2, marines: 2, airborne: 2, fighter: 5, strike: 5, drone: 2, helicopter: 3, carrier: 1, destroyer: 4, frigate: 8, submarine: 4, amphibious: 2 },
  },
  CAN: {
    gov: 'constitutional_monarchy', leaderTitle: 'Prime Minister', bloc: 'western', military: 1.4, growth: 0.015,
    parties: [P('Liberal Party', 'LPC', '#d71920', -0.1, -0.4, 0.44), P('Conservative Party', 'CPC', '#1a4782', 0.5, 0.4, 0.41), P('Bloc Québécois', 'BQ', '#33b2cc', -0.2, -0.1, 0.07), P('New Democratic Party', 'NDP', '#f37021', -0.6, -0.6, 0.06), P('Green Party', 'GPC', '#3d9b35', -0.6, -0.8, 0.02)],
    laws: { healthcare: 'universal', electoral_system: 'fptp', federalism: 'federal', drugs: 'legal', guns: 'licensed', carbon: 'carbon_tax', social_rights: 'progressive', immigration: 'selective', nuclear_weapons: 'none' },
    forces: { infantry: 6, mech_infantry: 4, armor: 1, artillery: 2, air_defense: 1, special_forces: 2, airborne: 1, fighter: 4, strike: 2, helicopter: 2, frigate: 6, submarine: 2, corvette: 2 },
  },
  AUS: {
    gov: 'constitutional_monarchy', leaderTitle: 'Prime Minister', bloc: 'western', military: 2, growth: 0.02,
    parties: [P('Australian Labor Party', 'ALP', '#de3533', -0.3, -0.3, 0.6), P('Liberal–National Coalition', 'L/NP', '#1c4f9c', 0.5, 0.4, 0.29), P('Australian Greens', 'GRN', '#10c25b', -0.7, -0.8, 0.07), P('One Nation', 'ON', '#f36c21', 0.3, 0.9, 0.04)],
    laws: { healthcare: 'universal', electoral_system: 'fptp', federalism: 'federal', guns: 'banned', immigration: 'selective', energy_mix: 'mixed', nuclear_weapons: 'none' },
    forces: { infantry: 5, mech_infantry: 3, armor: 1, artillery: 2, air_defense: 1, special_forces: 2, marines: 1, airborne: 1, fighter: 4, strike: 3, drone: 1, helicopter: 2, awacs: 1, destroyer: 3, frigate: 7, submarine: 6, amphibious: 2 },
  },
  ESP: {
    gov: 'constitutional_monarchy', leaderTitle: 'Prime Minister', bloc: 'western', military: 1.3, growth: 0.022,
    parties: [P("Spanish Socialist Workers' Party", 'PSOE', '#ef1c27', -0.4, -0.4, 0.34), P("People's Party", 'PP', '#1e4b8f', 0.5, 0.4, 0.36), P('Vox', 'VOX', '#63be21', 0.4, 0.9, 0.14), P('Sumar', 'Sumar', '#e51c55', -0.8, -0.7, 0.1), P('Catalan & Basque parties', 'REG', '#ffcc00', -0.1, -0.2, 0.06)],
    coalition: [3, 4],
    laws: { healthcare: 'universal', electoral_system: 'proportional', federalism: 'devolved', energy_mix: 'renewables', social_rights: 'progressive', nuclear_weapons: 'none' },
    forces: { infantry: 8, mech_infantry: 4, armor: 2, artillery: 2, air_defense: 2, special_forces: 2, marines: 2, airborne: 1, fighter: 5, strike: 3, helicopter: 3, carrier: 1, frigate: 10, submarine: 2, amphibious: 2 },
  },
  MEX: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 0.7, growth: 0.015,
    parties: [P('Morena', 'MORENA', '#b5261e', -0.5, 0, 0.6), P('National Action Party', 'PAN', '#0a3e8f', 0.6, 0.6, 0.18), P('Institutional Revolutionary Party', 'PRI', '#00923f', 0.2, 0.3, 0.12), P('Citizens\' Movement', 'MC', '#ff8300', 0, -0.4, 0.1)],
    laws: { healthcare: 'mixed', electoral_system: 'proportional', federalism: 'federal', guns: 'banned', religion: 'secular', industry: 'subsidies' },
    forces: { infantry: 20, mech_infantry: 3, armor: 1, artillery: 2, air_defense: 1, special_forces: 3, marines: 4, fighter: 1, strike: 2, helicopter: 4, frigate: 4, corvette: 6 },
  },
  IDN: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 0.8, growth: 0.05,
    parties: [P('Gerindra', 'GER', '#c4161c', 0.2, 0.6, 0.24), P('PDI-P', 'PDIP', '#d6181f', -0.3, 0, 0.21), P('Golkar', 'GOLKAR', '#ffe400', 0.4, 0.3, 0.18), P('National Awakening Party', 'PKB', '#00843d', 0, 0.6, 0.12), P('Prosperous Justice Party', 'PKS', '#000000', 0.2, 0.9, 0.11), P('NasDem', 'NASDEM', '#25358b', 0.1, 0, 0.14)],
    coalition: [2, 3, 5],
    laws: { religion: 'tolerant', death_penalty: 'legal', drugs: 'prohibition', social_rights: 'traditional', electoral_system: 'proportional', energy_mix: 'fossil', guns: 'banned' },
    forces: { infantry: 30, mech_infantry: 4, armor: 2, artillery: 4, air_defense: 2, special_forces: 3, marines: 6, airborne: 2, fighter: 3, strike: 3, helicopter: 4, frigate: 8, submarine: 4, corvette: 12, amphibious: 3 },
  },
  TUR: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'western', military: 2, growth: 0.035, aggression: 0.5,
    parties: [P('Justice and Development Party', 'AKP', '#f7a400', 0.3, 0.8, 0.42), P("Republican People's Party", 'CHP', '#e30a17', -0.2, -0.4, 0.3), P('Nationalist Movement Party', 'MHP', '#c4161c', 0.2, 1, 0.1), P('DEM Party', 'DEM', '#8a2b8e', -0.6, -0.5, 0.1), P('Good Party', 'IYI', '#1fb6e9', 0.3, 0.5, 0.08)],
    coalition: [2],
    laws: { press: 'regulated', conscription: 'universal', term_limits: 'none', religion: 'tolerant', federalism: 'centralised', central_bank: 'political', electoral_system: 'proportional' },
    forces: { infantry: 24, mech_infantry: 8, armor: 6, artillery: 8, air_defense: 4, special_forces: 4, marines: 2, airborne: 1, fighter: 8, strike: 6, drone: 8, helicopter: 6, awacs: 1, frigate: 16, submarine: 12, corvette: 8, amphibious: 2 },
  },
  SAU: {
    gov: 'absolute_monarchy', leaderTitle: 'King', bloc: 'nonaligned', military: 6.5, growth: 0.03,
    parties: [P('House of Saud', 'Saud', '#006c35', 0.4, 0.9, 1)],
    laws: { religion: 'state_religion', press: 'state_media', surveillance: 'mass', social_rights: 'traditional', death_penalty: 'legal', drugs: 'prohibition', energy_mix: 'fossil', policing: 'tough', term_limits: 'none' },
    forces: { infantry: 10, mech_infantry: 6, armor: 5, artillery: 4, air_defense: 6, special_forces: 2, marines: 1, fighter: 8, strike: 8, drone: 2, helicopter: 4, awacs: 1, frigate: 4, corvette: 6 },
  },
  IRN: {
    gov: 'theocracy', leaderTitle: 'Supreme Leader', bloc: 'eastern', military: 2.5, growth: 0.02, aggression: 0.7,
    parties: [P('Principlists', 'PRIN', '#007a3d', -0.1, 0.9, 0.7), P('Reformists', 'REF', '#4ca64c', 0, 0.1, 0.3)],
    laws: { religion: 'state_religion', press: 'state_media', surveillance: 'mass', social_rights: 'traditional', death_penalty: 'legal', conscription: 'universal', drugs: 'prohibition', guns: 'banned', policing: 'tough', trade_policy: 'protectionism', industry: 'state_owned' },
    forces: { infantry: 30, mech_infantry: 4, armor: 4, artillery: 8, air_defense: 6, special_forces: 6, marines: 2, airborne: 1, fighter: 3, strike: 2, drone: 10, helicopter: 2, frigate: 4, submarine: 4, corvette: 10 },
  },
  PAK: {
    gov: 'parliamentary', leaderTitle: 'Prime Minister', bloc: 'nonaligned', military: 2.8, nukes: 170, growth: 0.03,
    parties: [P('Pakistan Muslim League (N)', 'PML-N', '#006400', 0.3, 0.6, 0.35), P('Pakistan Tehreek-e-Insaf', 'PTI', '#d2232a', 0, 0.5, 0.38), P("Pakistan Peoples Party", 'PPP', '#000000', -0.4, 0, 0.22), P('MQM-P', 'MQM', '#e30b17', -0.1, 0, 0.05)],
    coalition: [2, 3],
    laws: { religion: 'state_religion', death_penalty: 'legal', press: 'regulated', social_rights: 'traditional', electoral_system: 'fptp', nuclear_weapons: 'first_use', drugs: 'prohibition' },
    forces: { infantry: 32, mech_infantry: 6, armor: 6, artillery: 8, air_defense: 3, special_forces: 3, marines: 1, airborne: 1, fighter: 6, strike: 4, drone: 3, helicopter: 3, frigate: 6, submarine: 5, corvette: 4 },
  },
  POL: {
    gov: 'parliamentary', leaderTitle: 'Prime Minister', bloc: 'western', military: 4.1, growth: 0.03,
    parties: [P('Civic Coalition', 'KO', '#f68f2d', 0.3, -0.3, 0.34), P('Law and Justice', 'PiS', '#263778', -0.1, 0.8, 0.33), P('Third Way', 'TD', '#e6c300', 0.3, 0.1, 0.12), P('Confederation', 'KON', '#122b52', 0.8, 0.9, 0.12), P('The Left', 'LEW', '#ac145a', -0.7, -0.7, 0.09)],
    coalition: [2, 4],
    laws: { healthcare: 'universal', electoral_system: 'proportional', religion: 'tolerant', social_rights: 'traditional', energy_mix: 'fossil', conscription: 'selective' },
    forces: { infantry: 12, mech_infantry: 8, armor: 6, artillery: 6, air_defense: 4, special_forces: 2, airborne: 1, fighter: 5, strike: 4, drone: 2, helicopter: 3, frigate: 2, submarine: 1, corvette: 2 },
  },
  UKR: {
    gov: 'semi_presidential', leaderTitle: 'President', bloc: 'western', military: 8, growth: 0.02,
    parties: [P('Servant of the People', 'SN', '#1a9b4b', 0.2, -0.1, 0.6), P('European Solidarity', 'YeS', '#8b0000', 0.3, 0.3, 0.2), P('Batkivshchyna', 'BAT', '#d40000', -0.2, 0.3, 0.1), P('Holos', 'HOL', '#ff6600', 0.4, -0.4, 0.1)],
    laws: { conscription: 'universal', press: 'regulated', electoral_system: 'proportional' },
    forces: { infantry: 40, mech_infantry: 16, armor: 8, artillery: 18, air_defense: 10, special_forces: 6, marines: 4, airborne: 6, fighter: 3, strike: 3, drone: 20, helicopter: 3, corvette: 2 },
  },
  EGY: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 1.2, growth: 0.04,
    parties: [P("Nation's Future Party", 'NFP', '#1f5aa6', 0.3, 0.6, 0.7), P('New Wafd Party', 'WAFD', '#00843d', 0.4, 0.2, 0.15), P('Homeland Defenders', 'HDP', '#c00000', 0.2, 0.6, 0.15)],
    laws: { press: 'state_media', surveillance: 'mass', religion: 'state_religion', death_penalty: 'legal', term_limits: 'none', conscription: 'universal', social_rights: 'traditional' },
    forces: { infantry: 30, mech_infantry: 8, armor: 8, artillery: 8, air_defense: 6, special_forces: 3, marines: 2, airborne: 2, fighter: 6, strike: 5, helicopter: 4, carrier: 0, frigate: 8, submarine: 6, corvette: 6, amphibious: 2 },
  },
  NGA: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 0.6, growth: 0.032,
    parties: [P('All Progressives Congress', 'APC', '#00a651', 0.3, 0.5, 0.55), P("Peoples Democratic Party", 'PDP', '#ff0000', 0.1, 0.4, 0.3), P('Labour Party', 'LP', '#c8102e', -0.5, 0, 0.15)],
    laws: { religion: 'tolerant', death_penalty: 'legal', social_rights: 'traditional', federalism: 'federal', energy_mix: 'fossil', electoral_system: 'fptp' },
    forces: { infantry: 24, mech_infantry: 2, armor: 2, artillery: 3, special_forces: 2, marines: 1, fighter: 1, strike: 2, helicopter: 3, frigate: 1, corvette: 4 },
  },
  ZAF: {
    gov: 'parliamentary', leaderTitle: 'President', bloc: 'nonaligned', military: 0.7, growth: 0.012,
    parties: [P('African National Congress', 'ANC', '#008000', -0.4, 0, 0.4), P('Democratic Alliance', 'DA', '#005ba6', 0.5, -0.3, 0.22), P('uMkhonto weSizwe', 'MK', '#1e3a8a', -0.5, 0.4, 0.15), P('Economic Freedom Fighters', 'EFF', '#c8102e', -1, -0.1, 0.1), P('Inkatha Freedom Party', 'IFP', '#d4a017', 0.2, 0.5, 0.04), P('Patriotic Alliance', 'PA', '#4caf50', 0.1, 0.4, 0.09)],
    coalition: [1, 4],
    laws: { healthcare: 'mixed', electoral_system: 'proportional', social_rights: 'progressive', energy_mix: 'fossil', labor_rights: 'strong' },
    forces: { infantry: 10, mech_infantry: 3, armor: 1, artillery: 2, air_defense: 1, special_forces: 2, airborne: 1, fighter: 2, strike: 1, helicopter: 2, frigate: 4, submarine: 3 },
  },
  ARG: {
    gov: 'presidential', leaderTitle: 'President', bloc: 'nonaligned', military: 0.5, growth: 0.025,
    parties: [P('La Libertad Avanza', 'LLA', '#753bbd', 1, 0.4, 0.4), P('Union for the Homeland', 'UxP', '#00b5e2', -0.5, -0.2, 0.35), P('PRO', 'PRO', '#ffd700', 0.6, 0.2, 0.15), P('Radical Civic Union', 'UCR', '#e10019', 0.1, 0, 0.1)],
    coalition: [2],
    laws: { healthcare: 'mixed', central_bank: 'independent', industry: 'laissez_faire', trade_policy: 'free_trade', electoral_system: 'proportional', federalism: 'federal', social_rights: 'progressive' },
    forces: { infantry: 10, mech_infantry: 2, armor: 2, artillery: 2, special_forces: 1, marines: 1, airborne: 1, fighter: 1, strike: 2, helicopter: 2, destroyer: 2, frigate: 2, submarine: 1, corvette: 3 },
  },
  ISR: {
    gov: 'parliamentary', leaderTitle: 'Prime Minister', bloc: 'western', military: 5.3, nukes: 90, growth: 0.03, aggression: 0.6,
    parties: [P('Likud', 'Likud', '#1f4fa0', 0.6, 0.7, 0.27), P('Yesh Atid', 'YA', '#039be5', 0.2, -0.4, 0.2), P('National Unity', 'NU', '#1565c0', 0.2, 0.1, 0.12), P('Shas', 'Shas', '#000000', -0.1, 0.95, 0.09), P('United Torah Judaism', 'UTJ', '#222222', 0, 1, 0.07), P('Religious Zionism', 'RZ', '#2e7d32', 0.4, 1, 0.07), P('Yisrael Beiteinu', 'YB', '#0d47a1', 0.4, 0.4, 0.1), P('Arab parties', 'Ra\'am', '#43a047', -0.3, 0.4, 0.08)],
    coalition: [3, 4, 5],
    laws: { conscription: 'universal', religion: 'state_religion', electoral_system: 'proportional', surveillance: 'targeted', nuclear_weapons: 'deterrent', guns: 'licensed' },
    forces: { infantry: 12, mech_infantry: 6, armor: 8, artillery: 6, air_defense: 6, special_forces: 6, marines: 0, airborne: 3, fighter: 8, strike: 10, drone: 6, helicopter: 4, awacs: 1, submarine: 5, corvette: 6 },
  },
  PRK: {
    gov: 'one_party', leaderTitle: 'Supreme Leader', bloc: 'chinese', military: 24, nukes: 50, growth: 0.01, aggression: 0.9,
    parties: [P("Workers' Party of Korea", 'WPK', '#c8102e', -1, 1, 1)],
    laws: { press: 'state_media', surveillance: 'mass', industry: 'state_owned', conscription: 'universal', term_limits: 'none', trade_policy: 'protectionism', immigration: 'closed', guns: 'banned', death_penalty: 'legal', nuclear_weapons: 'first_use', policing: 'tough', religion: 'secular', central_bank: 'political' },
    forces: { infantry: 50, mech_infantry: 6, armor: 8, artillery: 20, air_defense: 8, special_forces: 10, marines: 2, airborne: 2, fighter: 3, strike: 2, helicopter: 2, submarine: 8, corvette: 12, amphibious: 2 },
  },
};

export interface OrgSeed { id: string; name: string; short: string; kind: 'military' | 'economic' | 'political'; color: string; members: string[] }

export const ORGS: OrgSeed[] = [
  { id: 'nato', name: 'North Atlantic Treaty Organization', short: 'NATO', kind: 'military', color: '#2b6cdf', members: ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'LUX', 'DNK', 'NOR', 'ISL', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'GRC', 'TUR', 'ALB', 'HRV', 'SVN', 'MNE', 'MKD', 'EST', 'LVA', 'LTU', 'FIN', 'SWE'] },
  { id: 'eu', name: 'European Union', short: 'EU', kind: 'economic', color: '#1c3f94', members: ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'] },
  { id: 'csto', name: 'Collective Security Treaty Organization', short: 'CSTO', kind: 'military', color: '#b33a3a', members: ['RUS', 'BLR', 'KAZ', 'KGZ', 'TJK'] },
  { id: 'sco', name: 'Shanghai Cooperation Organisation', short: 'SCO', kind: 'political', color: '#3a8fb3', members: ['CHN', 'RUS', 'IND', 'PAK', 'KAZ', 'KGZ', 'TJK', 'UZB', 'IRN', 'BLR'] },
  { id: 'asean', name: 'Association of Southeast Asian Nations', short: 'ASEAN', kind: 'economic', color: '#2a9d8f', members: ['IDN', 'MYS', 'PHL', 'SGP', 'THA', 'BRN', 'VNM', 'LAO', 'MMR', 'KHM'] },
  { id: 'brics', name: 'BRICS', short: 'BRICS', kind: 'economic', color: '#c98b2b', members: ['BRA', 'RUS', 'IND', 'CHN', 'ZAF', 'EGY', 'ETH', 'IRN', 'ARE', 'IDN'] },
  { id: 'mercosur', name: 'Mercosur', short: 'MERCOSUR', kind: 'economic', color: '#3aa35b', members: ['ARG', 'BRA', 'PRY', 'URY', 'BOL'] },
  { id: 'gcc', name: 'Gulf Cooperation Council', short: 'GCC', kind: 'economic', color: '#7a6a2b', members: ['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR'] },
];

// Bilateral defensive pacts at game start.
export const PACTS: [string, string][] = [
  ['USA', 'JPN'], ['USA', 'KOR'], ['USA', 'AUS'], ['USA', 'PHL'], ['USA', 'ISR'], ['USA', 'TWN'],
  ['CHN', 'PRK'], ['RUS', 'PRK'], ['RUS', 'BLR'], ['AUS', 'NZL'], ['GBR', 'AUS'],
];

export const ONE_PARTY = new Set(['CHN', 'VNM', 'LAO', 'CUB', 'PRK', 'ERI']);
export const ABS_MONARCHY = new Set(['SAU', 'OMN', 'QAT', 'ARE', 'KWT', 'BRN', 'SWZ', 'BHR']);
export const CONST_MONARCHY = new Set(['GBR', 'NLD', 'BEL', 'NOR', 'SWE', 'DNK', 'ESP', 'JPN', 'THA', 'MAR', 'JOR', 'LUX', 'CAN', 'AUS', 'NZL', 'MYS', 'KHM', 'BTN', 'LSO', 'TON', 'MCO', 'LIE', 'AND', 'JAM', 'BHS', 'PNG']);
export const JUNTA = new Set(['MMR', 'MLI', 'BFA', 'NER', 'GIN', 'SDN', 'TCD', 'GAB']);
export const THEOCRACY = new Set(['IRN', 'AFG', 'VAT']);
export const SEMI_PRES = new Set(['FRA', 'RUS', 'UKR', 'PRT', 'ROU', 'POL', 'LTU', 'TWN', 'SEN', 'DZA', 'TUN', 'MNG', 'PER', 'LKA', 'GEO']);
export const PRESIDENTIAL_REGIONS = new Set(['South America', 'North America']);

export const EASTERN = new Set(['RUS', 'BLR', 'IRN', 'SYR', 'VEN', 'CUB', 'NIC', 'KGZ', 'TJK', 'ARM', 'KAZ', 'MLI', 'BFA', 'NER', 'CAF']);
export const CHINESE = new Set(['CHN', 'PRK', 'LAO', 'KHM', 'MMR', 'PAK']);
export const WESTERN_EXTRA = new Set(['JPN', 'KOR', 'AUS', 'NZL', 'ISR', 'TWN', 'UKR', 'MDA', 'GEO', 'PHL', 'SGP', 'CHE', 'AUT', 'IRL', 'CYP', 'MLT']);
