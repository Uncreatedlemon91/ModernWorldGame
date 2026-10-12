import type { GovType } from '../sim/types';

export const GOV_NAMES: Record<GovType, string> = {
  presidential: 'Presidential Republic',
  parliamentary: 'Parliamentary Republic',
  semi_presidential: 'Semi-Presidential Republic',
  constitutional_monarchy: 'Constitutional Monarchy',
  one_party: 'One-Party State',
  absolute_monarchy: 'Absolute Monarchy',
  military_junta: 'Military Junta',
  theocracy: 'Theocracy',
};

export const TREATY_ICON: Record<string, string> = {
  trade: '⇄', non_aggression: '☮', defensive_pact: '🛡', military_access: '⇢', research: '⚗', alliance: '★',
};
