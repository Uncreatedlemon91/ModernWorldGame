// Buildings are constructed in regions, cost treasury money, and appear on the map.

export interface BuildingDef {
  id: string;
  name: string;
  icon: string; // key into the map icon atlas
  desc: string;
  cost: number; // billions USD (scaled by country price level)
  days: number;
  maxLevel: number;
  coastal?: boolean;
  upkeep: number; // billions/year
  effects: {
    productivity?: number; // regional GDP multiplier per level
    prosperity?: number;
    energy?: number; // energy supply in "GDP-billion units" per level
    research?: number; // research points per level per year
    health?: number;
    education?: number;
    pollution?: number; // per level, regional
    trade?: number;
    defense?: number; // fort bonus
    unrest?: number;
    jobs?: number; // unemployment reduction weight
    manpower?: number;
  };
  enables?: string[]; // unit classes this building enables in the region
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'factory', name: 'Industrial Park', icon: 'factory', desc: 'Manufacturing jobs and output.', cost: 2.5, days: 300, maxLevel: 5, upkeep: 0.05, effects: { productivity: 0.05, prosperity: 2, pollution: 3, jobs: 1 } },
  { id: 'tech_park', name: 'Technology Hub', icon: 'tech', desc: 'High-value services and research.', cost: 4, days: 360, maxLevel: 3, upkeep: 0.1, effects: { productivity: 0.07, prosperity: 3, research: 3, jobs: 0.6 } },
  { id: 'farm', name: 'Agricultural Complex', icon: 'farm', desc: 'Modern agriculture.', cost: 1, days: 180, maxLevel: 3, upkeep: 0.02, effects: { productivity: 0.02, prosperity: 1, jobs: 0.5 } },
  { id: 'mine', name: 'Mining & Extraction', icon: 'mine', desc: 'Resource extraction. Boosts output, pollutes.', cost: 2, days: 240, maxLevel: 3, upkeep: 0.04, effects: { productivity: 0.04, pollution: 4, jobs: 0.5 } },
  { id: 'oil', name: 'Oil & Gas Field', icon: 'oil', desc: 'Energy and export revenue.', cost: 3, days: 300, maxLevel: 3, upkeep: 0.05, effects: { productivity: 0.04, energy: 30, pollution: 4, jobs: 0.3 } },
  { id: 'power_gas', name: 'Gas Power Plant', icon: 'power', desc: 'Reliable electricity.', cost: 1.5, days: 200, maxLevel: 4, upkeep: 0.03, effects: { energy: 40, pollution: 3 } },
  { id: 'power_nuclear', name: 'Nuclear Plant', icon: 'nuclear', desc: 'Large clean power output.', cost: 8, days: 900, maxLevel: 2, upkeep: 0.15, effects: { energy: 160, research: 0.5 } },
  { id: 'power_renew', name: 'Wind & Solar Farm', icon: 'solar', desc: 'Clean power, popular with greens.', cost: 1.2, days: 150, maxLevel: 5, upkeep: 0.02, effects: { energy: 25, pollution: -1 } },
  { id: 'port', name: 'Container Port', icon: 'port', desc: 'Expands trade and freighter traffic.', cost: 3, days: 360, maxLevel: 3, coastal: true, upkeep: 0.05, effects: { productivity: 0.03, trade: 0.05, prosperity: 2, jobs: 0.4 } },
  { id: 'airport', name: 'International Airport', icon: 'airport', desc: 'Tourism, business and flights.', cost: 3, days: 400, maxLevel: 2, upkeep: 0.06, effects: { productivity: 0.03, prosperity: 2, trade: 0.02 } },
  { id: 'highway', name: 'Highway Network', icon: 'road', desc: 'Infrastructure and road traffic.', cost: 2, days: 300, maxLevel: 3, upkeep: 0.04, effects: { productivity: 0.03, prosperity: 1 } },
  { id: 'rail', name: 'High-Speed Rail', icon: 'rail', desc: 'Fast passenger rail.', cost: 5, days: 600, maxLevel: 2, upkeep: 0.08, effects: { productivity: 0.04, prosperity: 2, pollution: -1 } },
  { id: 'housing', name: 'Housing Development', icon: 'housing', desc: 'Cities expand; boosts prosperity.', cost: 1.5, days: 240, maxLevel: 5, upkeep: 0.01, effects: { prosperity: 4, unrest: -2 } },
  { id: 'university', name: 'University', icon: 'university', desc: 'Education and research.', cost: 2, days: 360, maxLevel: 3, upkeep: 0.05, effects: { education: 2, research: 2, prosperity: 1 } },
  { id: 'hospital', name: 'Hospital Network', icon: 'hospital', desc: 'Improves public health.', cost: 1.5, days: 300, maxLevel: 3, upkeep: 0.05, effects: { health: 2, prosperity: 1 } },
  { id: 'military_base', name: 'Army Base', icon: 'base', desc: 'Trains battalions. Defense bonus.', cost: 1.5, days: 240, maxLevel: 3, upkeep: 0.05, effects: { defense: 2, manpower: 0.1 }, enables: ['land'] },
  { id: 'air_base', name: 'Air Base', icon: 'airbase', desc: 'Hosts and builds squadrons.', cost: 2, days: 300, maxLevel: 3, upkeep: 0.06, effects: { defense: 1 }, enables: ['air'] },
  { id: 'naval_base', name: 'Naval Base', icon: 'navalbase', desc: 'Builds and repairs flotillas.', cost: 3, days: 400, maxLevel: 3, coastal: true, upkeep: 0.08, effects: { defense: 1 }, enables: ['naval'] },
  { id: 'arms_factory', name: 'Arms Factory', icon: 'arms', desc: 'Speeds up military production.', cost: 3, days: 360, maxLevel: 3, upkeep: 0.06, effects: { productivity: 0.02, jobs: 0.5 } },
  { id: 'fortifications', name: 'Fortifications', icon: 'fort', desc: 'Defensive lines; strong combat bonus.', cost: 1, days: 180, maxLevel: 5, upkeep: 0.02, effects: { defense: 5 } },
  { id: 'air_defense', name: 'Missile Defense', icon: 'sam', desc: 'Protects against air and missile strikes.', cost: 2.5, days: 300, maxLevel: 3, upkeep: 0.05, effects: { defense: 1 } },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
