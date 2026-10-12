// Builds the static world data the game ships with, from Natural Earth (public domain)
// and NASA Blue Marble imagery. Output goes to public/data and public/tiles.
//
//   node scripts/build-data.mjs
//
// Raw downloads are cached in .data-cache/ (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import sharp from 'sharp';
import * as topojson from 'topojson-client';
import { geoBounds, geoContains, geoCentroid, geoArea, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, '.data-cache');
const OUT = path.join(ROOT, 'public', 'data');
const TILES = path.join(ROOT, 'public', 'tiles');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const IMG = 'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img';
const SOURCES = {
  'ne_10m_admin_1_states_provinces.geojson': `${NE}/ne_10m_admin_1_states_provinces.geojson`,
  'ne_10m_admin_0_countries.geojson': `${NE}/ne_10m_admin_0_countries.geojson`,
  'ne_10m_populated_places_simple.geojson': `${NE}/ne_10m_populated_places_simple.geojson`,
  'ne_10m_ports.geojson': `${NE}/ne_10m_ports.geojson`,
  'ne_10m_airports.geojson': `${NE}/ne_10m_airports.geojson`,
  'ne_10m_roads.geojson': `${NE}/ne_10m_roads.geojson`,
  'ne_10m_railroads.geojson': `${NE}/ne_10m_railroads.geojson`,
  'bluemarble.jpg': `${IMG}/earth-blue-marble.jpg`,
  'topo.png': `${IMG}/earth-topology.png`,
  'night.jpg': `${IMG}/earth-night.jpg`,
};

async function fetchAll() {
  for (const [file, url] of Object.entries(SOURCES)) {
    const p = path.join(CACHE, file);
    if (fs.existsSync(p)) continue;
    console.log('downloading', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// How each subdivided country groups its admin-1 units into playable regions.
// 'name' = one region per admin-1 unit, 'region' = merge by Natural Earth's region field.
const GROUPING = {
  USA: 'name', CAN: 'name', MEX: 'name', BRA: 'name', ARG: 'name', GBR: 'region', FRA: 'region',
  DEU: 'name', ITA: 'region', ESP: 'region', POL: 'name', UKR: 'name', RUS: 'name', TUR: 'name',
  IRN: 'name', SAU: 'name', EGY: 'name', NGA: 'name', ZAF: 'name', IND: 'name', PAK: 'name',
  CHN: 'name', JPN: 'region', KOR: 'name', IDN: 'name', AUS: 'name', KAZ: 'name', COL: 'name',
  PER: 'name', VEN: 'name', CHL: 'name', ETH: 'name', COD: 'name', DZA: 'region', MNG: 'name',
  SWE: 'name', NOR: 'name', FIN: 'name', THA: 'region', VNM: 'region', PHL: 'region', MYS: 'name',
  IRQ: 'name', SYR: 'name', AFG: 'region', MAR: 'region', SDN: 'name', LBY: 'region', BOL: 'name',
  KEN: 'region', TZA: 'region', AGO: 'name', MMR: 'name', PRK: 'name', ISR: 'name', ROU: 'region',
  NLD: 'name', BEL: 'region', GRC: 'region', PRT: 'region', AUT: 'name', CHE: 'region', CZE: 'name',
  BGD: 'region', UZB: 'name', TWN: 'region',
};
const SKIP_COUNTRIES = new Set(['ATA', 'ATF', 'HMD', 'SGS', 'IOA', 'BRI', 'CLP', 'CSI', 'KAB', 'ESB', 'WSB', 'SPI', 'USG', 'SCR', 'BJN', 'SER', 'PGA']);

async function buildRegions() {
  log('reading admin-1');
  const adm1 = readJson('ne_10m_admin_1_states_provinces.geojson');
  const feats = [];
  for (const f of adm1.features) {
    const p = f.properties;
    const c = p.adm0_a3;
    if (SKIP_COUNTRIES.has(c) || !f.geometry) continue;
    const mode = GROUPING[c];
    let key, name;
    if (!mode) { key = c; name = p.admin; }
    else if (mode === 'region') { name = p.region || p.name || p.admin; key = `${c}:${name}`; }
    else { name = p.name || p.admin; key = `${c}:${name}`; }
    feats.push({ type: 'Feature', geometry: f.geometry, properties: { key, c, n: name } });
  }
  log('dissolving', feats.length, 'admin-1 units');
  const input = { 'in.json': { type: 'FeatureCollection', features: feats } };
  const out = await mapshaper.applyCommands(
    '-i in.json name=regions -dissolve key copy-fields=c,n -simplify 6% keep-shapes stats -filter-slivers min-area=20km2 -o out.json format=topojson quantization=60000',
    input,
  );
  const topo = JSON.parse(out['out.json']);
  const geoms = topo.objects.regions.geometries.filter((g) => g.type);
  topo.objects.regions.geometries = geoms;
  geoms.forEach((g, i) => { g.properties = { id: i, c: g.properties.c, n: g.properties.n }; g.id = i; });
  log('regions', geoms.length);
  return topo;
}

function wrapLon(l) { while (l > 180) l -= 360; while (l < -180) l += 360; return l; }

async function main() {
  await fetchAll();
  const topo = await buildRegions();
  const fc = topojson.feature(topo, topo.objects.regions);
  const regionFeatures = fc.features;
  const R = 6371;

  // Spatial index: bounding boxes for point-in-region.
  const bboxes = regionFeatures.map((f) => geoBounds(f));
  const inBox = (b, lon, lat) => {
    const [[x0, y0], [x1, y1]] = b;
    if (lat < y0 - 0.01 || lat > y1 + 0.01) return false;
    if (x0 <= x1) return lon >= x0 - 0.01 && lon <= x1 + 0.01;
    return lon >= x0 - 0.01 || lon <= x1 + 0.01; // crosses antimeridian
  };
  const regionAt = (lon, lat) => {
    for (let i = 0; i < regionFeatures.length; i++) {
      if (inBox(bboxes[i], lon, lat) && geoContains(regionFeatures[i], [lon, lat])) return i;
    }
    return -1;
  };

  // ---- Land/ocean grid at 0.5 degrees (also assigns grid cells to regions) ----
  log('rasterising land grid');
  const RES = 0.5, GW = 720, GH = 360;
  const cellRegion = new Int16Array(GW * GH).fill(-1);
  // Coarse first pass per region bbox for speed.
  for (let i = 0; i < regionFeatures.length; i++) {
    const [[x0, y0], [x1, y1]] = bboxes[i];
    const ranges = x0 <= x1 ? [[x0, x1]] : [[x0, 180], [-180, x1]];
    const gy0 = Math.max(0, Math.floor((90 - y1) / RES)), gy1 = Math.min(GH - 1, Math.floor((90 - y0) / RES));
    for (const [a, b] of ranges) {
      const gx0 = Math.max(0, Math.floor((a + 180) / RES)), gx1 = Math.min(GW - 1, Math.floor((b + 180) / RES));
      for (let gy = gy0; gy <= gy1; gy++) {
        const lat = 90 - (gy + 0.5) * RES;
        for (let gx = gx0; gx <= gx1; gx++) {
          const idx = gy * GW + gx;
          if (cellRegion[idx] !== -1) continue;
          const lon = -180 + (gx + 0.5) * RES;
          if (geoContains(regionFeatures[i], [lon, lat])) cellRegion[idx] = i;
        }
      }
    }
  }
  // Antarctica is not a region but is land for shipping purposes.
  const land = new Uint8Array(GW * GH);
  for (let i = 0; i < land.length; i++) land[i] = cellRegion[i] >= 0 ? 1 : 0;
  for (let gy = Math.floor((90 + 60) / RES); gy < GH; gy++) for (let gx = 0; gx < GW; gx++) land[gy * GW + gx] = 1;
  for (let gx = 0; gx < GW; gx++) { land[gx] = 1; land[GW + gx] = 1; } // north pole cap
  // Canals and straits too narrow for the grid.
  const forceWater = [
    [[32.35, 31.4], [32.3, 30.5], [32.55, 29.9], [32.6, 29.5]], // Suez
    [[-79.95, 9.45], [-79.7, 9.15], [-79.55, 8.9], [-79.5, 8.7]], // Panama
    [[26.2, 40.0], [26.7, 40.4], [27.5, 40.7], [28.9, 41.0], [29.1, 41.3], [29.2, 41.5]], // Dardanelles/Bosporus
    [[-6.2, 35.95], [-5.6, 35.95], [-5.0, 36.0]], // Gibraltar
    [[10.6, 55.9], [11.2, 56.5], [12.6, 56.0], [12.7, 55.5]], // Danish straits
    [[1.4, 51.0], [1.6, 50.8]], // Dover
    [[103.5, 1.2], [104.2, 1.2], [104.5, 1.4]], // Singapore strait
    [[56.3, 26.6], [56.5, 26.2]], // Hormuz
    [[43.3, 12.6], [43.5, 12.3]], // Bab-el-Mandeb
    [[140.6, 41.4], [141.0, 41.5]], // Tsugaru
  ];
  const setWater = (lon, lat) => {
    const gx = Math.floor((wrapLon(lon) + 180) / RES), gy = Math.floor((90 - lat) / RES);
    if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) land[gy * GW + gx] = 0;
  };
  for (const line of forceWater) {
    for (let k = 0; k < line.length - 1; k++) {
      const [a, b] = [line[k], line[k + 1]];
      for (let s = 0; s <= 20; s++) setWater(a[0] + (b[0] - a[0]) * s / 20, a[1] + (b[1] - a[1]) * s / 20);
    }
  }

  // ---- Elevation and vegetation from imagery, for terrain types ----
  log('sampling imagery');
  const topoImg = await sharp(path.join(CACHE, 'topo.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const bmImg = await sharp(path.join(CACHE, 'bluemarble.jpg')).raw().toBuffer({ resolveWithObject: true });
  const nightImg = await sharp(path.join(CACHE, 'night.jpg')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sampleImg = (img, lon, lat) => {
    const { width, height, channels } = img.info;
    const x = Math.min(width - 1, Math.max(0, Math.floor((lon + 180) / 360 * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((90 - lat) / 180 * height)));
    const o = (y * width + x) * channels;
    return Array.from(img.data.subarray(o, o + channels));
  };

  // ---- Regions: centroid, area, terrain ----
  const regionCells = regionFeatures.map(() => []);
  for (let i = 0; i < cellRegion.length; i++) if (cellRegion[i] >= 0) regionCells[cellRegion[i]].push(i);
  const regions = regionFeatures.map((f, i) => {
    let geom = f.geometry;
    let largest = geom;
    if (geom.type === 'MultiPolygon') {
      let best = -1;
      for (const poly of geom.coordinates) {
        const a = geoArea({ type: 'Polygon', coordinates: poly });
        if (a > best) { best = a; largest = { type: 'Polygon', coordinates: poly }; }
      }
    }
    let [lon, lat] = geoCentroid(largest);
    if (!geoContains(largest, [lon, lat]) && regionCells[i].length) {
      // nearest grid cell inside the region
      let bestD = Infinity, bc = null;
      for (const c of regionCells[i]) {
        const cl = -180 + ((c % GW) + 0.5) * RES, ct = 90 - (Math.floor(c / GW) + 0.5) * RES;
        const d = geoDistance([lon, lat], [cl, ct]);
        if (d < bestD) { bestD = d; bc = [cl, ct]; }
      }
      [lon, lat] = bc;
    }
    const area = geoArea(f) * R * R;
    const pts = regionCells[i].length
      ? regionCells[i].map((c) => [-180 + ((c % GW) + 0.5) * RES, 90 - (Math.floor(c / GW) + 0.5) * RES])
      : [[lon, lat]];
    let elev = 0, green = 0, bright = 0, absLat = 0, light = 0;
    for (const [x, y] of pts) {
      for (let k = 0; k < 4; k++) light += Math.max(0, sampleImg(nightImg, x + ((k & 1) - 0.5) * RES / 2, y + ((k >> 1) - 0.5) * RES / 2)[0] - 55);
      elev += sampleImg(topoImg, x, y)[0];
      const [r, g, b] = sampleImg(bmImg, x, y);
      green += (g - r) + (g - b) * 0.3;
      bright += (r + g + b) / 3;
      absLat += Math.abs(y);
    }
    elev /= pts.length; green /= pts.length; bright /= pts.length; absLat /= pts.length;
    let terrain = 'plains';
    if (absLat > 62 || bright > 200) terrain = 'arctic';
    else if (elev > 95) terrain = 'mountains';
    else if (bright > 120 && green < 0) terrain = 'desert';
    else if (absLat < 15 && green > 5) terrain = 'jungle';
    else if (green > 8) terrain = 'forest';
    else if (elev > 60) terrain = 'hills';
    // light is used to weight population below; normalise by sample count then scale by area
    const lightPerCell = light / (pts.length * 4);
    return { id: i, c: f.properties.c, n: f.properties.n, lon: round(lon), lat: round(lat), area: Math.round(area), terrain, elev: Math.round(elev), _light: lightPerCell * area };
  });

  // ---- Adjacency + border arcs ----
  log('adjacency');
  const neighbors = topojson.neighbors(topo.objects.regions.geometries);
  regions.forEach((r, i) => { r.nb = neighbors[i]; });
  // Coastal: region touches an ocean grid cell (or an arc used by only one region)
  const arcUse = new Map();
  const walkArcs = (g, fn) => {
    const rec = (a) => Array.isArray(a) ? a.forEach(rec) : fn(a < 0 ? ~a : a);
    rec(g.arcs);
  };
  topo.objects.regions.geometries.forEach((g, i) => walkArcs(g, (a) => {
    if (!arcUse.has(a)) arcUse.set(a, new Set());
    arcUse.get(a).add(i);
  }));
  const coastal = new Uint8Array(regions.length);
  for (const [, s] of arcUse) if (s.size === 1) for (const i of s) coastal[i] = 1;
  regions.forEach((r, i) => { r.coastal = coastal[i] === 1; });

  // Border line geometry: each arc tagged with the regions on either side.
  const borderFeatures = [];
  for (const [arc, s] of arcUse) {
    const ids = [...s];
    const line = topojson.mesh(topo, { type: 'LineString', arcs: [arc] });
    const coords = line.coordinates.map((ls) => ls.map(([x, y]) => [round(x, 3), round(y, 3)]));
    borderFeatures.push({ a: ids[0], b: ids.length > 1 ? ids[1] : -1, p: coords.length === 1 ? coords[0] : coords.flat() });
  }

  // ---- Countries ----
  log('countries');
  const adm0 = readJson('ne_10m_admin_0_countries.geojson');
  const meta = new Map();
  for (const f of adm0.features) {
    const p = f.properties;
    meta.set(p.ADM0_A3, {
      name: p.NAME, formal: p.FORMAL_EN || p.NAME_LONG || p.NAME, iso2: p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : (p.ISO_A2 !== '-99' ? p.ISO_A2 : ''),
      pop: p.POP_EST, gdp: p.GDP_MD, continent: p.CONTINENT, subregion: p.SUBREGION, income: p.INCOME_GRP, economy: p.ECONOMY,
      sov: p.SOV_A3, mapcolor: p.MAPCOLOR9,
    });
  }
  const countryCodes = [...new Set(regions.map((r) => r.c))];
  const countries = countryCodes.map((c) => {
    const m = meta.get(c) || { name: c, formal: c, iso2: '', pop: 100000, gdp: 1000, continent: 'Unknown', subregion: '', income: '4. Lower middle income', economy: '6. Developing region', sov: c, mapcolor: 1 };
    return { a3: c, ...m, regions: regions.filter((r) => r.c === c).map((r) => r.id) };
  });

  // ---- Cities ----
  log('cities');
  const places = readJson('ne_10m_populated_places_simple.geojson').features
    .map((f) => f.properties)
    .filter((p) => p.pop_max >= 120000 || p.adm0cap === 1 || p.worldcity === 1 || p.scalerank <= 3)
    .sort((a, b) => b.pop_max - a.pop_max);
  const cities = [];
  for (const p of places) {
    let r = regionAt(p.longitude, p.latitude);
    if (r < 0) {
      // snap to nearest region centroid in the same country (coastal cities on simplified coastlines)
      let best = Infinity;
      for (const reg of regions) {
        if (reg.c !== p.adm0_a3 && reg.c !== p.sov_a3) continue;
        const d = geoDistance([reg.lon, reg.lat], [p.longitude, p.latitude]);
        if (d < best) { best = d; r = reg.id; }
      }
      if (r < 0 || best > 0.08) continue;
    }
    cities.push({ n: p.nameascii || p.name, lon: round(p.longitude), lat: round(p.latitude), pop: p.pop_max, r, cap: p.adm0cap === 1 ? 1 : 0 });
  }
  log('cities kept', cities.length);

  // ---- Population per region: city weight + area weight ----
  for (const c of countries) {
    const regs = c.regions.map((id) => regions[id]);
    const totalArea = regs.reduce((s, r) => s + r.area, 0) || 1;
    const cityPop = new Map();
    for (const city of cities) if (regions[city.r].c === c.a3) cityPop.set(city.r, (cityPop.get(city.r) || 0) + city.pop);
    const totalCity = [...cityPop.values()].reduce((s, v) => s + v, 0);
    const terrainFactor = { plains: 1, forest: 0.7, hills: 0.8, jungle: 0.5, mountains: 0.35, desert: 0.12, arctic: 0.03 };
    const totalLight = regs.reduce((s, r) => s + r._light, 0) || 1;
    const totalAreaW = regs.reduce((s, r) => s + r.area * terrainFactor[r.terrain], 0) || 1;
    const weights = regs.map((r) => 0.5 * ((cityPop.get(r.id) || 0) / (totalCity || 1)) + 0.44 * (r._light / totalLight) + 0.06 * (r.area * terrainFactor[r.terrain] / totalAreaW));
    const tw = weights.reduce((s, v) => s + v, 0) || 1;
    regs.forEach((r, k) => { r.pop = Math.max(1000, Math.round(c.pop * weights[k] / tw)); });
  }
  for (const r of regions) delete r._light;

  // ---- Ports & airports ----
  log('ports & airports');
  const portsRaw = readJson('ne_10m_ports.geojson').features;
  const ports = [];
  for (const f of portsRaw) {
    const [lon, lat] = f.geometry.coordinates;
    let r = regionAt(lon, lat), best = Infinity;
    if (r < 0) {
      for (const reg of regions) {
        if (!reg.coastal) continue;
        const d = geoDistance([reg.lon, reg.lat], [lon, lat]);
        if (d < best) { best = d; r = reg.id; }
      }
    }
    if (r < 0) continue;
    ports.push({ n: f.properties.name, lon: round(lon), lat: round(lat), r, size: Math.max(1, 10 - f.properties.scalerank) });
  }
  const airportsRaw = readJson('ne_10m_airports.geojson').features;
  const airports = [];
  for (const f of airportsRaw) {
    const p = f.properties;
    if (!(p.type === 'major' || (p.type === 'mid' && p.scalerank <= 7)) || p.location === 'military') continue;
    const [lon, lat] = f.geometry.coordinates;
    const r = regionAt(lon, lat);
    if (r < 0) continue;
    airports.push({ n: p.name, code: p.iata_code || p.abbrev, lon: round(lon), lat: round(lat), r, size: p.type === 'major' ? 3 : 1 });
  }
  log('ports', ports.length, 'airports', airports.length);

  // ---- Sea routes between major ports (A* over the ocean grid) ----
  log('sea routes');
  const cellOf = (lon, lat) => [Math.floor((wrapLon(lon) + 180) / RES), Math.min(GH - 1, Math.max(0, Math.floor((90 - lat) / RES)))];
  const cellLL = (gx, gy) => [-180 + (gx + 0.5) * RES, 90 - (gy + 0.5) * RES];
  const nearestWater = (lon, lat) => {
    const [cx, cy] = cellOf(lon, lat);
    for (let rad = 0; rad < 12; rad++) {
      let best = null, bd = Infinity;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const gx = (cx + dx + GW) % GW, gy = cy + dy;
        if (gy < 0 || gy >= GH || land[gy * GW + gx]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = gy * GW + gx; }
      }
      if (best !== null) return best;
    }
    return -1;
  };
  const hav = (a, b) => {
    const lon1 = (-180 + ((a % GW) + 0.5) * RES) * Math.PI / 180, lat1 = (90 - (Math.floor(a / GW) + 0.5) * RES) * Math.PI / 180;
    const lon2 = (-180 + ((b % GW) + 0.5) * RES) * Math.PI / 180, lat2 = (90 - (Math.floor(b / GW) + 0.5) * RES) * Math.PI / 180;
    const s1 = Math.sin((lat2 - lat1) / 2), s2 = Math.sin((lon2 - lon1) / 2);
    return 2 * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2)));
  };
  const gBuf = new Float64Array(GW * GH), cameBuf = new Int32Array(GW * GH), stamp = new Int32Array(GW * GH);
  let gen = 0;
  function astar(start, goal) {
    gen++;
    const CLOSED = -2;
    const g = { get: (n) => (stamp[n] === gen || stamp[n] === -gen ? gBuf[n] : Infinity) };
    const isClosed = (n) => stamp[n] === -gen;
    const setG = (n, v, c) => { gBuf[n] = v; cameBuf[n] = c; stamp[n] = gen; };
    // binary heap
    const heap = []; const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    setG(start, 0, -1); push(start, hav(start, goal));
    let found = false;
    while (heap.length) {
      const cur = pop();
      if (cur === goal) { found = true; break; }
      if (isClosed(cur)) continue;
      stamp[cur] = -gen;
      const cx = cur % GW, cy = Math.floor(cur / GW);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ny = cy + dy; if (ny < 0 || ny >= GH) continue;
        const nx = (cx + dx + GW) % GW; const n = ny * GW + nx;
        if (land[n] || isClosed(n)) continue;
        // discourage hugging coasts a little
        let coastPenalty = 1;
        for (let k = 0; k < 4; k++) { const ox = (nx + [1, -1, 0, 0][k] + GW) % GW, oy = ny + [0, 0, 1, -1][k]; if (oy >= 0 && oy < GH && land[oy * GW + ox]) { coastPenalty = 1.15; break; } }
        const ng = g.get(cur) + hav(cur, n) * coastPenalty;
        if (ng < g.get(n)) { setG(n, ng, cur); push(n, ng + hav(n, goal)); }
      }
    }
    if (!found && start !== goal) return null;
    void CLOSED;
    const pathCells = [goal];
    let c = goal; while (c !== start) { c = cameBuf[c]; pathCells.push(c); }
    return pathCells.reverse();
  }
  // line of sight over water for path smoothing
  const los = (a, b) => {
    const [x1, y1] = cellLL(a % GW, Math.floor(a / GW)), [x2, y2] = cellLL(b % GW, Math.floor(b / GW));
    let dxl = x2 - x1; if (dxl > 180) dxl -= 360; if (dxl < -180) dxl += 360;
    const steps = Math.ceil(Math.max(Math.abs(dxl), Math.abs(y2 - y1)) / (RES / 3)) + 1;
    for (let s = 0; s <= steps; s++) {
      const [gx, gy] = cellOf(x1 + dxl * s / steps, y1 + (y2 - y1) * s / steps);
      if (land[gy * GW + gx]) return false;
    }
    return true;
  };
  const smooth = (cells) => {
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = Math.min(cells.length - 1, i + 60);
      while (j > i + 1 && !los(cells[i], cells[j])) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  };
  const majorPorts = ports.map((p, i) => ({ ...p, i })).filter((p) => p.size >= 4).sort((a, b) => b.size - a.size);
  const hubSet = majorPorts.slice(0, 160);
  const routes = [];
  const seen = new Set();
  const hubWater = hubSet.map((p) => nearestWater(p.lon, p.lat));
  for (let a = 0; a < hubSet.length; a++) {
    if (hubWater[a] < 0) continue;
    // connect to 3 near hubs and 3 far hubs (long haul)
    const others = hubSet.map((p, b) => ({ b, d: geoDistance([hubSet[a].lon, hubSet[a].lat], [p.lon, p.lat]) })).filter((o) => o.b !== a && hubWater[o.b] >= 0).sort((x, y) => x.d - y.d);
    const picks = [...others.slice(0, 3), ...others.filter((o) => o.d > 0.5).filter((_, k) => k % 17 === a % 17).slice(0, 3)];
    for (const { b } of picks) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue; seen.add(key);
      const cells = astar(hubWater[a], hubWater[b]);
      if (!cells) continue;
      const sm = smooth(cells);
      const pts = [[hubSet[a].lon, hubSet[a].lat], ...sm.map((c) => cellLL(c % GW, Math.floor(c / GW)).map((v) => round(v, 2))), [hubSet[b].lon, hubSet[b].lat]];
      routes.push({ a: hubSet[a].i, b: hubSet[b].i, p: pts });
    }
  }
  log('sea routes', routes.length);

  // ---- Roads (for truck/car traffic) ----
  log('roads');
  const roadsRaw = readJson('ne_10m_roads.geojson').features.filter((f) => {
    const p = f.properties;
    return (p.type === 'Major Highway' && p.scalerank <= 7) || (p.type === 'Secondary Highway' && p.scalerank <= 5) || (p.type === 'Road' && p.scalerank <= 4) || p.type === 'Beltway';
  });
  const roadsOut = await mapshaper.applyCommands('-i in.json -simplify 12% -o out.json format=geojson precision=0.001', { 'in.json': { type: 'FeatureCollection', features: roadsRaw.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: {} })) } });
  const asFeatures = (gj) => gj.features || (gj.geometries || []).map((g) => ({ geometry: g }));
  const roadsGeo = JSON.parse(roadsOut['out.json']);
  const roads = [];
  for (const f of asFeatures(roadsGeo)) {
    if (!f.geometry) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const l of lines) {
      if (l.length < 2) continue;
      const mid = l[Math.floor(l.length / 2)];
      const [gx, gy] = cellOf(mid[0], mid[1]);
      let r = cellRegion[gy * GW + gx];
      if (r < 0) r = regionAt(mid[0], mid[1]);
      if (r < 0) continue;
      roads.push({ r, p: l.map(([x, y]) => [round(x, 3), round(y, 3)]) });
    }
  }
  log('road segments', roads.length);

  // ---- Railways ----
  log('rail');
  const railRaw = readJson('ne_10m_railroads.geojson').features.filter((f) => f.properties.scalerank <= 5 || f.properties.category === 1);
  const railOut = await mapshaper.applyCommands('-i in.json -simplify 10% -o out.json format=geojson precision=0.001', { 'in.json': { type: 'FeatureCollection', features: railRaw.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: {} })) } });
  const rails = [];
  for (const f of asFeatures(JSON.parse(railOut['out.json']))) {
    if (!f.geometry) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const l of lines) {
      if (l.length < 3) continue;
      const mid = l[Math.floor(l.length / 2)];
      const [gx, gy] = cellOf(mid[0], mid[1]);
      const r = cellRegion[gy * GW + gx];
      if (r < 0) continue;
      rails.push({ r, p: l.map(([x, y]) => [round(x, 3), round(y, 3)]) });
    }
  }
  log('rail segments', rails.length);

  // ---- Ocean grid for naval movement: 1 degree, RLE ----
  const OG = { res: 1, w: 360, h: 180 };
  const ocean = [];
  for (let y = 0; y < 180; y++) for (let x = 0; x < 360; x++) {
    // ocean if any of the 4 half-degree cells is water
    let w = 0;
    for (let k = 0; k < 4; k++) { const gx = x * 2 + (k & 1), gy = y * 2 + (k >> 1); if (!land[gy * GW + gx]) w = 1; }
    ocean.push(w);
  }
  let rle = [], cur = ocean[0], run = 0;
  for (const v of ocean) { if (v === cur) run++; else { rle.push(run); cur = v; run = 1; } }
  rle.push(run);

  // ---- Write ----
  const write = (name, obj) => {
    const s = JSON.stringify(obj);
    fs.writeFileSync(path.join(OUT, name), s);
    log('wrote', name, (s.length / 1e6).toFixed(2), 'MB');
  };
  write('regions.topo.json', topo);
  write('world.json', { countries, regions, cities, ports, airports });
  write('borders.json', borderFeatures);
  write('searoutes.json', routes);
  write('roads.json', roads);
  write('rails.json', rails);
  write('ocean.json', { ...OG, firstOcean: ocean[0], rle });

  await buildTiles();
  log('done');
}

// Re-project the equirectangular Blue Marble into Web Mercator raster tiles.
async function buildTiles() {
  const src = await sharp(path.join(CACHE, 'bluemarble.jpg')).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = src.info;
  const data = src.data;
  const MAXZ = 4, TS = 256;
  let n = 0;
  for (let z = 0; z <= MAXZ; z++) {
    const count = 2 ** z;
    for (let tx = 0; tx < count; tx++) for (let ty = 0; ty < count; ty++) {
      const out = Buffer.alloc(TS * TS * 3);
      for (let py = 0; py < TS; py++) {
        const yn = (ty * TS + py + 0.5) / (count * TS);
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * yn))) * 180 / Math.PI;
        const sy = (90 - lat) / 180 * H - 0.5;
        for (let px = 0; px < TS; px++) {
          const lon = (tx * TS + px + 0.5) / (count * TS) * 360 - 180;
          const sx = (lon + 180) / 360 * W - 0.5;
          const x0 = Math.floor(sx), y0 = Math.max(0, Math.floor(sy));
          const fx = sx - x0, fy = sy - y0;
          const x1 = (x0 + 1) % W, y1 = Math.min(H - 1, y0 + 1), xa = (x0 + W) % W;
          for (let ch = 0; ch < 3; ch++) {
            const v = (data[(y0 * W + xa) * C + ch] * (1 - fx) + data[(y0 * W + x1) * C + ch] * fx) * (1 - fy)
              + (data[(y1 * W + xa) * C + ch] * (1 - fx) + data[(y1 * W + x1) * C + ch] * fx) * fy;
            out[(py * TS + px) * 3 + ch] = v;
          }
        }
      }
      const dir = path.join(TILES, String(z), String(tx));
      fs.mkdirSync(dir, { recursive: true });
      await sharp(out, { raw: { width: TS, height: TS, channels: 3 } })
        .modulate({ saturation: 0.85, brightness: 0.92 })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(path.join(dir, `${ty}.jpg`));
      n++;
    }
  }
  log('tiles', n);
}

main().catch((e) => { console.error(e); process.exit(1); });
