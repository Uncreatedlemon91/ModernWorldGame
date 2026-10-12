// Game sessions. The host (or a single-player game) runs the authoritative
// simulation in the browser; clients receive replicated state over WebRTC
// (PeerJS) and send commands back.
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { StaticWorld } from '../data/static';
import type { GameSettings, GameState } from '../sim/types';
import { createInitialState, DEFAULT_SETTINGS } from '../sim/init';
import { advanceDay } from '../sim/tick';
import { applyCommand, assignPlayerCountry, type Command, type CommandResult } from '../sim/commands';
import { StateDiffer, applyPatch, gzip, gunzip, isEmptyPatch, type Patch } from './sync';
import { addNews } from '../sim/news';
import { recomputeCountryEconomy } from '../sim/economy';

export type LobbyCommand =
  | { type: 'lobbyPick'; country: string | null }
  | { type: 'lobbyName'; name: string }
  | { type: 'lobbyReady'; ready: boolean }
  | { type: 'lobbySettings'; settings: Partial<GameSettings> }
  | { type: 'start' };
export type AnyCommand = Command | LobbyCommand;

/** Milliseconds of real time per simulated day for each speed setting. */
export const SPEED_MS = [0, 2000, 1000, 500, 220, 110];

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

/** Authoritative session: single-player, or the host of a multiplayer game. */
export class HostSession extends Session {
  readonly isHost = true;
  roomCode: string | null = null;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>(); // playerId -> conn
  private differ = new StateDiffer();
  private loop: number | undefined;
  private broadcastTimer: number | undefined;
  private acc = 0;
  private last = performance.now();
  onTick?: () => void;

  constructor(world: StaticWorld, opts: { name: string; multiplayer: boolean; state?: GameState; settings?: GameSettings }) {
    super(world);
    this.me = 'host';
    if (opts.state) {
      this.state = opts.state;
      // the loading player becomes host; mark everyone else disconnected
      for (const p of Object.values(this.state.players)) { p.connected = p.id === 'host'; }
      if (!this.state.players.host) this.state.players.host = { id: 'host', name: opts.name, country: null, partyId: null, connected: true, isHost: true, ready: true };
      this.state.paused = true;
    } else {
      this.state = createInitialState(world, opts.settings ?? { ...DEFAULT_SETTINGS }, Math.floor(Math.random() * 1e9));
      this.state.players.host = { id: 'host', name: opts.name, country: null, partyId: null, connected: true, isHost: true, ready: false };
    }
    if (opts.multiplayer) this.openRoom();
    else { this.status = 'ready'; }
    this.loop = window.setInterval(() => this.step(), 25);
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
    this.differ.prime(this.state);
    this.broadcastTimer = window.setInterval(() => this.broadcast(), 250);
  }

  private handleConnection(conn: DataConnection) {
    let playerId: string | null = null;
    conn.on('data', async (raw) => {
      const msg = raw as Msg;
      if (msg.type === 'hello') {
        const existing = msg.playerId && this.state.players[msg.playerId] && !this.state.players[msg.playerId].connected ? msg.playerId : null;
        if (!existing && this.state.phase === 'playing' && Object.keys(this.state.players).length >= 16) {
          conn.send({ type: 'kicked', reason: 'Room is full' } satisfies Msg);
          return;
        }
        playerId = existing ?? `p${Math.random().toString(36).slice(2, 8)}`;
        if (!existing) this.state.players[playerId] = { id: playerId, name: (msg.name || 'Player').slice(0, 24), country: null, partyId: null, connected: true, isHost: false, ready: false };
        else this.state.players[playerId].connected = true;
        this.conns.set(playerId, conn);
        const data = await gzip(JSON.stringify(this.state));
        conn.send({ type: 'welcome', playerId, data } satisfies Msg);
        addNews(this.state, 'world', `${this.state.players[playerId].name} ${existing ? 'reconnected' : 'joined the game'}`, []);
        this.notify();
      } else if (msg.type === 'cmd' && playerId) {
        const result = this.apply(playerId, msg.cmd);
        conn.send({ type: 'ack', id: msg.id, result } satisfies Msg);
      }
    });
    conn.on('close', () => {
      if (playerId && this.state.players[playerId]) {
        this.state.players[playerId].connected = false;
        if (this.state.phase === 'lobby') {
          assignPlayerCountry(this.state, playerId, null);
          delete this.state.players[playerId];
        }
        this.conns.delete(playerId);
        this.notify();
      }
    });
  }

  private async broadcast() {
    if (!this.conns.size) { this.differ.diff(this.state); return; }
    const patch = this.differ.diff(this.state);
    if (isEmptyPatch(patch)) return;
    const data = await gzip(JSON.stringify(patch));
    for (const conn of this.conns.values()) if (conn.open) conn.send({ type: 'patch', data } satisfies Msg);
  }

  private step() {
    const now = performance.now();
    const dt = Math.min(1000, now - this.last);
    this.last = now;
    if (this.state.phase !== 'playing' || this.state.paused) { this.acc = 0; return; }
    // pause automatically while the local player has an unanswered decision
    this.acc += dt;
    const per = SPEED_MS[this.state.speed] ?? 1000;
    let ran = 0;
    while (this.acc >= per && ran < 3) {
      this.acc -= per;
      advanceDay(this.state, this.world);
      ran++;
    }
    if (ran) { this.onTick?.(); this.notify(); }
    if (this.acc > per * 3) this.acc = 0;
  }

  apply(playerId: string, cmd: AnyCommand): CommandResult {
    const r = this.applyInner(playerId, cmd);
    this.notify();
    return r;
  }

  private applyInner(playerId: string, cmd: AnyCommand): CommandResult {
    const s = this.state;
    const player = s.players[playerId];
    if (!player) return { ok: false, error: 'Unknown player' };
    switch (cmd.type) {
      case 'lobbyPick':
        if (s.phase === 'playing' && player.country) return { ok: false, error: 'You already lead a country' };
        if (cmd.country && Object.values(s.players).some((p) => p.id !== playerId && p.country === cmd.country)) return { ok: false, error: 'Taken by another player' };
        assignPlayerCountry(s, playerId, cmd.country);
        if (cmd.country && s.phase === 'playing') addNews(s, 'world', `${player.name} takes over ${s.countries[cmd.country].name}`, [cmd.country], undefined, true);
        return { ok: true };
      case 'lobbyName':
        player.name = cmd.name.slice(0, 24) || player.name;
        return { ok: true };
      case 'lobbyReady':
        player.ready = cmd.ready;
        return { ok: true };
      case 'lobbySettings':
        if (!player.isHost || s.phase !== 'lobby') return { ok: false, error: 'Only the host can change settings before start' };
        if (cmd.settings.aiAggression !== undefined && s.settings.aiAggression > 0) {
          const ratio = cmd.settings.aiAggression / s.settings.aiAggression;
          for (const c of Object.values(s.countries)) c.ai.aggression = Math.min(1.5, c.ai.aggression * ratio);
        }
        Object.assign(s.settings, cmd.settings);
        if (cmd.settings.startYear) s.startDate = `${cmd.settings.startYear}-01-01`;
        return { ok: true };
      case 'start':
        if (!player.isHost) return { ok: false, error: 'Only the host can start' };
        s.phase = 'playing';
        s.paused = false;
        for (const c of Object.values(s.countries)) recomputeCountryEconomy(s, this.world, c);
        addNews(s, 'world', 'The game begins.', [], undefined, true);
        return { ok: true };
      default:
        if (s.phase !== 'playing' && cmd.type !== 'party' && cmd.type !== 'chat') return { ok: false, error: 'Game has not started' };
        return applyCommand(s, this.world, playerId, cmd);
    }
  }

  async send(cmd: AnyCommand) { return this.apply(this.me, cmd); }

  leave() {
    window.clearInterval(this.loop);
    window.clearInterval(this.broadcastTimer);
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
