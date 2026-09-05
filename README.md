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

## The 7 Small Wonders

| # | Wonder | Where | How |
|---|--------|-------|-----|
| 1 | 🎃 Wondrous Harvest | Farmstead crop rows | `E` ×3: plant → water → harvest |
| 2 | 🔥 Eternal Flame | Fernwood campfire | `E` ×3 to tend |
| 3 | 🔔 Chapel Bell | Fernwood bell frame | `E` to ring |
| 4 | 🐻‍❄️ Polar Bear | Arctic Reach | `E` to greet |
| 5 | 🐟 Special Fish | Arctic ice hole | `E` to cast, wait, `E` to pull |
| 6 | 🐚 Exotic Shell | Shell Cove (3 shells) | `E` at each shell |
| 7 | 🏝️ Lost Lagoon | Cove shallows (south) | walk south / `E` to wade |

At 2 / 4 / 6 wonders the three broken bridges repair. At 7/7 the planet is whole.

## Structure

- `index.html` — HUD matching the screenshots (brand, wonder tracker, collection panel, biome label, `[E]` bar, controls hint)
- `src/style.css` — dark-pill minimalist UI, serif biome titles
- `src/main.js` — planet generation, biomes + props, spherical player controller + isometric follow camera, wonders, particles, synth chimes
