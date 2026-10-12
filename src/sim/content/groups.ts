import type { GroupId, Ideology } from '../types';

export interface GroupDef { id: GroupId; name: string; ideology: Ideology; icon: string; desc: string }

export const GROUPS: GroupDef[] = [
  { id: 'workers', name: 'Workers', ideology: { econ: -0.6, social: 0.1 }, icon: '⚒', desc: 'Industrial and service workers. Care about jobs, wages and welfare.' },
  { id: 'business', name: 'Business', ideology: { econ: 0.8, social: 0 }, icon: '💼', desc: 'Owners, executives and investors. Want low taxes and light regulation.' },
  { id: 'farmers', name: 'Farmers', ideology: { econ: 0.2, social: 0.5 }, icon: '🌾', desc: 'Rural producers. Want subsidies, protection and tradition.' },
  { id: 'religious', name: 'Religious', ideology: { econ: 0.1, social: 0.8 }, icon: '⛪', desc: 'Faith communities. Prioritise traditional values.' },
  { id: 'liberals', name: 'Urban Liberals', ideology: { econ: 0, social: -0.7 }, icon: '🏙', desc: 'Educated city dwellers. Value civil liberties and openness.' },
  { id: 'greens', name: 'Environmentalists', ideology: { econ: -0.4, social: -0.6 }, icon: '🌿', desc: 'Want clean energy and conservation.' },
  { id: 'nationalists', name: 'Nationalists', ideology: { econ: 0.2, social: 0.7 }, icon: '🦅', desc: 'Prioritise sovereignty, borders and a strong military.' },
  { id: 'retirees', name: 'Retirees', ideology: { econ: -0.2, social: 0.4 }, icon: '👴', desc: 'Pensioners. Care about healthcare, pensions and stability.' },
  { id: 'youth', name: 'Youth', ideology: { econ: -0.4, social: -0.6 }, icon: '🎓', desc: 'Students and young adults. Want education, jobs and freedom.' },
  { id: 'military', name: 'Security Establishment', ideology: { econ: 0.3, social: 0.5 }, icon: '🎖', desc: 'Armed forces and police. Want funding and order.' },
];

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, GroupDef>;
