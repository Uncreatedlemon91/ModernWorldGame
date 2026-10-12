// Game sessions. The host (or a single-player game) runs the authoritative
// simulation in the browser; clients receive replicated state over WebRTC
// (PeerJS) and send commands back.
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { StaticWorld } from '../data/static';
import type { GameSettings, GameState } from '../sim/types';
import type { CommandResult } from '../sim/commands';
import { applyPatch, gzip, gunzip, type Patch } from './sync';
import type { AnyCommand } from './authority';
import type { WorkerIn, WorkerOut } from './simWorker';

export { SPEED_MS, type AnyCommand, type LobbyCommand } from './authority';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Msg =
  | { type: 'hello'; name: string; playerId?: string }
  | { type: 'welcome'; playerId: string; data: Uint8Array }
  | { type: 'patch'; data: Uint8Array }
  | { type: 'cmd'; id: number; cmd: AnyCommand }
  | { type: 'ack'; id: number; result: CommandResult }
  | { type: 'kicked'; reason: string };

export function peerOptions(): PeerOptions {
  const opts: PeerOptions = { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
  try {
    const custom = localStorage.getItem('mw.signal');
    if (custom) Object.assign(opts, JSON.parse(custom));
  } catch { /* ignore */ }
  const params = new URLSearchParams(location.search);
  if (params.get('signal')) {
    const u = new URL(params.get('signal')!);
    Object.assign(opts, { host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)), path: u.pathname || '/', secure: u.protocol === 'https:' });
  }
  return opts;
}

export const ROOM_PREFIX = 'modernworld-';

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export abstract class Session {
  state!: GameState;
  me = '';
  version = 0;
  status: 'connecting' | 'ready' | 'error' | 'closed' = 'connecting';
  statusText = '';
  private listeners = new Set<() => void>();
  constructor(public world: StaticWorld) {}
  abstract readonly isHost: boolean;
  abstract readonly roomCode: string | null;
  abstract send(cmd: AnyCommand): Promise<CommandResult>;
  abstract leave(): void;
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  protected notify() { this.version++; for (const l of this.listeners) l(); }
}

/** Authoritative session: single-player, or the host of a multiplayer game.
 *  The simulation runs in a Web Worker; this class keeps a replica of the state
 *  for the UI and relays commands and diffs between the worker and peers. */
export class HostSession extends Session {
  readonly isHost = true;
  roomCode: string | null = null;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>(); // playerId -> conn
  private worker: Worker;
  private seq = 1;
  private pending = new Map<number, (r: unknown) => void>();
  private multiplayer: boolean;

  constructor(world: StaticWorld, opts: { name: string; multiplayer: boolean; state?: GameState; settings?: GameSettings }) {
    super(world);
    this.me = 'host';
    this.multiplayer = opts.multiplayer;
    this.statusText = 'Building the world…';
    this.worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => this.onWorker(ev.data);
    this.worker.onerror = (e) => { this.status = 'error'; this.statusText = `Simulation failed to start: ${e.message}`; this.notify(); };
    const init: WorkerIn = { type: 'init', dataUrl: new URL('./data/', location.href).href, hostName: opts.name, settings: opts.settings, state: opts.state };
    this.worker.postMessage(init);
  }

  private onWorker(m: WorkerOut) {
    if (m.type === 'ready') {
      this.state = m.state;
      if (this.multiplayer) this.openRoom();
      else { this.status = 'ready'; this.statusText = ''; }
      this.notify();
    } else if (m.type === 'patch') {
      applyPatch(this.state, m.patch);
      this.notify();
      if (this.conns.size) void gzip(JSON.stringify(m.patch)).then((data) => {
        for (const conn of this.conns.values()) if (conn.open) conn.send({ type: 'patch', data } satisfies Msg);
      });
    } else if (m.type === 'result') {
      this.pending.get(m.id)?.(m.result);
      this.pending.delete(m.id);
    } else if (m.type === 'error') {
      console.error('[sim]', m.message);
    }
  }

  private call<T>(msg: WithoutId<Extract<WorkerIn, { id: number }>>): Promise<T> {
    const id = this.seq++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve as (r: unknown) => void);
      this.worker.postMessage({ ...msg, id } as WorkerIn);
    });
  }

  private openRoom(attempt = 0) {
    const code = randomCode();
    this.status = 'connecting';
    this.statusText = 'Opening room…';
    const peer = new Peer(ROOM_PREFIX + code, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      this.roomCode = code;
      this.status = 'ready';
      this.statusText = '';
      this.notify();
    });
    peer.on('error', (err) => {
      if ((err as { type?: string }).type === 'unavailable-id' && attempt < 3) { peer.destroy(); this.openRoom(attempt + 1); return; }
      this.status = 'error';
      this.statusText = `Multiplayer unavailable: ${err.message}`;
      this.notify();
    });
    peer.on('connection', (conn) => this.handleConnection(conn));
  }

  private handleConnection(conn: DataConnection) {
    let playerId: string | null = null;
    conn.on('data', async (raw) => {
      const msg = raw as Msg;
      if (msg.type === 'hello') {
        const r = await this.call<{ playerId?: string; error?: string }>({ type: 'join', name: msg.name, previousId: msg.playerId });
        if (!r.playerId) { conn.send({ type: 'kicked', reason: r.error ?? 'Rejected' } satisfies Msg); return; }
        playerId = r.playerId;
        this.conns.set(playerId, conn);
        // the join patch has already been applied to our replica (worker messages are ordered)
        const data = await gzip(JSON.stringify(this.state));
        conn.send({ type: 'welcome', playerId, data } satisfies Msg);
      } else if (msg.type === 'cmd' && playerId) {
        const result = await this.call<CommandResult>({ type: 'cmd', playerId, cmd: msg.cmd });
        conn.send({ type: 'ack', id: msg.id, result } satisfies Msg);
      }
    });
    conn.on('close', () => {
      if (!playerId) return;
      this.conns.delete(playerId);
      this.worker.postMessage({ type: 'leave', playerId } satisfies WorkerIn);
    });
  }

  send(cmd: AnyCommand): Promise<CommandResult> {
    if (!this.state) return Promise.resolve({ ok: false, error: 'Still loading' });
    return this.call<CommandResult>({ type: 'cmd', playerId: this.me, cmd });
  }

  leave() {
    this.worker.terminate();
    for (const c of this.conns.values()) c.close();
    this.peer?.destroy();
    this.status = 'closed';
  }
}

/** A remote player connected to someone else's room. */
export class ClientSession extends Session {
  readonly isHost = false;
  private peer: Peer;
  private conn: DataConnection | null = null;
  private pending = new Map<number, (r: CommandResult) => void>();
  private seq = 1;
  private queue: Promise<void> = Promise.resolve();

  constructor(world: StaticWorld, public roomCode: string, name: string) {
    super(world);
    this.statusText = 'Connecting to signalling server…';
    this.peer = new Peer(peerOptions());
    this.peer.on('open', () => {
      this.statusText = 'Joining room…';
      this.notify();
      const conn = this.peer.connect(ROOM_PREFIX + roomCode.toUpperCase(), { reliable: true, serialization: 'binary' });
      this.conn = conn;
      conn.on('open', () => {
        const prev = sessionStorage.getItem(`mw.player.${roomCode}`) ?? undefined;
        conn.send({ type: 'hello', name, playerId: prev } satisfies Msg);
      });
      conn.on('data', (raw) => { const m = raw as Msg; this.queue = this.queue.then(() => this.onMessage(m)); });
      conn.on('close', () => { this.status = 'closed'; this.statusText = 'Disconnected from host'; this.notify(); });
      conn.on('error', (e) => { this.status = 'error'; this.statusText = e.message; this.notify(); });
    });
    this.peer.on('error', (err) => {
      this.status = 'error';
      this.statusText = (err as { type?: string }).type === 'peer-unavailable' ? `Room ${roomCode} not found` : `Connection failed: ${err.message}`;
      this.notify();
    });
  }

  private async onMessage(m: Msg) {
    if (m.type === 'welcome') {
      this.state = JSON.parse(await gunzip(m.data));
      this.me = m.playerId;
      sessionStorage.setItem(`mw.player.${this.roomCode}`, m.playerId);
      this.status = 'ready';
      this.statusText = '';
      this.notify();
    } else if (m.type === 'patch') {
      if (!this.state) return;
      const patch: Patch = JSON.parse(await gunzip(m.data));
      applyPatch(this.state, patch);
      this.notify();
    } else if (m.type === 'ack') {
      this.pending.get(m.id)?.(m.result);
      this.pending.delete(m.id);
    } else if (m.type === 'kicked') {
      this.status = 'error';
      this.statusText = m.reason;
      this.notify();
    }
  }

  send(cmd: AnyCommand): Promise<CommandResult> {
    if (!this.conn?.open) return Promise.resolve({ ok: false, error: 'Not connected' });
    const id = this.seq++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.conn!.send({ type: 'cmd', id, cmd } satisfies Msg);
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ ok: false, error: 'Host did not respond' }); } }, 10000);
    });
  }

  leave() {
    this.conn?.close();
    this.peer.destroy();
    this.status = 'closed';
  }
}

// ---------------- Saves ----------------

export async function serializeSave(state: GameState): Promise<Uint8Array> {
  return gzip(JSON.stringify(state));
}

export async function deserializeSave(data: Uint8Array): Promise<GameState> {
  const s = JSON.parse(await gunzip(data)) as GameState;
  if (!s.countries || !s.regions) throw new Error('Not a Modern World save');
  return s;
}

const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b: string) => Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0));

export interface SaveMeta { key: string; name: string; date: string; country: string; savedAt: number }

export async function saveToBrowser(state: GameState, name: string, country: string, dateLabel: string) {
  const data = await serializeSave(state);
  const key = `mw.save.${Date.now()}`;
  try {
    localStorage.setItem(key, toB64(data));
    const metas: SaveMeta[] = listSaves();
    metas.unshift({ key, name, date: dateLabel, country, savedAt: Date.now() });
    localStorage.setItem('mw.saves', JSON.stringify(metas.slice(0, 12)));
    for (const m of metas.slice(12)) localStorage.removeItem(m.key);
  } catch {
    throw new Error('Browser storage is full or unavailable — use "Download save" instead.');
  }
}

export function listSaves(): SaveMeta[] {
  try { return JSON.parse(localStorage.getItem('mw.saves') ?? '[]'); } catch { return []; }
}

export async function loadFromBrowser(key: string): Promise<GameState> {
  const b = localStorage.getItem(key);
  if (!b) throw new Error('Save not found');
  return deserializeSave(fromB64(b));
}

export function deleteSave(key: string) {
  localStorage.removeItem(key);
  try { localStorage.setItem('mw.saves', JSON.stringify(listSaves().filter((m) => m.key !== key))); } catch { /* ignore */ }
}
