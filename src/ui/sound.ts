// Tiny synthesized sound cues (no audio assets); players can turn them off in the menu.
let ctx: AudioContext | null = null;
export const soundEnabled = () => { try { return localStorage.getItem('mw.sound') !== 'off'; } catch { return true; } };
export function setSoundEnabled(on: boolean) { try { localStorage.setItem('mw.sound', on ? 'on' : 'off'); } catch { /* ignore */ } }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, when = 0, slide?: number) {
  if (!soundEnabled()) return;
  try {
    ctx = ctx ?? new AudioContext();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}

export const sfx = {
  alert: () => { tone(660, 0.18, 'triangle', 0.07); tone(880, 0.25, 'triangle', 0.06, 0.12); },
  election: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.35, 'sine', 0.06, i * 0.1)); },
  war: () => { tone(110, 0.9, 'sawtooth', 0.05, 0, 55); tone(82, 1.1, 'sine', 0.08, 0.05, 41); },
  good: () => { tone(740, 0.15, 'sine', 0.05); tone(988, 0.2, 'sine', 0.05, 0.08); },
  bad: () => { tone(330, 0.25, 'triangle', 0.06, 0, 220); },
};
