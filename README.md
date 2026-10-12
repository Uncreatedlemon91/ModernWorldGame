# Modern World

A multiplayer geopolitical simulation that runs entirely in the browser, played on a 3D globe of the real world.

Each player leads a political party in charge of a country: set taxes and budgets, pass laws through a legislature, win elections, sign treaties, build infrastructure, and raise and command armed forces, while every other nation is run by the AI.

## Features

- **Scenarios**: *The world today* (the default) starts with the situation as of mid-2025: the Russia–Ukraine war with occupied oblasts, the war in Gaza, civil conflicts (Sudan, Myanmar, the Sahel and others) and Western sanctions on Russia, Iran and North Korea. *Peaceful 2026* starts with no wars.
- **Real-world globe**: NASA Blue Marble imagery on a 3D globe, with 1,541 playable regions (US states, Chinese provinces, Russian oblasts, German Länder and so on) and ~2,900 real cities.
- **Living map**:
  - Cities glow and sprawl as their regions grow richer.
  - Every building appears on the map.
  - Disasters, protests and battles pulse where they happen.
  - Front lines light up in red.
  - Civilian traffic reflects trade, prosperity, wars and sanctions: freighters on real sea lanes, airliners between airports, and cars, trucks and trains on real roads and railways.
- **Politics**:
  - 10 interest groups judge your government.
  - Parties have positions on economic and social axes.
  - Elections are won region by region, under first-past-the-post or proportional representation.
  - Coalitions form, and bills are voted on by party.
  - Campaign with rallies, canvassing and ads.
  - Lose an election and you go into opposition (configurable).
  - Autocracies rule by decree but face coups.
  - A four-minister cabinet (Finance, Foreign, Defense, Interior). Competent ministers help; corrupt ones cause scandals.
  - Referendums let democracies bypass the legislature.
  - Charts track polls, approval, GDP, debt and the stock market over time.
- **26 laws** covering healthcare, labour, trade, immigration, press, policing, surveillance, conscription, nuclear doctrine, the electoral system, carbon and energy.
- **Economy**:
  - Taxes and eight spending lines, with deficits, debt, interest and credit ratings.
  - Inflation and unemployment.
  - Energy supply, trade openness, three research tracks and 21 building types.
  - The growth breakdown shows why your economy is moving.
  - Oil & gas, minerals, food and manufactured goods are produced and traded. World prices follow global supply and demand, and surpluses earn export income.
  - Each country has a stock market index.
- **Diplomacy**:
  - Opinions and blocs.
  - Trade, non-aggression, access, research, defensive and alliance treaties.
  - NATO, EU, CSTO, SCO, ASEAN, BRICS and more, or found your own organization.
  - Sanctions, aid, calls to arms and peace deals that cede occupied regions.
- **Military**:
  - Build battalions, squadrons and flotillas at bases.
  - Group battalions into regiments.
  - Combine regiments and squadrons into armies, or flotillas, squadrons and embarked regiments into task forces.
  - You never place units directly. Give orders instead: move, attack, patrol, blockade, air superiority, ground support, strategic bombing, amphibious landing.
  - Combat accounts for terrain, entrenchment, technology, organisation, air cover and encirclement. Attacks need local superiority.
  - Logistics: units cut off from friendly territory waste away, harsh terrain causes attrition, and partisans retake occupied regions left unguarded.
  - Missile strikes (missile brigades, destroyers, submarines) and nuclear weapons, with global consequences and retaliation.
  - Fog of war: enemy forces are only visible near your territory, units, fleets and air missions.
- **Events** with decisions: hurricanes, earthquakes, wildfires, floods, protests, riots, strikes, scandals, terror attacks, epidemics (which can become pandemics), resource discoveries, investment booms and coups.
- **Multiplayer** in private rooms with a 6-letter code, plus single-player and save/load (browser storage or a downloadable file).

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build (fully static, so any static host works: GitHub Pages, Netlify, S3 and so on):

```bash
npm run build      # outputs dist/
npm run preview
```

Tests (headless simulation):

```bash
npm test
```

### Hosting on GitHub Pages

`.github/workflows/pages.yml` builds, tests and deploys the game whenever `main` is updated (or when run manually). To turn it on, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. The game is then served at `https://<owner>.github.io/<repo>/`.

## Multiplayer

The host's browser runs the authoritative simulation in a Web Worker, so rendering stays smooth. Other players connect directly to it over WebRTC and receive compressed state diffs about four times a second. Their commands are validated by the host. The host controls pause and speed. If the host leaves, the game ends, but the host can save and later re-host, and friends rejoin with the new room code.

Players find each other through a PeerJS signalling server. By default the free public PeerJS cloud server is used. To run your own:

```bash
npm run signal                 # listens on :9000
```

Then either open the game with `?signal=http://your-server:9000/`, or enter `{"host":"your-server","port":9000,"path":"/","secure":false}` under **Main menu → Network settings**.

Some strict corporate or mobile networks block direct peer-to-peer connections. In that case a TURN server is needed; add it to `peerOptions()` in `src/net/session.ts`.

## Controls

| Action | Input |
| --- | --- |
| Inspect a region | Left click |
| Select a formation | Click its counter on the map, or use the Military panel |
| Move the selected formation | Right click on the destination |
| Other orders | Choose an order in the formation card, then click the target |
| Pause / resume (host) | Space |
| Game speed (host) | Keys 1–5 |
| Cancel | Esc |

## Project layout

```
scripts/build-data.mjs   Natural Earth + Blue Marble → public/data, public/tiles
scripts/signal-server.mjs Optional self-hosted PeerJS signalling server
src/sim/                 Simulation (pure TypeScript, no DOM): economy, politics,
                         diplomacy, military, events, AI, commands, tick
src/sim/content/         Laws, interest groups, buildings, units, starting data
src/net/                 Sessions (single-player/host/client), state diffing, saves
src/map/                 MapLibre globe, deck.gl overlays, traffic, icons
src/ui/                  React HUD and panels
```

To rebuild the world data (downloads about 150 MB of source data into `.data-cache/`):

```bash
npm run data
```

## Credits

- Borders, cities, ports, airports, roads and railways: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Satellite imagery: NASA Blue Marble (public domain), via the three-globe example assets
- Map glyphs: Open Sans (Apache 2.0), via [OpenMapTiles fonts](https://github.com/openmaptiles/fonts)
- Rendering: [MapLibre GL JS](https://maplibre.org/) and [deck.gl](https://deck.gl/)
- Flags shown in the UI are loaded from [flagcdn.com](https://flagcdn.com/)
