// Dynamic game state. Everything here is plain JSON so it can be saved and synced
// to peers. Static geography lives in StaticWorld.

export type GovType =
  | 'presidential'
  | 'parliamentary'
  | 'semi_presidential'
  | 'constitutional_monarchy'
  | 'one_party'
  | 'absolute_monarchy'
  | 'military_junta'
  | 'theocracy';

export type Ideology = { econ: number; social: number }; // -1 left/progressive .. +1 right/conservative

export type GroupId =
  | 'workers' | 'business' | 'farmers' | 'religious' | 'liberals'
  | 'greens' | 'nationalists' | 'retirees' | 'youth' | 'military';

export interface GroupState { size: number; approval: number } // size: share 0..1, approval 0..100

export type BudgetKey = 'military' | 'health' | 'education' | 'welfare' | 'infrastructure' | 'research' | 'police' | 'admin';
export type TaxKey = 'income' | 'corporate' | 'sales' | 'tariffs';
export type TechField = 'military' | 'economy' | 'society';

export interface Country {
  id: string; // ISO A3
  name: string;
  color: [number, number, number];
  gov: GovType;
  leaderTitle: string;
  rulingParty: string; // party id
  coalition: string[]; // party ids in government (incl. rulingParty)
  playerId: string | null;
  bloc: string; // 'western' | 'eastern' | 'chinese' | 'nonaligned'
  capital: number; // region id

  // economy (billions USD unless noted)
  gdp: number;
  gdpGrowth: number; // annualised, fraction
  growthParts?: Record<string, number>; // breakdown for the UI
  growthCal?: number; // offset so the starting policy mix reproduces real-world growth
  baseGrowth: number;
  inflation: number; // fraction
  unemployment: number; // fraction
  interestRate: number;
  treasury: number;
  debt: number;
  revenue: number; // annual
  expenses: number; // annual
  taxes: Record<TaxKey, number>; // percent
  budget: Record<BudgetKey, number>; // percent of GDP
  energy: number; // supply/demand ratio
  energyBase: number; // legacy grid supply (energy units)
  milFund: number; // procurement account funded by the military budget (billions)
  tradeOpenness: number; // 0..1
  creditRating: string;

  // politics & society
  laws: Record<string, string>;
  groups: Record<GroupId, GroupState>;
  approval: number; // 0..100
  stability: number; // 0..100
  legitimacy: number; // 0..100
  corruption: number; // 0..100
  freedom: number; // 0..100 (derived from laws)
  health: number; // 0..100
  education: number; // 0..100
  crime: number; // 0..100
  pollution: number; // 0..100
  warSupport: number; // 0..100
  legislatureSize: number;
  seats: Record<string, number>;
  nextElection: number; // tick, -1 = none
  electionInterval: number; // days
  lastElection: { tick: number; votes: Record<string, number>; regionWinners: Record<number, string> } | null;
  coupRisk: number;

  // military & research
  manpower: number; // available recruits
  tech: Record<TechField, number>; // levels (integer part = level, fraction = progress)
  researchFocus: TechField;
  militaryReadiness: number; // 0..1, falls if upkeep unfunded
  nukes: number;

  production: ProductionItem[];
  ai: { aggression: number; caution: number; lastWarCheck: number };
  modifiers: Modifier[];
}

export interface Modifier { id: string; label: string; until: number; growth?: number; stability?: number; approval?: number; unrest?: number }

export interface Construction { building: string; progress: number; days: number }

export interface ProductionItem { id: string; unitType: string; region: number; progress: number; days: number; name: string }

export interface Region {
  id: number;
  owner: string;
  controller: string; // differs from owner when occupied
  pop: number;
  prosperity: number; // 0..100 drives city growth visuals
  productivity: number; // GDP per capita multiplier
  unrest: number; // 0..100
  devastation: number; // 0..100 from war/disasters
  buildings: Record<string, number>; // building id -> level
  construction: Construction[];
  fort: number; // entrenchment from fortification building / time held
  supportByParty?: Record<string, number>; // latest local poll, for map mode
}

export interface Party {
  id: string;
  country: string;
  name: string;
  short: string;
  color: [number, number, number];
  ideology: Ideology;
  popularity: number; // national vote intention 0..1
  funds: number; // millions
  playerId: string | null;
  momentum: number; // temporary campaign boost
  billStance: Record<string, 'yes' | 'no'>; // a player party's declared votes
}

export type UnitDomain = 'land' | 'air' | 'naval';

export interface Unit {
  id: string;
  type: string; // unit type id
  owner: string;
  name: string;
  strength: number; // 0..1
  org: number; // 0..1 organisation/morale
  xp: number; // 0..1
  parent: string | null; // formation id
  home: number; // home base region
  training: number; // days remaining until ready (0 = ready)
}

export type FormationKind = 'regiment' | 'army' | 'taskforce';

export type Order =
  | { kind: 'hold' }
  | { kind: 'move'; target: number }
  | { kind: 'patrol'; lon: number; lat: number }
  | { kind: 'blockade'; target: number }
  | { kind: 'airSuperiority'; target: number }
  | { kind: 'groundSupport'; target: number }
  | { kind: 'strategicBombing'; target: number }
  | { kind: 'amphibious'; target: number }
  | { kind: 'missileStrike'; target: number };

export interface Position {
  region: number; // current region (land), or base/port region for naval when docked
  lon: number;
  lat: number;
  path: [number, number][]; // remaining waypoints [lon,lat]
  pathRegions: number[]; // land route regions remaining
  progress: number; // km travelled toward next waypoint
  atSea: boolean;
}

export interface Formation {
  id: string;
  kind: FormationKind;
  owner: string;
  name: string;
  units: string[]; // direct unit members
  children: string[]; // child formations (regiments inside an army / task force)
  parent: string | null;
  order: Order;
  pos: Position;
  stance: 'balanced' | 'aggressive' | 'defensive';
  inCombat: boolean;
  manned: boolean; // has ever held units; emptied manned formations are removed
  supplied?: boolean; // land formations cut off from friendly territory lose strength and organisation
  amphibious?: boolean; // currently assaulting from the sea
}

export type TreatyType = 'trade' | 'non_aggression' | 'defensive_pact' | 'military_access' | 'research' | 'alliance';

export interface Treaty { id: string; type: TreatyType; a: string; b: string; since: number }

export interface Organization {
  id: string;
  name: string;
  short: string;
  kind: 'military' | 'economic' | 'political';
  members: string[];
  founder: string;
  color: [number, number, number];
}

export interface War {
  id: string;
  name: string;
  attackers: string[];
  defenders: string[];
  start: number;
  score: number; // -100..100 positive favours attackers
  casualties: Record<string, number>;
  battles: Battle[];
  noPeaceBefore?: number; // AI won't negotiate before this tick
}

export interface Battle { region: number; lon: number; lat: number; attacker: string; defender: string; started: number; intensity: number }

export type ProposalKind =
  | { type: 'treaty'; treaty: TreatyType }
  | { type: 'join_org'; org: string }
  | { type: 'peace'; war: string; cede: number[]; reparations: number }
  | { type: 'join_war'; war: string; side: 'attackers' | 'defenders' }
  | { type: 'aid'; amount: number };

export interface Proposal {
  id: string;
  from: string;
  to: string;
  kind: ProposalKind;
  created: number;
  expires: number;
}

export interface Bill {
  id: string;
  country: string;
  law: string;
  option: string;
  sponsor: string; // party id
  introduced: number;
  voteOn: number;
}

export type NewsCategory = 'politics' | 'economy' | 'diplomacy' | 'military' | 'disaster' | 'world' | 'election';

export interface NewsItem { id: string; tick: number; cat: NewsCategory; text: string; countries: string[]; region?: number; important?: boolean }

export type MapEventKind =
  | 'hurricane' | 'earthquake' | 'wildfire' | 'flood' | 'protest' | 'riot' | 'terror' | 'epidemic'
  | 'boom' | 'construction' | 'strike' | 'discovery' | 'nuclear';

export interface MapEvent { id: string; kind: MapEventKind; region: number; lon: number; lat: number; start: number; until: number; severity: number }

export interface Decision {
  id: string;
  country: string;
  event: string; // event def id
  title: string;
  text: string;
  region?: number;
  options: { id: string; label: string; detail: string }[];
  created: number;
  expires: number;
}

export interface Player {
  id: string;
  name: string;
  country: string | null;
  partyId: string | null;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
}

export interface ChatMessage { id: string; tick: number; from: string; name: string; text: string; to?: string }

export interface GameSettings {
  scenario: 'realworld' | 'peaceful';
  fogOfWar: boolean;
  startYear: number;
  electionsCanRemovePlayers: boolean;
  aiAggression: number; // 0..2
  disasterFrequency: number; // 0..2
  economyDifficulty: number; // 0.5..1.5
}

export interface GameState {
  version: number;
  phase: 'lobby' | 'playing';
  tick: number; // days since start
  startDate: string; // ISO date
  speed: number; // 1..5
  paused: boolean;
  settings: GameSettings;
  players: Record<string, Player>;
  countries: Record<string, Country>;
  regions: Region[];
  parties: Record<string, Party>;
  units: Record<string, Unit>;
  formations: Record<string, Formation>;
  treaties: Record<string, Treaty>;
  orgs: Record<string, Organization>;
  wars: Record<string, War>;
  proposals: Record<string, Proposal>;
  bills: Record<string, Bill>;
  decisions: Record<string, Decision>;
  news: NewsItem[];
  mapEvents: Record<string, MapEvent>;
  relations: Record<string, number>; // "AAA|BBB" sorted key -> opinion delta from base
  sanctions: Record<string, true>; // "FROM>TO"
  chat: ChatMessage[];
  global: { oilPrice: number; worldGrowth: number; pandemic: { active: boolean; severity: number; until: number }; pendingRetaliation?: { from: string; against: string; at: number }[] };
  nextId: number;
  seed: number;
}
