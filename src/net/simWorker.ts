/// <reference lib="webworker" />
// Runs the authoritative simulation off the main thread and streams state
// diffs back to the page (which forwards them to remote players).
import { loadStaticWorld } from '../data/static';
import type { GameSettings, GameState } from '../sim/types';
import { Authority, type AnyCommand } from './authority';
import { StateDiffer, isEmptyPatch } from './sync';

export type WorkerIn =
  | { type: 'init'; dataUrl: string; hostName: string; settings?: GameSettings; state?: GameState }
  | { type: 'cmd'; id: number; playerId: string; cmd: AnyCommand }
  | { type: 'join'; id: number; name: string; previousId?: string }
  | { type: 'leave'; playerId: string }
  | { type: 'snapshot'; id: number };

export type WorkerOut =
  | { type: 'ready'; state: GameState }
  | { type: 'patch'; patch: ReturnType<StateDiffer['diff']> }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let authority: Authority | null = null;
const differ = new StateDiffer();
let lastStep = performance.now();
let lastPatch = 0;

const post = (m: WorkerOut) => ctx.postMessage(m);

function flush(force = false) {
  if (!authority) return;
  const now = performance.now();
  if (!force && now - lastPatch < 200) return;
  lastPatch = now;
  const patch = differ.diff(authority.state);
  if (!isEmptyPatch(patch)) post({ type: 'patch', patch });
}

ctx.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      const world = await loadStaticWorld(m.dataUrl);
      authority = new Authority(world, { hostName: m.hostName, state: m.state, settings: m.settings });
      differ.prime(authority.state);
      post({ type: 'ready', state: authority.state });
      setInterval(() => {
        const now = performance.now();
        authority!.step(now - lastStep);
        lastStep = now;
        flush();
      }, 20);
      return;
    }
    if (!authority) return;
    if (m.type === 'cmd') {
      const result = authority.apply(m.playerId, m.cmd);
      flush(true);
      post({ type: 'result', id: m.id, result });
    } else if (m.type === 'join') {
      const result = authority.join(m.name, m.previousId);
      flush(true);
      post({ type: 'result', id: m.id, result });
    } else if (m.type === 'leave') {
      authority.leave(m.playerId);
      flush(true);
    } else if (m.type === 'snapshot') {
      flush(true);
      post({ type: 'result', id: m.id, result: authority.state });
    }
  } catch (e) {
    post({ type: 'error', message: String((e as Error).stack ?? e) });
  }
};
