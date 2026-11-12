# Little Planet — Plan Checklist

Status of the "A Life on the Little Planet" plan. `[x]` = implemented and covered by a regression test (Node or browser suite in `../Temp/opencode/lptest`).

## Life journey
- [x] Five chapters: Arrival, Roots, Family, Mastery, Legacy (`progtest`: chapter advance, traits)
- [x] Age, birthdays, story beats, life traits, scars (`progtest`, `journeytest`)
- [x] Journal tabs: Story, Family, Technology, Wonders, Almanac, **Legacy** (`journeytest`: six tabs, legacy score/epitaph/story)
- [x] Epitaph, ancestor record, final score and generated life-story summary; wired into retirement/New Game+ (`progtest`)
- [x] New Game+ keeps blueprints/journal/heirloom tool and starts with an advanced kit (`progtest`)

## Weather & hazards
- [x] Weather director with 2–4 day forecast, almanac, mercy cooldown and difficulty scaling (`progtest`, `journeytest`)
- [x] **Seeded daily-run forecast** (`progtest`: same seed/day reproduces; browser `weapontest`)
- [x] In-world telegraph: cloud bank, fleeing birds, tracks, sheltering herd, NPC rumor (`progtest`, `weapontest`, screenshot)
- [x] Blizzard, thunderstorm, tornado, flood, drought, eruption, wildfire (spreading across cells, **to tree nodes** and buildings unless firebreak), hail (`progtest` start/end for all eight; wildfire tree/building tests)
- [x] Flood washes out bridges and strands animals; waters recede (`progtest`, `weapontest`)
- [x] Live VFX for snow/rain/ash/hail, lightning, floodwater, wildfire cells, **route-blocking lava flow**, and tornado, with **telegraphed lightning strike rings** (`progtest`, `weapontest`)
- [x] Counters: storm shutters, cellar, well, irrigation, steam pump, barn, ash mask, **heat gear**, firebreak, lightning rod, sandbags, hail netting, scarecrow (`progtest` hazard-counter matrix)
- [x] Pause-on-hazard accessibility option (`progtest`)

## Threats
- [x] Night robbers, toll robbers, rustlers, poachers with pay/fight/intimidate/free choices, and **night thieves steal tool upgrades** (`journeytest`, `progtest`)
- [x] **Named wanted outlaws** with custody status and delivery bounties (`progtest`, `weapontest`)
- [x] Rustler steals livestock; tracks lead to a recovery quest (`progtest`)
- [x] Alive-bounty capture pays more than a kill (`progtest`, `weapontest`)
- [x] Reputation dimensions honest/feared/kind with price, dawn, bounty and spawn effects (`progtest`)
- [x] Bounty board incl. alive/wanted/boar bounties (`weapontest`: seven rows)

## Research & tools
- [x] 41-node tree across Handmade → Copper → Iron → Mechanical → Powder (`journeytest`: 41 nodes), with **wheel/pinch zoom, drag-pan, reset and prerequisite/cost tooltips** (`journeytest`)
- [x] One active + one queued research with progress bar (`journeytest`)
- [x] Insight from discoveries, wonders, fish, hazards and chapters (`progtest`)
- [x] Fishing ladder handline → rod → net → trap; farming hoe → plough → seed drill → thresher; building hammer → saw → power tools (`progtest` tiers + dawn production)
- [x] Production buildings: workshop, windmill, sawmill, grain mill, steam pump, gunsmith, telegraph, radio, greenhouse (`progtest` built meshes)
- [x] Build-site placement: choose a structure on the homestead board, click a clear spot, then watch the settler walk over and hammer it up; sites persist, and family, herd, dog and hired hands follow the new house/barn/cabin (`herotrest`, `journeytest`)
- [x] Shoreline dock → raft → boat progression: dock placement is waterline-only, the raft unlocks after the dock, and Boatbuilding unlocks the boat upgrade; the dock craft sails, fishes and saves/loads (`docktest`, `dockbrowsertest`)
- [x] Fifteen fishing grounds with distinct species pools across ponds, coasts, reefs, deep water and the ice hole; shore markers, boat-zone fishing, and Journal → Almanac progress (`docktest`, `dockbrowsertest`)
- [x] All wild game huntable (prey, bears, wolves, ambient deer/hares/fennec/lizards/turtles and the oasis camel) with collectible 🍖 meat, plus Bowyer → bow/arrows and Hunting Rifle technology (`docktest`, `weapontest`)
- [x] Visible tool/gear changes: rod, saw, drill, holster, heat cloak (`weapontest`, `herotrest`)
- [x] Workshop clatter audio on research/crafting (`progtest`)

## Weapons & hunting
- [x] Melee hatchet → iron axe → war axe → halberd; ranged sling → bow → crossbow → musket → lever rifle → shotgun, with **Tab melee/ranged swap** (`journeytest`, `progtest`)
- [x] Manual aim/fire, magazines, reload, shotgun pellets, tracers (`weapontest`)
- [x] Weapon condition/wear, jamming at 0%, gunsmith repair, saved condition (`progtest`, `weapontest`)
- [x] Deer, hare and **boar**; clean-shot bonus, wounded blood-trail tracking, fur → leather crafting (`progtest`, `weapontest`)
- [x] Gunshot and weather audio (`progtest` sfx log)

## Character
- [x] Settler rig with five gear variants, blinking/expressions and weather/age idles; **jacket and trousers silhouette (no skirt)**; **context-specific gather poses (axe for wood/stone, hand-pick for berries/herbs, crouched shears for wool)**; **wade in shallow water, swim in deep water** (`herotrest`)
- [x] Human walk/run readability: outward shoulders, full opposition arm swing, elbow bend, wrist follow and visible skin hands; **Shift runs, Q dashes** (`armtest`)
- [x] **Nova the Starlight Explorer**: starry navy coat/trousers, glowing scarf, star hair clip, skin hands and a left-hand star lantern. Lantern is night-only, stows during tool/action poses, casts warm light, and reveals/collects hidden starlight sparkles near dark wonders (`novabrowsertest`)
- [x] **Blender-backed Phase 0**: `src/assets/nova.blend` → `nova.glb` (301 KB, 12 skinned meshes, 19 bones) with `Idle`/`Walk`/`Run`/`Chop` clips; loaded through `GLTFLoader` + `AnimationMixer`, with the axe/hammer on the right hand, the star lantern on the left hand, and the procedural rig as an automatic fallback (`novabrowsertest`, `novafallbacktest`)
- [x] Context-correct gathering: berries and crops fly as produce (not timber), herbs as leaves, wool as fluff, stone as chips; crops play the hand-pick pose on harvest (`herotrest`)
- [x] Three measured LOD levels remain on the procedural fallback; GLB Nova holds **17** calls at portrait/gameplay/far (target ≤35), fallback 60 (target ≤65) (`novastats`)

## Saves, UX, accessibility
- [x] Save v2 with v1 migration; all new systems persisted (`progtest`)
- [x] Cozy/Standard/Frontier difficulty (**Cozy halves incoming damage**) plus separate **Harsh Weather**, **Thieves & rustlers** and **Permadeath** toggles (`progtest`)
- [x] Reduced flash/shake, large text, high contrast, colorblind-safe hazard badges (`[STORM]`), pause-on-hazard (`progtest`, `weapontest`)
- [x] Chapter intro cards, almanac, loadout, bounty and journal overlays (`journeytest`); **detailed villagers/traders with faces, limbs and layered clothing** (`herotrest`: 41-part villager rig)
- [x] Single-file build deployed to Firebase with live SHA256 verification; **pacing is 300 s days and 8 days/season (32-day year)** (`progtest`, `weapontest`)

## Known scope notes
- Hazards are recoverable and telegraphed; guns remain loud late-game tools rather than a power fantasy.
- The game stays a single-file deployable (`src/main.js` + panels), with regression suites exercising chapters, hazards, research, weapons, threats, saves, hero rig and UI.
