import type { UnitDomain } from '../types';

export interface UnitDef {
  id: string;
  name: string;
  domain: UnitDomain;
  echelon: 'Battalion' | 'Squadron' | 'Flotilla';
  icon: string;
  desc: string;
  attack: number; // vs ground
  defense: number;
  air: number; // anti-air / air-to-air
  naval: number; // anti-ship
  speed: number; // km/day
  range?: number; // km, aircraft mission radius
  strike?: number; // precision-strike (missile) power
  strikeRange?: number; // km
  cost: number; // billions
  upkeep: number; // billions/year
  manpower: number; // personnel
  days: number; // build time
  techReq: number; // military tech level required
  requires?: string; // building id needed in home region
  transport?: number; // regiments it can carry (naval)
  amphibious?: boolean;
}

export const UNITS: UnitDef[] = [
  // Land battalions
  { id: 'infantry', name: 'Infantry', domain: 'land', echelon: 'Battalion', icon: 'inf', desc: 'Versatile foot infantry. Cheap and good at holding ground.', attack: 4, defense: 7, air: 0.5, naval: 0, speed: 30, cost: 0.08, upkeep: 0.04, manpower: 800, days: 60, techReq: 0 },
  { id: 'mech_infantry', name: 'Mechanized Infantry', domain: 'land', echelon: 'Battalion', icon: 'mech', desc: 'Infantry in armored fighting vehicles.', attack: 7, defense: 9, air: 1, naval: 0, speed: 60, cost: 0.3, upkeep: 0.08, manpower: 700, days: 90, techReq: 1 },
  { id: 'armor', name: 'Armored', domain: 'land', echelon: 'Battalion', icon: 'armor', desc: 'Main battle tanks. Breakthrough power.', attack: 13, defense: 8, air: 0.5, naval: 0, speed: 50, cost: 0.6, upkeep: 0.12, manpower: 500, days: 120, techReq: 1 },
  { id: 'artillery', name: 'Artillery', domain: 'land', echelon: 'Battalion', icon: 'arty', desc: 'Howitzers and rocket artillery.', attack: 11, defense: 3, air: 0, naval: 0, speed: 35, cost: 0.25, upkeep: 0.06, manpower: 500, days: 90, techReq: 0 },
  { id: 'air_defense', name: 'Air Defense', domain: 'land', echelon: 'Battalion', icon: 'aa', desc: 'Surface-to-air missiles. Shields troops from air attack.', attack: 1, defense: 3, air: 12, naval: 0, speed: 40, cost: 0.35, upkeep: 0.07, manpower: 400, days: 100, techReq: 1 },
  { id: 'special_forces', name: 'Special Forces', domain: 'land', echelon: 'Battalion', icon: 'sf', desc: 'Elite raiders. Ignore terrain penalties.', attack: 9, defense: 6, air: 1, naval: 0, speed: 45, cost: 0.3, upkeep: 0.08, manpower: 300, days: 150, techReq: 2 },
  { id: 'marines', name: 'Marines', domain: 'land', echelon: 'Battalion', icon: 'marine', desc: 'Amphibious assault infantry.', attack: 7, defense: 7, air: 1, naval: 0, speed: 35, cost: 0.2, upkeep: 0.06, manpower: 700, days: 100, techReq: 1, amphibious: true },
  { id: 'missile', name: 'Missile Brigade', domain: 'land', echelon: 'Battalion', icon: 'sam', desc: 'Ballistic and cruise missiles for deep strikes.', attack: 2, defense: 2, air: 0, naval: 0, speed: 35, cost: 0.9, upkeep: 0.1, manpower: 400, days: 240, techReq: 3, strike: 14, strikeRange: 1500 },
  { id: 'airborne', name: 'Airborne', domain: 'land', echelon: 'Battalion', icon: 'para', desc: 'Paratroopers. Fast to deploy.', attack: 6, defense: 6, air: 1, naval: 0, speed: 40, cost: 0.2, upkeep: 0.06, manpower: 600, days: 110, techReq: 2 },
  // Air squadrons
  { id: 'fighter', name: 'Fighter', domain: 'air', echelon: 'Squadron', icon: 'fighter', desc: 'Air superiority fighters.', attack: 2, defense: 2, air: 14, naval: 1, speed: 1500, range: 1200, cost: 1.2, upkeep: 0.15, manpower: 150, days: 180, techReq: 1, requires: 'air_base' },
  { id: 'strike', name: 'Strike Fighter', domain: 'air', echelon: 'Squadron', icon: 'strike', desc: 'Multirole jets for ground and naval attack.', attack: 10, defense: 2, air: 7, naval: 7, speed: 1400, range: 1000, cost: 1.4, upkeep: 0.16, manpower: 160, days: 200, techReq: 2, requires: 'air_base' },
  { id: 'bomber', name: 'Strategic Bomber', domain: 'air', echelon: 'Squadron', icon: 'bomber', desc: 'Long-range bombing of industry and infrastructure.', attack: 16, defense: 1, air: 1, naval: 3, speed: 1000, range: 6000, cost: 3, upkeep: 0.3, manpower: 120, days: 300, techReq: 3, requires: 'air_base' },
  { id: 'drone', name: 'Drone Squadron', domain: 'air', echelon: 'Squadron', icon: 'drone', desc: 'Cheap persistent strike drones.', attack: 7, defense: 1, air: 0, naval: 2, speed: 400, range: 900, cost: 0.3, upkeep: 0.04, manpower: 60, days: 90, techReq: 2, requires: 'air_base' },
  { id: 'helicopter', name: 'Attack Helicopters', domain: 'air', echelon: 'Squadron', icon: 'heli', desc: 'Close air support for armies.', attack: 9, defense: 2, air: 1, naval: 2, speed: 300, range: 400, cost: 0.6, upkeep: 0.08, manpower: 120, days: 150, techReq: 1, requires: 'air_base' },
  { id: 'awacs', name: 'AWACS', domain: 'air', echelon: 'Squadron', icon: 'awacs', desc: 'Airborne early warning. Boosts all air units in a mission.', attack: 0, defense: 1, air: 5, naval: 0, speed: 800, range: 2000, cost: 1.5, upkeep: 0.12, manpower: 100, days: 240, techReq: 3, requires: 'air_base' },
  // Naval flotillas
  { id: 'corvette', name: 'Corvette Flotilla', domain: 'naval', echelon: 'Flotilla', icon: 'corvette', desc: 'Small coastal combatants.', attack: 2, defense: 4, air: 3, naval: 5, speed: 600, cost: 0.4, upkeep: 0.05, manpower: 300, days: 180, techReq: 0, requires: 'naval_base' },
  { id: 'frigate', name: 'Frigate Flotilla', domain: 'naval', echelon: 'Flotilla', icon: 'frigate', desc: 'Anti-submarine escorts.', attack: 3, defense: 6, air: 5, naval: 8, speed: 650, cost: 1.2, upkeep: 0.1, manpower: 600, days: 300, techReq: 1, requires: 'naval_base' },
  { id: 'destroyer', name: 'Destroyer Flotilla', domain: 'naval', echelon: 'Flotilla', icon: 'destroyer', desc: 'Multi-role warships with strong air defense and cruise missiles.', strike: 5, strikeRange: 1600, attack: 5, defense: 8, air: 10, naval: 11, speed: 700, cost: 2.5, upkeep: 0.2, manpower: 900, days: 420, techReq: 2, requires: 'naval_base' },
  { id: 'submarine', name: 'Submarine Flotilla', domain: 'naval', echelon: 'Flotilla', icon: 'sub', desc: 'Stealthy hunters of ships and trade; can launch cruise missiles.', strike: 3, strikeRange: 1600, attack: 2, defense: 5, air: 0, naval: 15, speed: 550, cost: 2.5, upkeep: 0.18, manpower: 300, days: 450, techReq: 2, requires: 'naval_base' },
  { id: 'amphibious', name: 'Amphibious Group', domain: 'naval', echelon: 'Flotilla', icon: 'amphib', desc: 'Carries regiments for landings.', attack: 1, defense: 4, air: 3, naval: 2, speed: 550, cost: 1.8, upkeep: 0.12, manpower: 800, days: 400, techReq: 1, requires: 'naval_base', transport: 2 },
  { id: 'carrier', name: 'Carrier Strike Group', domain: 'naval', echelon: 'Flotilla', icon: 'carrier', desc: 'Projects air power anywhere at sea.', attack: 14, defense: 9, air: 12, naval: 12, speed: 650, cost: 13, upkeep: 0.9, manpower: 5000, days: 900, techReq: 3, requires: 'naval_base' },
];

export const UNIT_BY_ID: Record<string, UnitDef> = Object.fromEntries(UNITS.map((u) => [u.id, u]));

export const FORMATION_RULES = {
  regiment: { label: 'Regiment', accepts: 'land units', maxUnits: 6 },
  army: { label: 'Army', accepts: 'regiments, battalions & squadrons', maxChildren: 12 },
  taskforce: { label: 'Task Force', accepts: 'flotillas, squadrons & regiments', maxChildren: 12 },
} as const;
