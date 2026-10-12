const BLOC_REL: Record<string, Record<string, number>> = {
  western: { western: 45, eastern: -45, chinese: -20, nonaligned: 5 },
  eastern: { western: -45, eastern: 40, chinese: 25, nonaligned: 5 },
  chinese: { western: -20, eastern: 25, chinese: 40, nonaligned: 10 },
  nonaligned: { western: 5, eastern: 5, chinese: 10, nonaligned: 10 },
};

export const blocRelationOf = (a: string, b: string) => BLOC_REL[a]?.[b] ?? 0;

export const BLOC_NAMES: Record<string, string> = { western: 'Western', eastern: 'Russian-aligned', chinese: 'China-aligned', nonaligned: 'Non-aligned' };
