# Little Planet — A Pocket Adventure

Charming low-poly tiny-planet exploration prototype (Three.js + Vite), built from your screenshots.

One traversable sphere, 4 biomes, 7 Small Wonders, contextual `E` interactions, globe view, and a patchwork→restored progression loop.

## Play (double-click, no terminal needed)

- **Easiest:** double-click **`Play Little Planet.bat`** — it installs, builds, and opens the game by itself.
- **Or:** double-click **`index.html`** (forwards to the bundle) or **`dist/index.html`** directly — one self-contained file, no server needed. Clicking `index.html` before ever building shows nothing: run the `.bat` (or `npm run build`) first.
- **Dev mode:** `npm install` then `npm run dev`.

## Controls

- `W A S D` walk · `Q` run · `Space` hop · `E` interact · `M` globe view
- Drag mouse to orbit the camera slightly.

## The 7 Worlds & Small Wonders

| # | World | Moment | How |
|---|-------|--------|-----|
| 1 | Fernwood | 🔥 Eternal Flame | Campfire `E` ×3 to tend |
| 2 | Clover Fields | 🌾 Bountiful Harvest | Crop rows `E` ×3: plant → water → harvest |
| 3 | Sunstone Oasis | ☀️ Wake the Oasis | Spring `E` ×3: brush sand → turn stones → wake |
| 4 | Shell Cove | 🔔 Ring the Bell | Dune bell `E` to ring |
| 5 | Tideglass Reef | 💡 Light the Lighthouse | Rock lighthouse `E` to light (swimmable shallows) |
| 6 | Ember Heights | 🌋 Scan the Volcano | Tripod `E`, hold still 2.5s |
| 7 | Northlight | 🌌 Wake the Aurora | Stone circle `E` |

At 2 / 4 / 6 wonders the three broken bridges repair. At 7/7 the planet is whole.
Press `J` (or click the tracker) for the field journal. Deep links: `dist/index.html#oasis` etc. (`fernwood clover oasis cove reef ember north`).

## Structure

- `index.html` — HUD matching the screenshots (brand, wonder tracker, collection panel, biome label, `[E]` bar, controls hint)
- `src/style.css` — dark-pill minimalist UI, serif biome titles
- `src/main.js` — planet generation, biomes + props, spherical player controller + isometric follow camera, wonders, particles, synth chimes
