import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification, type GeoJSONSource, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import * as topojson from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { StaticWorld, StaticCity } from '../data/static';
import type { Formation, GameState, Order } from '../sim/types';
import { useStore } from '../store';
import { computeRegionColors, rgbCss, type RGB } from './colors';
import { BUILDING_ICON_COLOR, EVENT_COLOR, ICON_NAMES, iconSdf } from './icons';
import { buildShips, buildFlights, buildRoadLanes, buildRailLanes, animateVehicles, positionAlong, greatCircle, type Ship, type Flight, type Lane } from './traffic';
import { formationDomain, formationUnits, blockaded } from '../sim/military';
import { areEnemies } from '../sim/diplomacy';
import { BUILDING_BY_ID } from '../sim/content/buildings';
import { UNIT_BY_ID } from '../sim/content/units';
import { Rng } from '../sim/rng';
import { fmtPop } from '../sim/util';
import { SPEED_MS } from '../net/session';

interface CityDot { city: StaticCity; idx: number; pos: [number, number]; pop: number; radius: number; prosperity: number; cap: boolean }
interface Sprawl { pos: [number, number]; t: number }
interface FormationPath { id: string; mine: boolean; color: RGB; path: [number, number][] }

const FONT_BOLD = ['Open Sans Bold'];
const FONT_SEMI = ['Open Sans Semibold'];
const SYMBOL_BASE = 'buildings-sym'; // deck layers are inserted below this MapLibre layer

function baseUrl() { return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); }
const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
const pt = (coords: [number, number], properties: Record<string, unknown>): Feature<Point> => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: coords } });

class MapController {
  map: maplibregl.Map;
  overlay: MapboxOverlay | null = null;
  world: StaticWorld;
  loaded = false;
  private raf = 0;
  private refreshTimer = 0;
  private lastColorKey = '';
  private lastBorderKey = '';
  private lastSlowRefresh = -1e9;
  private cities: CityDot[] = [];
  private sprawl: Sprawl[] = [];
  private unitPaths: FormationPath[] = [];
  private ships: Ship[] = [];
  private flights: Flight[] = [];
  private lanes: Lane[] = [];
  private trafficBuiltAt = -1e9;
  private tooltip: HTMLDivElement;
  private hoverRegion: number | null = null;
  private unsub: (() => void) | null = null;
  private regionFeatureCount = 0;
  private spin = true;

  constructor(container: HTMLDivElement, world: StaticWorld) {
    this.world = world;
    const topo = world.topo as Topology;
    const regionsGeo = topojson.feature(topo, topo.objects.regions as GeometryCollection) as unknown as FeatureCollection<Geometry, { id: number }>;
    this.regionFeatureCount = regionsGeo.features.length;
    const bordersGeo = fc(world.borders.map((b, i) => ({ type: 'Feature', id: i, properties: { a: b.a, b: b.b }, geometry: { type: 'LineString', coordinates: b.p } })));
    const empty = fc([]);
    const style: StyleSpecification = {
      version: 8,
      projection: { type: 'globe' },
      glyphs: `${baseUrl()}fonts/{fontstack}/{range}.pbf`,
      sky: {
        'sky-color': '#071226', 'horizon-color': '#1c3d73', 'fog-color': '#0c1a33', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 7, 0],
      },
      sources: {
        sat: { type: 'raster', tiles: [`${baseUrl()}tiles/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 4 },
        regions: { type: 'geojson', data: regionsGeo, promoteId: 'id' },
        borders: { type: 'geojson', data: bordersGeo },
        selected: { type: 'geojson', data: empty },
        buildings: { type: 'geojson', data: empty },
        events: { type: 'geojson', data: empty },
        battles: { type: 'geojson', data: empty },
        units: { type: 'geojson', data: empty },
        countryLabels: { type: 'geojson', data: empty },
        regionLabels: { type: 'geojson', data: empty },
        cityLabels: { type: 'geojson', data: empty },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': '#0a1a33' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.08, 'raster-brightness-max': 0.92, 'raster-fade-duration': 0 } },
        {
          id: 'regions-fill', type: 'fill', source: 'regions',
          paint: {
            'fill-color': ['to-color', ['coalesce', ['feature-state', 'c'], 'rgba(0,0,0,0)']],
            'fill-opacity': ['interpolate', ['linear'], ['zoom'],
              2, ['*', ['coalesce', ['feature-state', 'o'], 0.5], ['case', ['boolean', ['feature-state', 'hover'], false], 1.35, 1]],
              6, ['*', ['coalesce', ['feature-state', 'o'], 0.5], ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0.6]]],
            'fill-antialias': false,
          },
        },
        {
          id: 'region-lines', type: 'line', source: 'borders', filter: ['!=', ['get', 'b'], -1],
          paint: {
            'line-color': ['case', ['==', ['feature-state', 'k'], 3], '#ff4d3a', ['==', ['feature-state', 'k'], 1], 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.22)'],
            'line-width': ['interpolate', ['linear'], ['zoom'],
              1, ['case', ['==', ['feature-state', 'k'], 3], 1.6, ['==', ['feature-state', 'k'], 1], 0.6, 0],
              3.5, ['case', ['==', ['feature-state', 'k'], 3], 2.6, ['==', ['feature-state', 'k'], 1], 1.3, 0.4],
              6, ['case', ['==', ['feature-state', 'k'], 3], 4, ['==', ['feature-state', 'k'], 1], 2.2, 1]],
            'line-blur': ['case', ['==', ['feature-state', 'k'], 3], 1.5, 0],
          },
        },
        { id: 'coast', type: 'line', source: 'borders', filter: ['==', ['get', 'b'], -1], paint: { 'line-color': 'rgba(190,225,255,0.35)', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1.2] } },
        { id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#ffe27a', 'line-width': 2.5, 'line-blur': 0.5 } },
      ],
    };
    this.map = new maplibregl.Map({ container, style, center: [15, 22], zoom: 1.75, minZoom: 1, maxZoom: 9, attributionControl: false, fadeDuration: 0, renderWorldCopies: false });
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'map-tooltip';
    container.appendChild(this.tooltip);

    this.map.on('load', () => {
      for (const name of ICON_NAMES) {
        if (!this.map.hasImage(name)) this.map.addImage(name, iconSdf(name, 48), { sdf: true, pixelRatio: 2 });
      }
      this.addSymbolLayers();
      this.overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      this.map.addControl(this.overlay as unknown as maplibregl.IControl);
      this.loaded = true;
      this.refreshAll(true);
      this.startLoop();
    });
    this.map.on('click', (e) => this.onClick(e.point, false));
    this.map.on('contextmenu', (e) => { e.preventDefault(); this.onClick(e.point, true); });
    this.map.on('mousemove', (e) => this.onHover(e.point, e.originalEvent));
    this.map.on('mouseout', () => { this.setHover(null); this.tooltip.style.display = 'none'; });
    this.map.on('mousedown', () => { this.spin = false; });

    let lastVersion = -1, lastMode = '', lastSel: number | null = -2, lastFly = 0, lastFormation: string | null = null, lastScreen = '';
    this.unsub = useStore.subscribe((s) => {
      if (s.version !== lastVersion || s.mapMode !== lastMode || s.selectedFormation !== lastFormation) {
        lastVersion = s.version; lastMode = s.mapMode; lastFormation = s.selectedFormation;
        this.scheduleRefresh();
      }
      if (s.screen !== lastScreen) { lastScreen = s.screen; this.spin = s.screen === 'menu'; }
      if (s.selectedRegion !== lastSel) { lastSel = s.selectedRegion; this.setSelected(s.selectedRegion); }
      if (s.flyTo && s.flyTo.seq !== lastFly) {
        lastFly = s.flyTo.seq;
        this.spin = false;
        this.map.flyTo({ center: [s.flyTo.lon, s.flyTo.lat], zoom: s.flyTo.zoom ?? Math.max(this.map.getZoom(), 3.5), duration: 1600, essential: true });
      }
      this.map.getCanvas().style.cursor = s.orderMode ? 'crosshair' : '';
      if (this.loaded) {
        const vis = s.showLabels ? 'visible' : 'none';
        for (const id of ['country-labels', 'region-labels', 'city-labels']) if (this.map.getLayer(id) && this.map.getLayoutProperty(id, 'visibility') !== vis) this.map.setLayoutProperty(id, 'visibility', vis);
      }
    });
  }

  private addSymbolLayers() {
    const m = this.map;
    const zoomSize = (small: number, large: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 2, small, 7, large];
    m.addLayer({
      id: SYMBOL_BASE, type: 'symbol', source: 'buildings', minzoom: 4.7,
      layout: { 'icon-image': ['get', 'icon'], 'icon-size': zoomSize(0.45, 0.85), 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': 'rgba(0,0,0,0.75)', 'icon-halo-width': 1.2, 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 4.7, 0, 5.1, 1] },
    });
    m.addLayer({
      id: 'events-sym', type: 'symbol', source: 'events',
      layout: { 'icon-image': ['get', 'kind'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, ['*', ['get', 'size'], 0.65], 7, ['*', ['get', 'size'], 1]], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': 'rgba(0,0,0,0.8)', 'icon-halo-width': 1.5 },
    });
    m.addLayer({
      id: 'battles-sym', type: 'symbol', source: 'battles',
      layout: { 'icon-image': 'battle', 'icon-size': zoomSize(0.6, 0.9), 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-color': '#fff1d0', 'icon-halo-color': 'rgba(120,20,0,0.9)', 'icon-halo-width': 2 },
    });
    m.addLayer({
      id: 'units-bg', type: 'symbol', source: 'units',
      layout: { 'icon-image': 'unit_bg', 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, ['*', ['get', 'size'], 0.55], 7, ['*', ['get', 'size'], 0.9]], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sort'] },
      paint: { 'icon-color': ['get', 'bg'], 'icon-halo-color': ['get', 'ring'], 'icon-halo-width': ['get', 'ringW'] },
    });
    m.addLayer({
      id: 'units-glyph', type: 'symbol', source: 'units',
      layout: {
        'icon-image': ['get', 'glyph'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, ['*', ['get', 'size'], 0.42], 7, ['*', ['get', 'size'], 0.7]], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sort'],
        'text-field': ['step', ['zoom'], '', 3, ['get', 'count']], 'text-font': FONT_BOLD, 'text-size': 11, 'text-offset': [1.5, -0.9], 'text-allow-overlap': true, 'text-ignore-placement': true,
      },
      paint: { 'icon-color': ['get', 'fg'], 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 },
    });
    m.addLayer({
      id: 'city-labels', type: 'symbol', source: 'cityLabels',
      filter: ['>=', ['zoom'], ['get', 'minz']],
      layout: {
        'text-field': ['step', ['zoom'], ['get', 'name'], 4.6, ['concat', ['get', 'name'], ' · ', ['get', 'popText']]],
        'text-font': FONT_SEMI, 'text-size': ['case', ['get', 'cap'], 13, 11.5], 'text-offset': [0, -0.7], 'text-anchor': 'bottom',
        'symbol-sort-key': ['get', 'rank'], 'text-padding': 3,
      },
      paint: { 'text-color': ['case', ['get', 'cap'], '#ffecbe', '#eef2f7'], 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.6 },
    });
    m.addLayer({
      id: 'region-labels', type: 'symbol', source: 'regionLabels',
      filter: ['>=', ['zoom'], ['get', 'minz']],
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT_SEMI, 'text-size': 11, 'text-padding': 4, 'text-max-width': 8 },
      paint: { 'text-color': 'rgba(225,235,248,0.75)', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.2 },
    });
    m.addLayer({
      id: 'country-labels', type: 'symbol', source: 'countryLabels', maxzoom: 6.3,
      filter: ['>=', ['zoom'], ['get', 'minz']],
      layout: {
        'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-letter-spacing': 0.14, 'text-max-width': 9,
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, ['*', ['get', 'size'], 0.55], 3, ['*', ['get', 'size'], 1], 6, ['*', ['get', 'size'], 1.6]],
        'symbol-sort-key': ['get', 'rank'], 'text-padding': 2,
      },
      paint: { 'text-color': 'rgba(255,255,255,0.92)', 'text-halo-color': 'rgba(0,0,0,0.65)', 'text-halo-width': 1.8 },
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.refreshTimer);
    this.unsub?.();
    this.map.remove();
  }

  private scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = 0; this.refreshAll(false); }, 100);
  }

  private get state(): GameState | undefined { return useStore.getState().session?.state; }
  private get myCountry(): string | null {
    const s = useStore.getState().session;
    return s?.state?.players[s.me]?.country ?? null;
  }

  private setData(source: string, data: FeatureCollection) {
    (this.map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
  }

  private refreshAll(force: boolean) {
    const state = this.state;
    if (!state || !this.loaded) return;
    const ui = useStore.getState();
    const colorKey = `${ui.mapMode}|${state.tick}|${ui.selectedCountry}|${Object.keys(state.wars).length}|${state.regions.length}`;
    if (force || colorKey !== this.lastColorKey) {
      this.lastColorKey = colorKey;
      const { fill, opacity } = computeRegionColors(state, this.world, ui.mapMode, this.myCountry, ui.selectedCountry);
      for (let i = 0; i < this.regionFeatureCount; i++) {
        const c = fill[i];
        this.map.setFeatureState({ source: 'regions', id: i }, { c: c ? rgbCss(c) : 'rgba(0,0,0,0)', o: c ? opacity : 0 });
      }
      this.map.setPaintProperty('sat', 'raster-saturation', ui.mapMode === 'satellite' ? 0.1 : -0.15);
    }
    const borderKey = state.regions.map((r) => r.owner + r.controller).join('') + Object.keys(state.wars).join();
    if (force || borderKey !== this.lastBorderKey) {
      this.lastBorderKey = borderKey;
      this.world.borders.forEach((b, i) => {
        if (b.b < 0) return;
        const ra = state.regions[b.a], rb = state.regions[b.b];
        if (!ra || !rb) return;
        let k = ra.owner !== rb.owner ? 1 : 0;
        if (ra.controller !== rb.controller && areEnemies(state, ra.controller, rb.controller)) k = 3;
        this.map.setFeatureState({ source: 'borders', id: i }, { k });
      });
      this.buildCountryLabels(state);
      if (force) this.buildRegionLabels();
    }
    this.buildUnits(state);
    this.buildEvents(state);
    const now = performance.now();
    if (force || now - this.lastSlowRefresh > 2500) {
      this.lastSlowRefresh = now;
      this.buildCities(state);
      this.buildBuildings(state);
    }
    if (force || now - this.trafficBuiltAt > 15000) this.buildTraffic(state);
  }

  // ---------------- data builders ----------------

  private buildCountryLabels(state: GameState) {
    const byOwner = new Map<string, number[]>();
    for (const r of state.regions) { if (!byOwner.has(r.owner)) byOwner.set(r.owner, []); byOwner.get(r.owner)!.push(r.id); }
    const feats: Feature[] = [];
    for (const [owner, ids] of byOwner) {
      const c = state.countries[owner];
      if (!c) continue;
      // anchor on the densest cluster of territory (so e.g. Alaska doesn't pull the US label north)
      const sample = ids.length > 80 ? ids.filter((_, i) => i % Math.ceil(ids.length / 80) === 0) : ids;
      let best = ids[0], bestArea = -1;
      for (const cand of sample) {
        const C = this.world.regions[cand];
        let a = 0;
        for (const id of ids) { const r = this.world.regions[id]; if (Math.abs(r.lat - C.lat) <= 12 && Math.abs(r.lon - C.lon) <= 20) a += r.area; }
        if (a > bestArea) { bestArea = a; best = cand; }
      }
      const L = this.world.regions[best];
      let wx = 0, wy = 0, wt = 0;
      for (const id of ids) {
        const r = this.world.regions[id];
        if (Math.abs(r.lat - L.lat) > 12 || Math.abs(r.lon - L.lon) > 20) continue;
        wx += r.lon * r.area; wy += r.lat * r.area; wt += r.area;
      }
      const name = (c.name.length > 22 ? c.name.replace(/ of America| Republic| Federation/g, '') : c.name).toUpperCase();
      const size = Math.min(22, Math.max(9, Math.sqrt(wt) / 60));
      const minz = wt > 1.5e6 ? 0 : wt > 3e5 ? 1.8 : wt > 6e4 ? 2.8 : 3.6;
      feats.push(pt([wx / wt, wy / wt], { name, size, minz, rank: -wt }));
    }
    this.setData('countryLabels', fc(feats));
  }

  private buildRegionLabels() {
    const feats = this.world.regions.filter((r) => (this.world.countryByA3.get(r.c)?.regions.length ?? 1) > 1)
      .map((r) => pt([r.lon, r.lat], { name: r.n, minz: r.area > 2e5 ? 3.6 : r.area > 4e4 ? 4.2 : 4.8 }));
    this.setData('regionLabels', fc(feats));
  }

  private buildCities(state: GameState) {
    const out: CityDot[] = [];
    this.world.cities.forEach((city, idx) => {
      const r = state.regions[city.r];
      const sr = this.world.regions[city.r];
      if (!r) return;
      const growth = (r.pop / Math.max(1, sr.pop)) * (0.55 + r.prosperity / 110) * (1 - r.devastation / 200);
      const pop = city.pop * growth;
      out.push({ city, idx, pos: [city.lon, city.lat], pop, radius: Math.sqrt(pop) * 9, prosperity: r.prosperity, cap: city.cap === 1 });
    });
    this.cities = out;
    const sprawl: Sprawl[] = [];
    for (const c of out) {
      const n = Math.min(70, Math.floor(Math.sqrt(c.pop / 40000) * 2.4));
      const rng = new Rng(c.idx * 7919 + 1);
      const radiusDeg = Math.sqrt(c.pop) / 9000;
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * radiusDeg * (0.6 + rng.next() * 0.6);
        sprawl.push({ pos: [c.pos[0] + (Math.cos(a) * d) / Math.cos((c.pos[1] * Math.PI) / 180), c.pos[1] + Math.sin(a) * d], t: rng.next() });
      }
    }
    this.sprawl = sprawl;
    const minzFor = (c: CityDot) => (c.pop > 12e6 ? 1 : c.pop > 6e6 ? 2 : c.pop > 2.5e6 ? 2.8 : c.pop > 9e5 ? 3.5 : c.pop > 3e5 ? 4.3 : 5.2);
    this.setData('cityLabels', fc(out.map((c) => pt(c.pos, { name: c.city.n, popText: fmtPop(c.pop), cap: c.cap, minz: c.cap ? Math.min(minzFor(c), 2.6) : minzFor(c), rank: -c.pop - (c.cap ? 5e7 : 0) }))));
  }

  private buildUnits(state: GameState) {
    const me = this.myCountry;
    const sel = useStore.getState().selectedFormation;
    const feats: Feature[] = [];
    const paths: FormationPath[] = [];
    for (const f of Object.values(state.formations)) {
      if (f.parent) continue;
      const units = formationUnits(state, f);
      if (!units.length) continue;
      const domain = formationDomain(state, f);
      const armor = units.filter((u) => u.type === 'armor' || u.type === 'mech_infantry').length > units.length / 2;
      const glyph = domain === 'naval' ? 'unit_naval' : domain === 'air' ? 'unit_air' : armor ? 'unit_armor' : 'unit_land';
      const c = state.countries[f.owner]?.color ?? [150, 150, 150];
      const isSel = f.id === sel;
      const bg: RGB = isSel ? [255, 222, 110] : f.inCombat ? [Math.min(255, c[0] * 0.6 + 110), c[1] * 0.5, c[2] * 0.5] : [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
      feats.push(pt([f.pos.lon, f.pos.lat], {
        id: f.id, glyph, count: String(units.length), size: Math.min(1.35, 0.85 + Math.sqrt(units.length) * 0.08) * (isSel ? 1.2 : 1),
        bg: rgbCss(bg), fg: isSel ? '#1d1d1d' : '#ffffff', ring: f.owner === me ? 'rgba(130,200,255,0.95)' : f.inCombat ? 'rgba(255,90,40,0.95)' : 'rgba(0,0,0,0.7)', ringW: f.owner === me || f.inCombat ? 2 : 1,
        sort: isSel ? 1e6 : units.length,
      }));
      if (f.pos.path.length) paths.push({ id: f.id, mine: f.owner === me, color: c, path: [[f.pos.lon, f.pos.lat], ...f.pos.path] });
    }
    this.setData('units', fc(feats));
    this.unitPaths = paths;
  }

  private buildEvents(state: GameState) {
    this.setData('events', fc(Object.values(state.mapEvents).map((e) => pt([e.lon, e.lat], { kind: e.kind, size: 0.8 + e.severity * 0.5, color: rgbCss(EVENT_COLOR[e.kind] ?? [255, 255, 255]) }))));
    this.setData('battles', fc(Object.values(state.wars).flatMap((w) => w.battles).map((b) => pt([b.lon, b.lat], { i: b.intensity }))));
  }

  private buildBuildings(state: GameState) {
    const feats: Feature[] = [];
    for (const r of state.regions) {
      const sr = this.world.regions[r.id];
      const all = [...Object.keys(r.buildings).map((b) => ({ b, c: false })), ...r.construction.map((j) => ({ b: j.building, c: true }))];
      if (!all.length) continue;
      const spread = Math.min(1.6, Math.max(0.25, Math.sqrt(sr.area) / 500));
      const rng = new Rng(r.id * 31 + 7);
      all.forEach(({ b, c }, i) => {
        let pos: [number, number];
        if (b === 'port' || b === 'naval_base') {
          const p = this.world.portsByRegion.get(r.id)?.[0];
          pos = p ? [p.lon + (b === 'naval_base' ? 0.15 : 0), p.lat] : [sr.lon, sr.lat];
        } else {
          const a = i * 2.4 + rng.next(), d = spread * (0.35 + 0.65 * ((i % 4) / 4 + rng.next() * 0.25));
          pos = [sr.lon + Math.cos(a) * d, sr.lat + Math.sin(a) * d * 0.7];
        }
        const icon = BUILDING_BY_ID[b]?.icon ?? 'dot';
        feats.push(pt(pos, { icon: c ? 'construction' : icon, color: rgbCss(c ? [255, 200, 90] : BUILDING_ICON_COLOR[icon] ?? [255, 255, 255]) }));
      });
    }
    this.setData('buildings', fc(feats));
  }

  private buildTraffic(state: GameState) {
    this.trafficBuiltAt = performance.now();
    this.ships = buildShips(state, this.world, blockaded);
    this.flights = buildFlights(state, this.world);
    this.lanes = [...buildRailLanes(state, this.world), ...buildRoadLanes(state, this.world)];
  }

  // ---------------- per-frame deck rendering ----------------

  private startLoop() {
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (this.spin) this.map.setCenter([this.map.getCenter().lng + 0.03, this.map.getCenter().lat]);
      this.renderLayers(t / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private renderLayers(now: number) {
    if (!this.overlay) return;
    const state = this.state;
    const ui = useStore.getState();
    const zoom = this.map.getZoom();
    const layers: Layer[] = [];
    const speed = state ? (state.paused || state.phase !== 'playing' ? 0.3 : Math.max(0.5, 1000 / (SPEED_MS[state.speed] ?? 1000))) : 0.4;
    const traffic = ui.showTraffic;
    const below = { beforeId: SYMBOL_BASE } as const;

    layers.push(new ScatterplotLayer<CityDot>({
      id: 'city-glow', data: this.cities, getPosition: (d) => d.pos, getRadius: (d) => d.radius * 2.6, radiusUnits: 'meters',
      radiusMinPixels: 1.5, radiusMaxPixels: 34, getFillColor: (d) => [255, 196, 120, Math.min(55, 14 + d.prosperity * 0.4) * (zoom > 4 ? 0.6 : 1)], stroked: false, updateTriggers: { getFillColor: zoom > 4 }, ...below,
    }));
    if (zoom > 3.3) {
      layers.push(new ScatterplotLayer<Sprawl>({
        id: 'city-sprawl', data: this.sprawl, getPosition: (d) => d.pos, getRadius: 1100, radiusUnits: 'meters', radiusMinPixels: 1, radiusMaxPixels: 3.5,
        getFillColor: (d) => [255, 222, 160, 90 + Math.floor(d.t * 120)], stroked: false, ...below,
      }));
    }
    layers.push(new ScatterplotLayer<CityDot>({
      id: 'city-core', data: this.cities, getPosition: (d) => d.pos, getRadius: (d) => (d.cap ? 3.5 : 1.4 + Math.min(3, Math.sqrt(d.pop) / 1500)), radiusUnits: 'pixels',
      getFillColor: (d) => (d.cap ? [255, 240, 200, 255] : [255, 230, 180, 220]), stroked: true, getLineColor: [40, 30, 20, 180], lineWidthUnits: 'pixels', getLineWidth: (d) => (d.cap ? 1.2 : 0.5), ...below,
    }));

    if (traffic && zoom > 4.2) {
      const b = this.map.getBounds();
      const vehicles = animateVehicles(this.lanes, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], now * speed, 9000);
      const alpha = Math.min(255, Math.floor((zoom - 4.2) * 300));
      layers.push(new PathLayer({ id: 'vehicle-trails', data: vehicles, getPath: (d) => d.trail, getColor: (d) => [...d.color, Math.floor(alpha * 0.55)] as never, widthMinPixels: 2, capRounded: true, ...below }));
      layers.push(new ScatterplotLayer({ id: 'vehicles', data: vehicles, getPosition: (d) => d.pos, getRadius: zoom > 6 ? 2.4 : 1.6, radiusUnits: 'pixels', getFillColor: (d) => [...d.color, alpha] as never, ...below }));
    }

    if (traffic) {
      // Freighters: a hull segment oriented along the route plus a faint wake
      const hullKm = zoom > 5 ? 10 : zoom > 3.5 ? 22 : 40;
      const ships = this.ships.map((s) => {
        const d = (s.phase * s.len + now * s.speed * speed) % s.len;
        const dist = s.dir === 1 ? d : s.len - d;
        const bow = positionAlong(s.path, s.cum, dist).pos;
        const stern = positionAlong(s.path, s.cum, dist - s.dir * hullKm).pos;
        const wake = positionAlong(s.path, s.cum, dist - s.dir * hullKm * 4).pos;
        return { hull: [stern, bow] as [number, number][], wake: [wake, stern] as [number, number][], color: s.color };
      });
      if (zoom > 3) layers.push(new PathLayer({ id: 'ship-wakes', data: ships, getPath: (d) => d.wake, getColor: [200, 230, 255, 45], widthMinPixels: 1, capRounded: true, ...below }));
      layers.push(new PathLayer({ id: 'ships', data: ships, getPath: (d) => d.hull, getColor: (d) => [...d.color, 235] as never, widthMinPixels: zoom > 4 ? 4 : 2.2, capRounded: true, ...below }));

      const planes: { pos: [number, number]; tail: [number, number][] }[] = [];
      const trailT = zoom > 4 ? 0.004 : 0.008;
      for (const f of this.flights) {
        const t = (f.phase + (now * speed) / f.period) % 1;
        const pos = greatCircle(f.a, f.b, t);
        const tail: [number, number][] = [];
        for (let k = 0; k <= 4; k++) tail.push(greatCircle(f.a, f.b, Math.max(0, t - k * trailT)));
        planes.push({ pos, tail });
      }
      layers.push(new PathLayer({ id: 'contrails', data: planes, getPath: (d) => d.tail, getColor: [255, 255, 255, zoom > 3 ? 70 : 40], widthMinPixels: 1, capRounded: true, ...below }));
      layers.push(new ScatterplotLayer({ id: 'planes', data: planes, getPosition: (d) => d.pos, getRadius: zoom > 4 ? 2.6 : 1.8, radiusUnits: 'pixels', getFillColor: [255, 255, 255, 255], ...below }));
    }

    if (state) {
      const events = Object.values(state.mapEvents);
      layers.push(new ScatterplotLayer({
        id: 'event-rings', data: events, getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
        getRadius: (d) => 10 + ((now * 1.1 + d.start * 0.37) % 1) * 26 * (0.6 + d.severity), stroked: true, filled: false, lineWidthUnits: 'pixels', getLineWidth: 2,
        getLineColor: (d) => [...(EVENT_COLOR[d.kind] ?? [255, 255, 255]), Math.floor(230 * (1 - ((now * 1.1 + d.start * 0.37) % 1)))] as never,
        updateTriggers: { getRadius: Math.floor(now * 30), getLineColor: Math.floor(now * 30) }, ...below,
      }));
      const battles = Object.values(state.wars).flatMap((w) => w.battles);
      layers.push(new ScatterplotLayer({
        id: 'battle-glow', data: battles, getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
        getRadius: (d) => 14 + d.intensity * 16 + Math.sin(now * 8 + d.lon) * 6, getFillColor: (d) => [255, 90 + Math.floor(Math.sin(now * 13 + d.lat) * 40), 30, Math.floor(110 * d.intensity + 50)],
        updateTriggers: { getRadius: Math.floor(now * 30), getFillColor: Math.floor(now * 30) }, ...below,
      }));
      const sel = ui.selectedFormation;
      const paths = this.unitPaths.filter((p) => p.mine || p.id === sel || zoom > 3);
      layers.push(new PathLayer<FormationPath>({
        id: 'unit-paths', data: paths, getPath: (d) => d.path,
        getColor: (d) => (d.id === sel ? [255, 230, 120, 255] : d.mine ? [120, 200, 255, 210] : [...d.color, 160] as never),
        widthMinPixels: 2.5, capRounded: true, jointRounded: true, updateTriggers: { getColor: sel }, ...below,
      }));
    }
    this.overlay.setProps({ layers });
  }

  // ---------------- interaction ----------------

  private regionAt(point: maplibregl.PointLike): number | null {
    const feats = this.map.queryRenderedFeatures(point, { layers: ['regions-fill'] });
    const id = feats[0]?.id;
    return typeof id === 'number' ? id : null;
  }

  private unitAt(point: maplibregl.Point): string | null {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]];
    const feats = this.map.queryRenderedFeatures(box, { layers: ['units-bg'] });
    if (!feats.length) return null;
    feats.sort((a, b) => Number(b.properties?.sort ?? 0) - Number(a.properties?.sort ?? 0));
    return String(feats[0].properties?.id ?? '') || null;
  }

  private onClick(point: maplibregl.Point, right: boolean) {
    const ui = useStore.getState();
    const state = this.state;
    if (!state || ui.screen === 'menu') return;
    const region = this.regionAt(point);
    if (ui.orderMode || (right && ui.selectedFormation)) {
      const fid = ui.orderMode?.formation ?? ui.selectedFormation!;
      const kind = ui.orderMode?.kind ?? 'move';
      const lngLat = this.map.unproject(point);
      let order: Order | null = null;
      if (kind === 'patrol') order = { kind: 'patrol', lon: lngLat.lng, lat: lngLat.lat };
      else if (region !== null && kind !== 'hold') order = { kind, target: region } as Order;
      if (order) void ui.send({ type: 'order', formation: fid, order }).then((ok) => { if (ok) ui.toast('Orders issued'); });
      useStore.setState({ orderMode: null });
      return;
    }
    const unit = this.unitAt(point);
    if (unit && state.formations[unit]) {
      const mine = state.formations[unit].owner === this.myCountry;
      useStore.setState({ selectedFormation: unit, panel: mine ? 'military' : ui.panel });
      return;
    }
    if (region !== null) useStore.setState({ selectedRegion: region, selectedCountry: state.regions[region].owner, selectedFormation: null });
    else useStore.setState({ selectedRegion: null, selectedFormation: null });
  }

  private setHover(id: number | null) {
    if (id === this.hoverRegion) return;
    if (this.hoverRegion !== null) this.map.setFeatureState({ source: 'regions', id: this.hoverRegion }, { hover: false });
    this.hoverRegion = id;
    if (id !== null) this.map.setFeatureState({ source: 'regions', id }, { hover: true });
  }

  private onHover(point: maplibregl.Point, ev: MouseEvent) {
    const state = this.state;
    if (!state || useStore.getState().screen === 'menu') return;
    const unitId = this.unitAt(point);
    const f: Formation | undefined = unitId ? state.formations[unitId] : undefined;
    if (f) {
      const units = formationUnits(state, f);
      const types = new Map<string, number>();
      for (const u of units) types.set(UNIT_BY_ID[u.type].name, (types.get(UNIT_BY_ID[u.type].name) ?? 0) + 1);
      this.tooltip.innerHTML = `<b>${escapeHtml(f.name)}</b><span>${escapeHtml(state.countries[f.owner]?.name ?? '')}</span><small>${[...types].map(([k, v]) => `${v}× ${escapeHtml(k)}`).join(', ')}</small>${f.inCombat ? '<em>In combat</em>' : ''}`;
      this.positionTooltip(ev);
      this.setHover(null);
      return;
    }
    const id = this.regionAt(point);
    this.setHover(id);
    if (id === null) { this.tooltip.style.display = 'none'; return; }
    const r = state.regions[id], sr = this.world.regions[id];
    const owner = state.countries[r.owner];
    const occ = r.controller !== r.owner ? ` · <em>occupied by ${escapeHtml(state.countries[r.controller]?.name ?? '?')}</em>` : '';
    this.tooltip.innerHTML = `<b>${escapeHtml(sr.n)}</b><span>${escapeHtml(owner?.name ?? '')}${occ}</span><small>Pop ${fmtPop(r.pop)} · Prosperity ${r.prosperity.toFixed(0)} · Unrest ${r.unrest.toFixed(0)}</small>`;
    this.positionTooltip(ev);
  }

  private positionTooltip(ev: MouseEvent) {
    const rect = this.map.getContainer().getBoundingClientRect();
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${ev.clientX - rect.left + 14}px`;
    this.tooltip.style.top = `${ev.clientY - rect.top + 14}px`;
  }

  private setSelected(id: number | null) {
    const src = this.map.getSource('selected') as GeoJSONSource | undefined;
    if (!src) return;
    if (id === null) { src.setData(fc([])); return; }
    const topo = this.world.topo as Topology;
    const geom = (topo.objects.regions as GeometryCollection).geometries[id];
    src.setData(topojson.feature(topo, geom as never) as never);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const world = useStore((s) => s.world);
  useEffect(() => {
    if (!ref.current || !world) return;
    const ctl = new MapController(ref.current, world);
    (window as unknown as { __map?: MapController }).__map = ctl;
    return () => ctl.destroy();
  }, [world]);
  return <div ref={ref} className="map-root" />;
}
