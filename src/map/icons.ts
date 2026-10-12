// Procedurally drawn icon atlas (white masks, tinted per use) so the game ships
// without image assets.

const CELL = 64;
type Draw = (g: CanvasRenderingContext2D) => void;

const line = (g: CanvasRenderingContext2D, pts: [number, number][], w = 5) => {
  g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
};
const poly = (g: CanvasRenderingContext2D, pts: [number, number][]) => {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
};
const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill = true, w = 5) => {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) g.fill(); else { g.lineWidth = w; g.stroke(); }
};
const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);

const ICONS: Record<string, Draw> = {
  factory: (g) => { poly(g, [[8, 54], [8, 30], [20, 38], [20, 30], [32, 38], [32, 30], [44, 38], [44, 14], [54, 14], [54, 54]]); },
  tech: (g) => { rect(g, 18, 18, 28, 28); for (let i = 0; i < 3; i++) { rect(g, 21 + i * 9, 8, 4, 8); rect(g, 21 + i * 9, 48, 4, 8); rect(g, 8, 21 + i * 9, 8, 4); rect(g, 48, 21 + i * 9, 8, 4); } },
  farm: (g) => { for (const x of [18, 32, 46]) { line(g, [[x, 56], [x, 20]], 4); poly(g, [[x, 10], [x + 6, 22], [x, 30], [x - 6, 22]]); } },
  mine: (g) => { line(g, [[14, 52], [46, 20]], 6); g.lineWidth = 6; g.beginPath(); g.arc(46, 34, 22, -Math.PI * 0.95, -Math.PI * 0.35); g.stroke(); },
  oil: (g) => { line(g, [[20, 56], [32, 8], [44, 56]], 5); line(g, [[24, 40], [40, 40]], 4); line(g, [[27, 26], [37, 26]], 4); rect(g, 12, 54, 40, 5); },
  power: (g) => { poly(g, [[36, 4], [14, 36], [30, 36], [24, 60], [50, 26], [34, 26]]); },
  nuclear: (g) => { circle(g, 32, 32, 6); for (let k = 0; k < 3; k++) { const a = k * (Math.PI * 2 / 3) - Math.PI / 2; g.beginPath(); g.moveTo(32, 32); g.arc(32, 32, 26, a - 0.5, a + 0.5); g.closePath(); g.fill(); } g.globalCompositeOperation = 'destination-out'; circle(g, 32, 32, 10); g.globalCompositeOperation = 'source-over'; circle(g, 32, 32, 5); },
  solar: (g) => { poly(g, [[8, 44], [18, 18], [56, 18], [46, 44]]); g.globalCompositeOperation = 'destination-out'; line(g, [[27, 18], [21, 44]], 3); line(g, [[37, 18], [31, 44]], 3); line(g, [[13, 31], [51, 31]], 3); g.globalCompositeOperation = 'source-over'; line(g, [[32, 44], [32, 58]], 4); },
  port: (g) => { circle(g, 32, 12, 6, false, 4); line(g, [[32, 18], [32, 56]], 5); line(g, [[20, 26], [44, 26]], 5); g.lineWidth = 5; g.beginPath(); g.arc(32, 36, 20, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); },
  airport: (g) => { poly(g, [[32, 4], [37, 22], [58, 34], [58, 39], [37, 33], [36, 48], [44, 55], [44, 59], [32, 55], [20, 59], [20, 55], [28, 48], [27, 33], [6, 39], [6, 34], [27, 22]]); },
  road: (g) => { poly(g, [[22, 6], [42, 6], [56, 58], [8, 58]]); g.globalCompositeOperation = 'destination-out'; for (let y = 12; y < 56; y += 14) rect(g, 30, y, 4, 8); g.globalCompositeOperation = 'source-over'; },
  rail: (g) => { line(g, [[22, 4], [14, 60]], 4); line(g, [[42, 4], [50, 60]], 4); for (let y = 10; y < 60; y += 10) line(g, [[16 - y * 0.05, y], [48 + y * 0.05, y]], 3); },
  housing: (g) => { poly(g, [[32, 8], [58, 30], [52, 30], [52, 56], [12, 56], [12, 30], [6, 30]]); g.globalCompositeOperation = 'destination-out'; rect(g, 27, 38, 10, 18); g.globalCompositeOperation = 'source-over'; },
  university: (g) => { poly(g, [[32, 6], [60, 22], [4, 22]]); for (const x of [12, 24, 36, 48]) rect(g, x, 26, 5, 24); rect(g, 6, 52, 52, 6); },
  hospital: (g) => { rect(g, 24, 8, 16, 48); rect(g, 8, 24, 48, 16); },
  base: (g) => { const pts: [number, number][] = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push([32 + Math.cos(a) * r, 33 + Math.sin(a) * r]); } poly(g, pts); },
  airbase: (g) => { poly(g, [[32, 14], [60, 30], [60, 36], [36, 30], [32, 52], [28, 30], [4, 36], [4, 30]]); circle(g, 32, 50, 6); },
  navalbase: (g) => { ICONS.port(g); },
  arms: (g) => { poly(g, [[24, 58], [24, 22], [32, 6], [40, 22], [40, 58]]); g.globalCompositeOperation = 'destination-out'; rect(g, 24, 44, 16, 3); g.globalCompositeOperation = 'source-over'; },
  fort: (g) => { poly(g, [[8, 58], [8, 16], [18, 16], [18, 24], [26, 24], [26, 16], [38, 16], [38, 24], [46, 24], [46, 16], [56, 16], [56, 58]]); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(32, 58, 9, Math.PI, 0); g.fill(); g.globalCompositeOperation = 'source-over'; },
  sam: (g) => { poly(g, [[44, 6], [52, 14], [24, 42], [16, 34]]); poly(g, [[16, 34], [24, 42], [14, 46], [12, 38]]); rect(g, 6, 50, 52, 8); },
  // events
  hurricane: (g) => { g.lineWidth = 6; g.lineCap = 'round'; for (let k = 0; k < 2; k++) { g.beginPath(); for (let t = 0; t < 1; t += 0.02) { const a = t * Math.PI * 2.2 + k * Math.PI; const r = 4 + t * 24; const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); } circle(g, 32, 32, 6); },
  earthquake: (g) => { line(g, [[4, 32], [14, 32], [20, 14], [28, 50], [36, 10], [44, 46], [50, 32], [60, 32]], 5); },
  wildfire: (g) => { g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(48, 20, 56, 34, 50, 48); g.bezierCurveTo(46, 58, 18, 60, 14, 48); g.bezierCurveTo(10, 36, 20, 30, 22, 18); g.bezierCurveTo(28, 26, 30, 30, 32, 4); g.fill(); },
  flood: (g) => { for (const y of [20, 34, 48]) { g.lineWidth = 5; g.beginPath(); for (let x = 4; x <= 60; x += 2) { const yy = y + Math.sin(x / 6) * 4; if (x === 4) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke(); } },
  protest: (g) => { poly(g, [[8, 26], [36, 12], [36, 50], [8, 36]]); rect(g, 38, 20, 6, 22); line(g, [[14, 38], [20, 56]], 6); line(g, [[50, 18], [58, 12]], 4); line(g, [[50, 31], [60, 31]], 4); line(g, [[50, 44], [58, 50]], 4); },
  riot: (g) => { ICONS.wildfire(g); g.globalCompositeOperation = 'destination-out'; rect(g, 29, 26, 6, 16); rect(g, 29, 46, 6, 6); g.globalCompositeOperation = 'source-over'; },
  terror: (g) => { const pts: [number, number][] = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? 12 : 28; const a = i * Math.PI / 8; pts.push([32 + Math.cos(a) * r, 32 + Math.sin(a) * r]); } poly(g, pts); },
  epidemic: (g) => { circle(g, 32, 32, 15); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(g, [[32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14], [32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25]], 4); circle(g, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 4); } },
  boom: (g) => { line(g, [[6, 50], [22, 34], [32, 42], [54, 16]], 6); poly(g, [[44, 12], [58, 10], [56, 24]]); },
  construction: (g) => { line(g, [[16, 60], [16, 8], [56, 8]], 5); line(g, [[16, 16], [26, 8]], 4); line(g, [[48, 8], [48, 30]], 3); rect(g, 42, 30, 12, 10); rect(g, 8, 56, 18, 5); },
  strike: (g) => { line(g, [[14, 14], [50, 50]], 9); line(g, [[50, 14], [14, 50]], 9); },
  discovery: (g) => { poly(g, [[32, 58], [6, 26], [18, 10], [46, 10], [58, 26]]); },
  battle: (g) => { line(g, [[12, 12], [52, 52]], 7); line(g, [[52, 12], [12, 52]], 7); line(g, [[8, 20], [20, 8]], 5); line(g, [[44, 8], [56, 20]], 5); },
  // vehicles (pointing up / north)
  ship: (g) => { poly(g, [[32, 2], [42, 16], [42, 58], [22, 58], [22, 16]]); g.globalCompositeOperation = 'destination-out'; rect(g, 26, 20, 12, 6); rect(g, 26, 30, 12, 6); rect(g, 26, 40, 12, 6); g.globalCompositeOperation = 'source-over'; },
  tanker: (g) => { poly(g, [[32, 4], [40, 14], [40, 60], [24, 60], [24, 14]]); },
  plane: (g) => { poly(g, [[32, 2], [36, 20], [60, 34], [60, 40], [36, 34], [35, 50], [44, 58], [44, 62], [32, 58], [20, 62], [20, 58], [29, 50], [28, 34], [4, 40], [4, 34], [28, 20]]); },
  warship: (g) => { poly(g, [[32, 2], [40, 18], [38, 60], [26, 60], [24, 18]]); g.globalCompositeOperation = 'destination-out'; circle(g, 32, 22, 3); circle(g, 32, 46, 3); g.globalCompositeOperation = 'source-over'; },
  // unit counters
  unit_land: (g) => { line(g, [[12, 18], [52, 46]], 6); line(g, [[52, 18], [12, 46]], 6); },
  unit_armor: (g) => { g.lineWidth = 6; g.beginPath(); g.ellipse(32, 32, 18, 10, 0, 0, Math.PI * 2); g.stroke(); },
  unit_air: (g) => { g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, 38); g.quadraticCurveTo(22, 20, 32, 36); g.quadraticCurveTo(42, 20, 52, 38); g.stroke(); },
  unit_naval: (g) => { poly(g, [[10, 32], [54, 32], [46, 44], [18, 44]]); rect(g, 27, 20, 10, 12); },
  unit_bg: (g) => { g.beginPath(); g.roundRect(2, 10, 60, 44, 8); g.fill(); },
  dot: (g) => { circle(g, 32, 32, 26); },
  ring: (g) => { circle(g, 32, 32, 24, false, 6); },
  capital: (g) => { const pts: [number, number][] = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]); } poly(g, pts); },
};

export interface IconAtlas { url: string; mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean; anchorY?: number }> }

let atlas: IconAtlas | null = null;

export function getIconAtlas(): IconAtlas {
  if (atlas) return atlas;
  const names = Object.keys(ICONS);
  const cols = 8;
  const rows = Math.ceil(names.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL; canvas.height = rows * CELL;
  const g = canvas.getContext('2d')!;
  const mapping: IconAtlas['mapping'] = {};
  names.forEach((name, i) => {
    const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
    g.save();
    g.translate(x, y);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    ICONS[name](g);
    g.restore();
    mapping[name] = { x, y, width: CELL, height: CELL, mask: true };
  });
  atlas = { url: canvas.toDataURL(), mapping };
  return atlas;
}

/** Small data-URL icon for use in the HTML UI. */
const cache = new Map<string, string>();
export function iconDataUrl(name: string, color = '#fff', size = 32): string {
  const key = `${name}|${color}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const draw = ICONS[name];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  if (draw) {
    g.scale(size / CELL, size / CELL);
    g.fillStyle = color; g.strokeStyle = color;
    draw(g);
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export const BUILDING_ICON_COLOR: Record<string, [number, number, number]> = {
  factory: [255, 170, 80], tech: [120, 200, 255], farm: [160, 220, 100], mine: [200, 170, 140], oil: [80, 80, 80],
  power: [255, 230, 90], nuclear: [190, 255, 120], solar: [120, 230, 200], port: [110, 170, 255], airport: [220, 220, 255],
  road: [230, 230, 230], rail: [210, 190, 255], housing: [255, 210, 160], university: [200, 180, 255], hospital: [255, 110, 110],
  base: [140, 200, 120], airbase: [150, 200, 240], navalbase: [100, 160, 230], arms: [230, 150, 100], fort: [190, 190, 160], sam: [255, 140, 140],
};

export const EVENT_COLOR: Record<string, [number, number, number]> = {
  hurricane: [120, 200, 255], earthquake: [255, 180, 90], wildfire: [255, 110, 40], flood: [80, 160, 255], protest: [255, 220, 80],
  riot: [255, 80, 60], terror: [255, 60, 60], epidemic: [170, 255, 120], boom: [90, 230, 140], construction: [255, 200, 90],
  strike: [255, 160, 90], discovery: [120, 255, 230], nuclear: [255, 255, 120],
};

/** All icon names in the atlas. */
export const ICON_NAMES = Object.keys(ICONS);

/**
 * Render an icon as a signed-distance-field image for MapLibre (`sdf: true`),
 * so a single white glyph can be tinted per feature with `icon-color`.
 */
export function iconSdf(name: string, size = 64): { width: number; height: number; data: Uint8Array } {
  const pad = 6;
  const full = size + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = full;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.translate(pad, pad);
  g.scale(size / CELL, size / CELL);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  ICONS[name]?.(g);
  const src = g.getImageData(0, 0, full, full).data;
  const inside = new Uint8Array(full * full);
  for (let i = 0; i < inside.length; i++) inside[i] = src[i * 4 + 3] > 127 ? 1 : 0;
  const R = 6;
  const out = new Uint8Array(full * full * 4);
  for (let y = 0; y < full; y++) {
    for (let x = 0; x < full; x++) {
      const me = inside[y * full + x];
      let best = R * R + 1;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= full) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= full) continue;
          if (inside[yy * full + xx] !== me) { const d = dx * dx + dy * dy; if (d < best) best = d; }
        }
      }
      const dist = (Math.sqrt(best) - 0.5) * (me ? -1 : 1); // signed, negative inside
      const a = Math.max(0, Math.min(255, Math.round(255 * (1 - (dist / R + 0.25)))));
      const o = (y * full + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = a;
    }
  }
  return { width: full, height: full, data: out };
}
