# Little Planet — A Pocket Adventure

Charming low-poly tiny-planet exploration prototype (Three.js + Vite), built from your screenshots.

One traversable sphere, 4 biomes, 7 Small Wonders, contextual `E` interactions, globe view, and a patchwork→restored progression loop.

## Play (double-click, no terminal needed)

- **Online:** **https://studio-9373398923-6294b.web.app** (Firebase Hosting)
- **Easiest locally:** double-click **`Play Little Planet.bat`** — it installs, builds, and opens the game by itself.
- **Or:** double-click **`index.html`** (forwards to the bundle) or **`dist/index.html`** directly — one self-contained file, no server needed. Clicking `index.html` before ever building shows nothing: run the `.bat` (or `npm run build`) first.
- **Dev mode:** `npm install` then `npm run dev`.

### Deploying

```bash
npm run build
firebase deploy --only hosting --project studio-9373398923-6294b
```

Firebase serves `dist/` (`firebase.json`), which is the single self-contained `index.html`.

## Controls

- `W A S D` walk · `Q` run · `Space` hop · `E` interact · `M` globe view
- Drag mouse to orbit the camera slightly.
- **Sea skiff:** follow the gold beacon south from Shell Cove, press `E` to board, sail with `W A S D` (`Q` trims the sail), and press `E` in open water to cast and again to reel in a 🐟. Different fish bite day/night/reef/deep — first catches are fast. Near shore, `E` steps back onto land. Sea fish can be eaten with `F` or cooked into meals. Check your Fish Book in the journal.
- **Trail beacon:** the current objective shows a gold light in the world + distance (`➤ 12m`). Walk toward it — `✨ You are here` means press `E`.
- **Homestead:** press `H` — Mud Hut now costs 3 wood, Big Pack (+8 slots) is buildable, cooking the same mix twice discovers recipes.
- **Wildlife:** deer, hares, fennecs, ember lizards, sea turtles, and surface fish schools are ambient and harmless.

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
