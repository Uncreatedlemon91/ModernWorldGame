// Host -> client state replication. The host diffs entity-by-entity (JSON compare)
// and sends only what changed. News and chat are append-only and sent by id.
import type { GameState } from '../sim/types';

export interface Patch {
  tick: number;
  set: Record<string, unknown>; // "countries.USA" -> value, "regions.12" -> value, "tick" -> value
  del: string[];
  news: GameState['news'];
  chat: GameState['chat'];
}

const KEYED = ['countries', 'parties', 'units', 'formations', 'treaties', 'orgs', 'wars', 'proposals', 'bills', 'decisions', 'mapEvents', 'players', 'referendums', 'history'] as const;
const WHOLE = ['tick', 'startDate', 'speed', 'paused', 'settings', 'relations', 'sanctions', 'global', 'nextId', 'seed', 'version', 'phase', 'commodityPrices', 'commodityScale'] as const;

export class StateDiffer {
  private prev = new Map<string, string>();
  private newsSeen = new Set<string>();
  private chatSeen = new Set<string>();

  /** Mark everything in `state` as already sent (after a full snapshot). */
  prime(state: GameState) {
    this.diff(state);
  }

  diff(state: GameState): Patch {
    const set: Record<string, unknown> = {};
    const del: string[] = [];
    const seen = new Set<string>();
    const check = (key: string, value: unknown) => {
      seen.add(key);
      const s = JSON.stringify(value);
      if (this.prev.get(key) !== s) { this.prev.set(key, s); set[key] = value; }
    };
    for (const k of WHOLE) check(k, (state as unknown as Record<string, unknown>)[k]);
    for (const k of KEYED) {
      const coll = state[k] as Record<string, unknown>;
      for (const id of Object.keys(coll)) check(`${k}.${id}`, coll[id]);
    }
    state.regions.forEach((r, i) => check(`regions.${i}`, r));
    for (const key of this.prev.keys()) {
      if (!seen.has(key)) { del.push(key); this.prev.delete(key); }
    }
    const news = state.news.filter((n) => !this.newsSeen.has(n.id));
    news.forEach((n) => this.newsSeen.add(n.id));
    const chat = state.chat.filter((m) => !this.chatSeen.has(m.id));
    chat.forEach((m) => this.chatSeen.add(m.id));
    if (this.newsSeen.size > 2000) this.newsSeen = new Set(state.news.map((n) => n.id));
    return { tick: state.tick, set, del, news, chat };
  }
}

export function isEmptyPatch(p: Patch) {
  return !Object.keys(p.set).length && !p.del.length && !p.news.length && !p.chat.length;
}

export function applyPatch(state: GameState, p: Patch) {
  const s = state as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(p.set)) {
    const dot = key.indexOf('.');
    if (dot < 0) { s[key] = value; continue; }
    const coll = key.slice(0, dot), id = key.slice(dot + 1);
    if (coll === 'regions') state.regions[Number(id)] = value as GameState['regions'][number];
    else ((s[coll] ??= {}) as Record<string, unknown>)[id] = value;
  }
  for (const key of p.del) {
    const dot = key.indexOf('.');
    if (dot < 0) continue;
    const coll = key.slice(0, dot), id = key.slice(dot + 1);
    if (coll !== 'regions') delete (s[coll] as Record<string, unknown>)[id];
  }
  if (p.news.length) { state.news.push(...p.news); if (state.news.length > 250) state.news.splice(0, state.news.length - 250); }
  if (p.chat.length) { state.chat.push(...p.chat); if (state.chat.length > 200) state.chat.splice(0, state.chat.length - 200); }
}

// ---- compression helpers (browser CompressionStream) ----

export async function gzip(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(data: Uint8Array | ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}
