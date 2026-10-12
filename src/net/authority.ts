// The authoritative game host: owns the GameState, advances time, and applies
// commands from every player. Runs inside a Web Worker (simWorker.ts) so the
// simulation never blocks rendering; also usable directly (tests).
import type { StaticWorld } from '../data/static';
import type { GameSettings, GameState } from '../sim/types';
import { createInitialState, DEFAULT_SETTINGS } from '../sim/init';
import { advanceDay } from '../sim/tick';
import { applyCommand, assignPlayerCountry, type Command, type CommandResult } from '../sim/commands';
import { addNews } from '../sim/news';
import { recomputeCountryEconomy } from '../sim/economy';
import { ensureCandidates } from '../sim/cabinet';

export type LobbyCommand =
  | { type: 'lobbyPick'; country: string | null }
  | { type: 'lobbyName'; name: string }
  | { type: 'lobbyReady'; ready: boolean }
  | { type: 'lobbySettings'; settings: Partial<GameSettings> }
  | { type: 'start' };
export type AnyCommand = Command | LobbyCommand;

/** Milliseconds of real time per simulated day for each speed setting. */
export const SPEED_MS = [0, 2000, 1000, 500, 220, 110];

export class Authority {
  state: GameState;
  private acc = 0;

  constructor(public world: StaticWorld, opts: { hostName: string; state?: GameState; settings?: GameSettings }) {
    if (opts.state) {
      this.state = opts.state;
      // the loading player becomes host; everyone else is offline until they rejoin
      for (const p of Object.values(this.state.players)) p.connected = p.id === 'host';
      if (!this.state.players.host) this.state.players.host = { id: 'host', name: opts.hostName, country: null, partyId: null, connected: true, isHost: true, ready: true };
      this.state.paused = true;
    } else {
      this.state = createInitialState(world, opts.settings ?? { ...DEFAULT_SETTINGS }, Math.floor(Math.random() * 1e9));
      this.state.players.host = { id: 'host', name: opts.hostName, country: null, partyId: null, connected: true, isHost: true, ready: false };
    }
  }

  /** Advance the clock by `dt` ms of real time. Returns the number of days simulated. */
  step(dt: number): number {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused) { this.acc = 0; return 0; }
    this.acc += Math.min(1000, dt);
    const per = SPEED_MS[s.speed] ?? 1000;
    let ran = 0;
    while (this.acc >= per && ran < 3) { this.acc -= per; advanceDay(s, this.world); ran++; }
    if (this.acc > per * 3) this.acc = 0;
    return ran;
  }

  /** A remote player says hello. Returns their id, or an error. */
  join(name: string, previousId?: string): { playerId?: string; error?: string } {
    const s = this.state;
    const existing = previousId && s.players[previousId] && !s.players[previousId].connected ? previousId : null;
    if (!existing && Object.keys(s.players).length >= 16) return { error: 'Room is full' };
    const playerId = existing ?? `p${Math.random().toString(36).slice(2, 8)}`;
    if (!existing) s.players[playerId] = { id: playerId, name: (name || 'Player').slice(0, 24), country: null, partyId: null, connected: true, isHost: false, ready: false };
    else s.players[playerId].connected = true;
    addNews(s, 'world', `${s.players[playerId].name} ${existing ? 'reconnected' : 'joined the game'}`, []);
    return { playerId };
  }

  leave(playerId: string) {
    const s = this.state;
    const p = s.players[playerId];
    if (!p) return;
    p.connected = false;
    if (s.phase === 'lobby') { assignPlayerCountry(s, playerId, null); delete s.players[playerId]; }
  }

  apply(playerId: string, cmd: AnyCommand): CommandResult {
    const s = this.state;
    const player = s.players[playerId];
    if (!player) return { ok: false, error: 'Unknown player' };
    switch (cmd.type) {
      case 'lobbyPick':
        if (s.phase === 'playing' && player.country) return { ok: false, error: 'You already lead a country' };
        if (cmd.country) {
          const holder = Object.values(s.players).find((p) => p.id !== playerId && p.country === cmd.country);
          if (holder?.connected) return { ok: false, error: 'Taken by another player' };
          // reclaim a country from a player who left (e.g. after re-hosting a saved game)
          if (holder) { assignPlayerCountry(s, holder.id, null); delete s.players[holder.id]; }
        }
        assignPlayerCountry(s, playerId, cmd.country);
        if (cmd.country) ensureCandidates(s, this.world, s.countries[cmd.country]);
        if (cmd.country && s.phase === 'playing') addNews(s, 'world', `${player.name} takes over ${s.countries[cmd.country].name}`, [cmd.country], undefined, true);
        return { ok: true };
      case 'lobbyName':
        player.name = cmd.name.slice(0, 24) || player.name;
        return { ok: true };
      case 'lobbyReady':
        player.ready = cmd.ready;
        return { ok: true };
      case 'lobbySettings': {
        if (!player.isHost || s.phase !== 'lobby') return { ok: false, error: 'Only the host can change settings before start' };
        if (cmd.settings.scenario && cmd.settings.scenario !== s.settings.scenario) {
          // Rebuild the world for the new scenario, keeping players and their picks.
          const fresh = createInitialState(this.world, { ...s.settings, ...cmd.settings }, Math.floor(Math.random() * 1e9));
          fresh.players = s.players;
          for (const p of Object.values(fresh.players)) {
            const pick = p.country;
            p.country = null; p.partyId = null;
            if (pick) { assignPlayerCountry(fresh, p.id, pick); ensureCandidates(fresh, this.world, fresh.countries[pick]); }
          }
          this.state = fresh;
          return { ok: true };
        }
        if (cmd.settings.aiAggression !== undefined && s.settings.aiAggression > 0) {
          const ratio = cmd.settings.aiAggression / s.settings.aiAggression;
          for (const c of Object.values(s.countries)) c.ai.aggression = Math.min(1.5, c.ai.aggression * ratio);
        }
        Object.assign(s.settings, cmd.settings);
        if (cmd.settings.startYear) s.startDate = `${cmd.settings.startYear}-01-01`;
        return { ok: true };
      }
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
}
