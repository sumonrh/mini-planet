import * as THREE from 'three';

/* ============================================================
   LITTLE PLANET — A Pocket Adventure (prototype)
   Single-file tiny-planet exploration game.
   WASD walk · Q run · Space hop · E interact · M globe
   ============================================================ */

const R = 30;
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  const t = document.getElementById('toast');
  t.textContent = '⚠️ 3D unavailable: this browser blocked WebGL. Try Chrome or Edge with hardware acceleration enabled.';
  t.classList.remove('hidden');
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1d28);
scene.fog = new THREE.Fog(0x0d1d28, 70, 160);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 30, 60);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xd8f4ff, 0x2a3a2a, 1.05));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(40, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.06;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x88bbff, 0.4);
fill.position.set(-30, 10, -40);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffd9b0, 0.5); // warm low rim for form + depth
rim.position.set(-15, -20, 35);
scene.add(rim);

// ---------- helpers ----------
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0.0, ...opts });
}
function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}
const DEG = Math.PI / 180;
function latLonToVec3(latDeg, lonDeg, h = 0) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const c = Math.cos(lat);
  return V3(c * Math.cos(lon) * (R + h), Math.sin(lat) * (R + h), c * Math.sin(lon) * (R + h));
}
function orientOnSphere(obj, pos, yaw = 0) {
  const n = pos.clone().normalize();
  obj.position.copy(pos);
  obj.quaternion.setFromUnitVectors(UP, n);
  obj.rotateY(yaw);
  return n;
}
// Seven worlds: polar Northlight + six tuned equatorial sectors (lon degrees).
// Sector borders sit in the empty gaps between prop clusters so nothing moves.
function biomeAt(n) {
  if (n.y > 0.52) return 'arctic';
  if (n.y < -0.32) return 'lagoon';
  let lon = Math.atan2(n.z, n.x) / DEG;
  if (lon < 0) lon += 360;
  if (lon < 62) return 'farm';      // Clover Fields
  if (lon < 128) return 'oasis';    // Sunstone Oasis
  if (lon < 178) return 'forest';   // Fernwood
  if (lon < 258) return 'reef';     // Tideglass Reef
  if (lon < 298) return 'cove';     // Shell Cove
  return 'volcano';                 // Ember Heights
}
const BIOME_META = {
  farm: { code: 'FARM · 02', name: 'Clover Fields', desc: 'A little care makes a world of difference.' },
  oasis: { code: 'DESERT · 03', name: 'Sunstone Oasis', desc: 'A quiet green secret among the golden dunes.' },
  forest: { code: 'FOREST · 01', name: 'Fernwood', desc: 'Every great adventure starts with a small step.' },
  reef: { code: 'OCEAN · 05', name: 'Tideglass Reef', desc: 'There is a whole other world beneath the blue.' },
  cove: { code: 'BEACH · 04', name: 'Shell Cove', desc: 'Leave only tiny footprints.' },
  volcano: { code: 'VOLCANO · 06', name: 'Ember Heights', desc: 'Even a sleeping mountain has stories to tell.' },
  arctic: { code: 'ARCTIC · 07', name: 'Northlight', desc: 'The quietest places hold the brightest wonders.' },
  lagoon: { code: 'BEACH · 04', name: 'Shell Cove', desc: 'Leave only tiny footprints.' },
};

// ---------- stars ----------
{
  const g = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 600; i++) {
    const v = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(140, 220));
    pts.push(v.x, v.y, v.z);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd9e8, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.7 })));
}

// ---------- planet surface (patchwork sphere) ----------
function heightFor(n) {
  if (n.y > 0.52) return 0.7;
  if (n.y < -0.32) return -0.9;
  const b = biomeAt(n);
  if (b === 'farm') return 0.55;
  if (b === 'oasis') return 0.45;
  if (b === 'forest') return 0.6;
  if (b === 'reef') {
    // dry island around the lighthouse so the traveler stands above the water
    const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG;
    let lon = Math.atan2(n.z, n.x) / DEG;
    if (lon < 0) lon += 360;
    let dLon = Math.abs(lon - 230);
    if (dLon > 180) dLon = 360 - dLon;
    const d = Math.hypot(lat - 2, dLon);
    if (d < 8) return 0.45;
    return -0.15; // shallow shelf: the ocean covers it, swimmable
  }
  if (b === 'cove') return 0.35;
  if (b === 'volcano') return 0.85;
  return 0.35;
}
function groundColor(n, out) {
  let lon = Math.atan2(n.z, n.x);
  if (lon < 0) lon += Math.PI * 2;
  const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG;
  const wob = Math.sin(n.x * 12.9) * Math.sin(n.z * 7.7) * Math.sin(n.y * 9.1);
  if (n.y > 0.52) {
    const t = THREE.MathUtils.clamp((n.y - 0.52) * 4 + wob * 0.15, 0, 1);
    out.setHex(0xe9f4fa).lerp(new THREE.Color(0xbfe0f2), t * 0.55);
    if (wob > 0.55) out.setHex(0x9fd4ef);
    return out;
  }
  if (n.y < -0.32) { out.setHex(0x1d7fa8); return out; }
  const b = biomeAt(n);
  if (b === 'farm') {
    out.setHex(0x7cc25e);
    if (Math.sin(lon * 9 + lat) > 0.4) out.setHex(0x8fd06a);
    if (lat < 2 && lat > -12) out.setHex(0xe6c47c); // dirt belt
  } else if (b === 'oasis') {
    out.setHex(0xe6c47c); // golden dunes
    if (Math.sin(lon * 7 - lat * 0.7) > 0.35) out.setHex(0xf0d68e);
    if (wob > 0.55) out.setHex(0xd9b166);
    if (lat < -6) out.setHex(0xead9a8); // pale flats
  } else if (b === 'forest') {
    out.setHex(0x4da855);
    if (wob > 0.2) out.setHex(0x3f9a4c);
    if (wob < -0.5) out.setHex(0x63bd63);
  } else if (b === 'reef') {
    out.setHex(0x8fd4c8); // shallow shelf under the water
    if (wob > 0.3) out.setHex(0x6fbfae);
    if (lat > 6) out.setHex(0xefe0ae); // sandy rim
    let dLonI = Math.abs(lon / DEG - 230);
    if (dLonI > 180) dLonI = 360 - dLonI;
    if (Math.hypot(lat - 2, dLonI) < 8) out.setHex(0xefe0ae); // lighthouse island sand
  } else if (b === 'volcano') {
    out.setHex(0x4a4038); // dark basalt
    if (wob > 0.25) out.setHex(0x5d4a38);
    if (wob < -0.45) out.setHex(0x38302a);
    if (Math.sin(lon * 13 + lat * 1.7) > 0.92) out.setHex(0xc25a30); // cooling lava flecks
  } else {
    out.setHex(0xf2dd9e); // cove sand
    if (lat > 22) out.setHex(0x8cc86a);
    if (wob > 0.6) out.setHex(0xead18e);
  }
  out.offsetHSL(0, 0, rand(-0.015, 0.015));
  return out;
}
let planetMesh = null; // raycast target for click-to-move
const planetGroup = new THREE.Group();
scene.add(planetGroup);
{
  const geo = new THREE.IcosahedronGeometry(R, 49); // 4x polys: faces 20*50^2=50k (was 20*25^2=12.5k)
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const h = heightFor(n);
    v.copy(n).multiplyScalar(R + h);
    pos.setXYZ(i, v.x, v.y, v.z);
    // per-face jitter: same for each triangle
    const jitter = (i % 3 === 0) ? rand(-0.02, 0.02) : 0;
    groundColor(n, c);
    c.offsetHSL(0, 0, jitter);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const planet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  planet.receiveShadow = true;
  planetGroup.add(planet);
  planetMesh = planet;
}
// ocean shell
const ocean = mesh(new THREE.SphereGeometry(R + 0.12, 96, 64), new THREE.MeshStandardMaterial({ color: 0x2ec4d8, transparent: true, opacity: 0.88, roughness: 0.35, flatShading: true }), 0, 0, 0, false);
ocean.receiveShadow = true;
scene.add(ocean);

// ---------- animated registries ----------
const tickers = []; // fn(t, dt)
const interactables = [];
const occluders = []; // tall structures the follow camera must not clip through
const camRay = new THREE.Raycaster();
function addInteract(def) { interactables.push({ radius: 3.6, ...def }); }

// ---------- gather nodes (step 2: wood/stone/food/wool + tools) ----------
// Declared early: biome blocks call addNode() while the module evaluates.
const nodes = [];
const tools = { axe: 1, pick: 1 }; // speed multiplier per tool; research raises these
function addNode(opt) {
  const nd = { prog: 0, need: 3, depleted: false, respawnT: 0, fall: 0, fallTarget: 0, shake: 0, trunkStock: 0, stock: opt.stock || 2, ...opt };
  nd.maxStock = nd.stock;
  nd.maxTrunk = nd.trunkStock;
  nodes.push(nd);
  addInteract({
    id: 'node' + nodes.length, pos: anchor(opt.lat, opt.lon, 1), node: nd,
    kind: 'GATHER', label: () => nodeLabel(nd), onUse: () => gatherHit(nd),
  });
  return nd;
}
function nodeLabel(nd) {
  if (nd.depleted) {
    if (nd.fallRoot && nd.trunkStock > 0) return `Split Trunk ${Math.min(nd.prog, 2)}/2`;
    return 'Regrowing…';
  }
  const p = Math.min(nd.prog, nd.need);
  return `${nd.verb} ${nd.name}` + (p > 0 ? ` ${p}/${nd.need}` : '');
}
function gatherHit(nd) {
  const splitting = nd.depleted && nd.fallRoot && nd.trunkStock > 0;
  if (nd.depleted && !splitting) return toast('🌱 Regrowing… give it a moment.');
  if (meters.energy < 2) return toast('😮‍💨 Too tired to work — eat (F) or rest.');
  meters.energy = Math.max(0, meters.energy - 2);
  if (nd.shakeRoot) {
    if (!nd.home) nd.home = nd.shakeRoot.position.clone();
    nd.shake = 1; // vibrate
  }
  if (nd.tool === 'axe') startChop(); // swing the axe
  nd.prog += nd.tool ? (tools[nd.tool] || 1) : 1;
  burst(player.position.clone(), nd.color, 8, 1.5);
  chime(nd.chime);
  const th = splitting ? 2 : nd.need;
  if (nd.prog >= th) {
    if (!addItem(nd.item, 1)) { nd.prog = th; return; } // pack full: keep it ready
    nd.prog = 0;
    toast(`+1 ${nd.icon} ${nd.item}`);
    if (splitting) {
      flyChunk(nd.fallRoot.position.clone()); // split piece flies to the pack
      if (--nd.trunkStock <= 0) nd.fallRoot.visible = false; // trunk fully cleared
    } else if (--nd.stock <= 0) depleteNode(nd);
  }
  renderStats();
}
function depleteNode(nd) {
  nd.depleted = true;
  nd.respawnT = nd.respawn;
  if (nd.fallRoot) { nd.fallTarget = 1; nd.fallYaw = rand(Math.PI * 2); nd.thudded = false; chime(200); }
  if (nd.onDeplete) nd.onDeplete();
}
function regrowNode(nd) {
  nd.depleted = false;
  nd.stock = nd.maxStock;
  nd.trunkStock = nd.maxTrunk;
  nd.prog = 0;
  if (nd.fallRoot) { nd.fallRoot.visible = true; nd.fallTarget = 0; } // stand back up
  if (nd.onRegrow) nd.onRegrow();
}
// split-off log chunks arc from the trunk into the traveler's pack
const chunks = [];
function flyChunk(from, color = 0x7a5230) {
  const m = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 6), mat(color), from.x, from.y, from.z, false);
  m.rotation.z = Math.PI / 2;
  scene.add(m);
  chunks.push({ m, life: 0.7 });
}
tickers.push((t, dt) => {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    c.life -= dt;
    c.m.position.lerp(player.position, Math.min(1, dt * 6));
    c.m.rotation.x += dt * 6;
    if (c.life <= 0) { scene.remove(c.m); c.m.geometry.dispose(); chunks.splice(i, 1); }
  }
});
// axe chop swing: raise overhead and strike, ~0.5s, rides on top of the walk swing
let chopT = 0;
let gripBlend = 0; // 0 = arms free, 1 = both hands closed on the axe handle
let wadeBlend = 0; // 0 = dry stride, 1 = high-stepping wade
function startChop() { chopT = 0.0001; }
function chopOffset() {
  // flat strike: the shoulder only dips — the elbow does the snapping
  if (chopT <= 0) return 0;
  return -0.9 * Math.sin(Math.PI * Math.min(chopT, 1));
}
function elbowChop() {
  // cock the forearm back, snap it through flat, settle
  if (chopT <= 0) return 0;
  const t = Math.min(chopT, 1);
  if (t < 0.3) return -1.3 * (t / 0.3);
  if (t < 0.55) { const u = (t - 0.3) / 0.25; return -1.3 * (1 - u) + 0.15 * u; }
  return 0.15 * (1 - (t - 0.55) / 0.45);
}
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
tickers.push((t, dt) => {
  if (chopT > 0) { chopT += dt / 0.5; if (chopT >= 1) chopT = 0; }
  for (const nd of nodes) {
    if (nd.depleted) { nd.respawnT -= dt; if (nd.respawnT <= 0) regrowNode(nd); }
    if (nd.shakeRoot && nd.shake > 0) {
      nd.shake = Math.max(0, nd.shake - dt * 2.5);
      const s = nd.shake * 0.12;
      if (nd.shake > 0) {
        nd.shakeRoot.position.set(nd.home.x + rand(-s, s), nd.home.y + rand(-s, s), nd.home.z + rand(-s, s));
      } else nd.shakeRoot.position.copy(nd.home);
    }
    if (nd.fallRoot) {
      if (nd.fall !== nd.fallTarget) {
        if (!nd.homeQ) nd.homeQ = nd.fallRoot.quaternion.clone();
        const dir = Math.sign(nd.fallTarget - nd.fall);
        nd.fall = THREE.MathUtils.clamp(nd.fall + dir * dt * 1.4, 0, 1);
        if (nd.fall === 1 && nd.fallTarget === 1 && !nd.thudded) { nd.thudded = true; chime(120); }
      }
      if (nd.fall > 0) {
        const e = nd.fall * nd.fall * nd.fall; // ease-in: tips faster as it goes
        _q1.setFromAxisAngle(UP, nd.fallYaw || 0);
        _q2.setFromAxisAngle(_X, 1.45 * e);
        nd.fallRoot.quaternion.copy(nd.homeQ).multiply(_q1).multiply(_q2);
      } else if (nd.homeQ) {
        nd.fallRoot.quaternion.copy(nd.homeQ);
        nd.homeQ = null;
      }
    }
  }
});

// ---------- prop builders ----------
function steppingStones(pts, colorHex = 0xf7e8bd, size = 0.55) {
  const g = new THREE.Group();
  const m = mat(colorHex);
  pts.forEach(([la, lo], i) => {
    const p = latLonToVec3(la, lo, heightFor(latLonToVec3(la, lo, 0).normalize()) + 0.12);
    const s = mesh(new THREE.DodecahedronGeometry(size * (1 - i * 0.008), 0), m);
    orientOnSphere(s, p, rand(Math.PI * 2));
    s.scale.y = 0.35;
    g.add(s);
  });
  scene.add(g);
  return g;
}
function makeTree(h = 3) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 6), mat(0x7a5230), 0, 0.6, 0));
  const greens = [0x1f7a3a, 0x2fa055, 0x26854a];
  for (let i = 0; i < 3; i++) {
    const cone = mesh(new THREE.ConeGeometry(1.5 - i * 0.35, 1.5, 7), mat(greens[i % 3]), 0, 1.6 + i * 1.0, 0);
    g.add(cone);
  }
  g.scale.setScalar(h / 3);
  return g;
}
function makePine(x, z, s) { const t = makeTree(s); t.position.set(x, z, 0); return t; }
function scatterOnSphere(group, latC, lonC, spread, count, factory) {
  for (let i = 0; i < count; i++) {
    const la = latC + rand(-spread, spread), lo = lonC + rand(-spread, spread);
    const base = latLonToVec3(la, lo, 0);
    const p = latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05);
    const o = factory(i);
    orientOnSphere(o, p, rand(Math.PI * 2));
    group.add(o);
  }
}
function makeSheep() {
  const g = new THREE.Group();
  const wool = mat(0xf5f2ea);
  const body = mesh(new THREE.IcosahedronGeometry(0.85, 1), wool, 0, 0.9, 0);
  body.scale.set(1.2, 0.9, 0.9); g.add(body);
  const head = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x3a3330), 1.0, 0.8, 0);
  g.add(head);
  const legs = [];
  for (const [lx, lz] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.55, lz);
    pivot.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5), mat(0x3a3330), 0, -0.3, 0));
    g.add(pivot);
    legs.push(pivot);
  }
  const ph = rand(Math.PI * 2);
  tickers.push((t) => {
    // graze in slow cycles, shuffle hooves, breathe
    const graze = Math.max(0, Math.sin(t * 0.35 + ph));
    head.position.y = 0.8 - graze * graze * 0.45;
    head.position.x = 1.0 + graze * graze * 0.15;
    const step = Math.sin(t * 6 + ph) * (0.5 + 0.5 * Math.sin(t * 0.9 + ph * 2));
    legs[0].rotation.x = step * 0.3; legs[3].rotation.x = step * 0.3;
    legs[1].rotation.x = -step * 0.3; legs[2].rotation.x = -step * 0.3;
    body.position.y = 0.9 + Math.abs(Math.sin(t * 6 + ph)) * 0.03;
  });
  return g;
}
function makeBear(scale = 1, cub = false) {
  const g = new THREE.Group();
  const fur = mat(cub ? 0xffffff : 0xf2f7fa);
  const body = mesh(new THREE.SphereGeometry(1, 7, 6), fur, 0, 0.9, 0);
  body.scale.set(1.5, 0.9, 0.9); g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.55, 7, 6), fur, 1.5, 1.2, 0);
  g.add(head);
  g.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), mat(0x222222), 1.95, 1.15, 0.15, false));
  const legs = [];
  for (const [lx, lz] of [[-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.6, lz);
    pivot.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.8, 6), fur, 0, -0.3, 0));
    g.add(pivot);
    legs.push(pivot);
  }
  const ph = rand(Math.PI * 2);
  const amble = cub ? 5 : 2.2; // cubs scamper, adults lumber
  tickers.push((t) => {
    const s = Math.sin(t * amble + ph);
    legs[0].rotation.x = s * 0.45; legs[3].rotation.x = s * 0.45;
    legs[1].rotation.x = -s * 0.45; legs[2].rotation.x = -s * 0.45;
    body.rotation.z = s * 0.06; // lumbering roll
    body.position.y = 0.9 + Math.abs(Math.cos(t * amble + ph)) * 0.08;
    head.position.y = 1.2 + Math.sin(t * amble * 0.5 + ph) * 0.1;
  });
  g.scale.setScalar(scale);
  return g;
}
function makeSeal() {
  const g = new THREE.Group();
  const m = mat(0x7d8b96);
  const b = mesh(new THREE.SphereGeometry(0.7, 7, 6), m, 0, 0.4, 0);
  b.scale.set(1.5, 0.7, 0.8); g.add(b);
  const head = mesh(new THREE.SphereGeometry(0.35, 6, 5), m, 1.0, 0.55, 0);
  g.add(head);
  const tail = mesh(new THREE.ConeGeometry(0.25, 0.7, 5), m, -1.0, 0.45, 0, false);
  tail.rotation.z = 1.2; g.add(tail);
  const ph = rand(Math.PI * 2);
  tickers.push((t) => {
    b.scale.y = 0.7 + Math.sin(t * 2.2 + ph) * 0.08; // breathing flop
    head.position.y = 0.55 + Math.max(0, Math.sin(t * 0.8 + ph)) * 0.25; // periscope look
    head.rotation.z = Math.sin(t * 0.8 + ph) * 0.2;
    tail.rotation.x = Math.sin(t * 3 + ph) * 0.4; // tail swish
  });
  return g;
}
function makePalm() {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.2, 6), mat(0x8a6238), 0, 2.1, 0);
  trunk.rotation.z = 0.15; g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const f = mesh(new THREE.ConeGeometry(0.55, 2.6, 4), mat(0x2f9e5f), 0, 4.2, 0, false);
    f.rotation.z = Math.PI / 2.4; f.rotation.y = (i / 6) * Math.PI * 2;
    f.position.y = 4.2;
    const pivot = new THREE.Group(); pivot.add(f);
    f.position.set(1.1, 0, 0);
    pivot.position.set(0.3, 4.2, 0); pivot.rotation.y = (i / 6) * Math.PI * 2;
    g.add(pivot);
  }
  return g;
}
function makeCrystal(s = 1) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: 0x38c6ff, flatShading: true, roughness: 0.25, metalness: 0.1, emissive: 0x0b5f8a, emissiveIntensity: 0.35 });
  const c1 = mesh(new THREE.OctahedronGeometry(1, 0), cm, 0, 1.6, 0);
  c1.scale.set(0.7, 2.2, 0.7); g.add(c1);
  const c2 = mesh(new THREE.OctahedronGeometry(0.7, 0), cm, 0.9, 0.9, 0.3);
  c2.scale.set(0.7, 1.8, 0.7); c2.rotation.z = 0.3; g.add(c2);
  g.scale.setScalar(s);
  tickers.push((t) => { cm.emissiveIntensity = 0.3 + Math.sin(t * 2 + s * 5) * 0.15; });
  return g;
}

function makeBush() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(0.7, 1), mat(0x2f9e5f), 0, 0.5, 0));
  const berries = new THREE.Group();
  const bm = mat(0xe04a5a);
  for (let k = 0; k < 5; k++)
    berries.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), bm, rand(-0.5, 0.5), rand(0.3, 0.9), rand(-0.5, 0.5), false));
  g.add(berries);
  return { g, berries };
}

// ---------- FARMSTEAD ----------
const farmGroup = new THREE.Group(); scene.add(farmGroup);
let cropSpots = [];
{
  const latC = 12, lonC = 40;
  const put = (obj, la, lo, h = 0.1, yaw = 0) => {
    const base = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(base.normalize()) + h), yaw);
    farmGroup.add(obj); return obj;
  };
  // barn
  const barn = new THREE.Group();
  barn.add(mesh(new THREE.BoxGeometry(4.4, 2.8, 5.2), mat(0xc93a3a), 0, 1.4, 0));
  const r1 = mesh(new THREE.BoxGeometry(2.9, 0.25, 5.6), mat(0x2f4f4a), -1.25, 3.4, 0); r1.rotation.z = 0.6; barn.add(r1);
  const r2 = mesh(new THREE.BoxGeometry(2.9, 0.25, 5.6), mat(0x2f4f4a), 1.25, 3.4, 0); r2.rotation.z = -0.6; barn.add(r2);
  barn.add(mesh(new THREE.BoxGeometry(1.4, 2.0, 0.15), mat(0xf3e9dc), 0, 1.0, 2.65));
  occluders.push(put(barn, latC + 9, lonC - 6, 0, 0.6));
  // silo
  const silo = new THREE.Group();
  silo.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 10), mat(0xcfd8dc), 0, 2.1, 0));
  silo.add(mesh(new THREE.ConeGeometry(1.2, 1.2, 10), mat(0x90a4ae), 0, 4.8, 0));
  occluders.push(put(silo, latC + 9, lonC + 2, 0, 0));
  // windmill (animated)
  const mill = new THREE.Group();
  mill.add(mesh(new THREE.CylinderGeometry(0.7, 1.2, 6.5, 8), mat(0xe8e2d4), 0, 3.2, 0));
  mill.add(mesh(new THREE.ConeGeometry(1.0, 1.2, 8), mat(0xc9573a), 0, 6.9, 0));
  const blades = new THREE.Group(); blades.position.set(0, 6.4, 1.1);
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.BoxGeometry(0.5, 3.2, 0.08), mat(0xf5efdd), 0, 1.8, 0, false);
    const holder = new THREE.Group(); holder.rotation.z = (i / 4) * Math.PI * 2; holder.add(b); blades.add(holder);
  }
  mill.add(blades);
  tickers.push((t, dt) => { blades.rotation.z += dt * 0.9; });
  occluders.push(put(mill, latC + 12, lonC + 9, 0, -0.5));
  // farmhouse
  const house = new THREE.Group();
  house.add(mesh(new THREE.BoxGeometry(3, 2.2, 3.4), mat(0xf3e4c8), 0, 1.1, 0));
  house.add(mesh(new THREE.ConeGeometry(2.7, 1.6, 4), mat(0x7a8b6f), 0, 3.0, 0));
  occluders.push(put(house, latC - 9, lonC - 12, 0, 2.2));
  // tractor
  const tractor = new THREE.Group();
  tractor.add(mesh(new THREE.BoxGeometry(2.2, 1.0, 1.3), mat(0x2fa05a), 0, 1.0, 0));
  tractor.add(mesh(new THREE.BoxGeometry(1.1, 1.0, 1.2), mat(0x37b567), -0.7, 1.9, 0));
  const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10); wg.rotateX(Math.PI / 2);
  const wm = mat(0x222222);
  tractor.add(mesh(wg, wm, 0.8, 0.55, 0.75)); tractor.add(mesh(wg, wm, 0.8, 0.55, -0.75));
  const wg2 = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 10); wg2.rotateX(Math.PI / 2);
  tractor.add(mesh(wg2, wm, -0.8, 0.4, 0.7)); tractor.add(mesh(wg2, wm, -0.8, 0.4, -0.7));
  put(tractor, latC + 5, lonC + 5, 0.1, 1.2);
  tickers.push((t) => { tractor.position.y += Math.sin(t * 20) * 0.0006; });
  // hay bales
  for (let i = 0; i < 4; i++) {
    const hay = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 9), mat(0xe8c96a));
    hay.rotation.z = Math.PI / 2;
    put(hay, latC + 6 + rand(-2, 2), lonC - 3 + rand(-2, 2), 0.7, rand(3));
  }
  // fences: sheep pen rectangle
  const fenceM = mat(0xf1e8d5);
  const penLA = latC - 2, penLO = lonC - 8;
  for (let i = -3; i <= 3; i++) {
    for (const [dla, dlo] of [[4, 0], [-4, 0]]) {
      const post = mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fenceM);
      put(post, penLA + dla, penLO + i * 1.6, 0.5);
    }
    for (const [dla, dlo] of [[0, 5], [0, -5]]) {
      const post = mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fenceM);
      put(post, penLA + i * 1.15, penLO + dlo, 0.5);
    }
  }
  // sheep (shearable wool node — step 2; befriending comes in step 3)
  const sheepBodies = [];
  const sheepAnchor = latLonToVec3(penLA, penLO, heightFor(latLonToVec3(penLA, penLO, 0).normalize()) + 0.1);
  for (let i = 0; i < 4; i++) {
    const s = makeSheep();
    const p = sheepAnchor.clone().add(V3(rand(-2, 2), rand(0, 0.5), rand(-2, 2)));
    // re-project onto sphere
    const n = p.clone().normalize();
    orientOnSphere(s, n.clone().multiplyScalar(R + heightFor(n) + 0.1), rand(6));
    farmGroup.add(s);
    sheepBodies.push(s.children[0]); // woolly body; scaled down while shorn
    tickers.push((t) => { s.position.y += Math.sin(t * 3 + i * 2) * 0.0012; s.rotation.y += 0.0006; });
  }
  // crop rows (interactive wonder)
  const cropGroup = new THREE.Group(); farmGroup.add(cropGroup);
  const soilM = mat(0x8a5a33), sproutM = mat(0x3fae4e), pumpkinM = mat(0xe07b2a);
  for (let r = 0; r < 4; r++) {
    const soil = mesh(new THREE.BoxGeometry(1.4, 0.3, 7), soilM);
    const la = latC - 4, lo = lonC + 6 + r * 2.2;
    const base = latLonToVec3(la, lo, 0);
    orientOnSphere(soil, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.1), 0.1);
    cropGroup.add(soil);
    for (let k = 0; k < 5; k++) {
      const sprout = mesh(new THREE.IcosahedronGeometry(0.28, 0), sproutM, 0, 0, 0);
      const sla = la - 2.6 + k * 1.3, slo = lo;
      const b2 = latLonToVec3(sla, slo, 0);
      orientOnSphere(sprout, latLonToVec3(sla, slo, heightFor(b2.normalize()) + 0.45), 0);
      sprout.scale.setScalar(0.4);
      cropGroup.add(sprout);
      cropSpots.push({ mesh: sprout, mats: { sproutM, pumpkinM }, baseScale: 1 });
    }
  }
  window.__crops = cropSpots;
  // shear node on the pen + a forage bush by the dirt belt
  addNode({
    type: 'wool', item: 'wool', name: 'Sheep', verb: 'Shear', icon: '🐑', color: 0xffffff, chime: 500,
    lat: penLA, lon: penLO, kind: 'GATHER', tool: null, stock: 1, respawn: 90,
    onDeplete: () => sheepBodies.forEach((b) => b.scale.set(0.9, 0.68, 0.68)),
    onRegrow: () => sheepBodies.forEach((b) => b.scale.set(1.2, 0.9, 0.9)),
  });
  {
    const { g: bush, berries } = makeBush();
    put(bush, 5, 38, 0, 1);
    addNode({
      type: 'food', item: 'food', name: 'Berries', verb: 'Pick', icon: '🍎', color: 0xe04a5a, chime: 560,
      lat: 5, lon: 38, kind: 'GATHER', tool: null, stock: 2, respawn: 60,
      onDeplete: () => (berries.visible = false), onRegrow: () => (berries.visible = true),
    });
  }
  steppingStones([[16, 32], [14, 36], [12, 40], [10, 44], [8, 48], [4, 46], [0, 44]], 0xf0d68a, 0.5);
  // farmer NPC
  const farmer = new THREE.Group();
  farmer.add(mesh(new THREE.CapsuleGeometry(0.45, 0.8, 3, 8), mat(0xe8a33d), 0, 1.1, 0));
  farmer.add(mesh(new THREE.SphereGeometry(0.4, 8, 7), mat(0xf2c49b), 0, 2.1, 0));
  farmer.add(mesh(new THREE.ConeGeometry(0.55, 0.5, 8), mat(0xe8d27a), 0, 2.55, 0, false));
  put(farmer, latC - 3, lonC + 10, 0, 1);
  tickers.push((t) => { farmer.rotation.y += Math.sin(t) * 0.002; });
}

// ---------- WHISPERING FOREST ----------
let fireLight, fireCone, bellGroup;
{
  const g = new THREE.Group(); scene.add(g);
  const latC = 18, lonC = 160;
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  // keep a clearing around the campfire (12,158) + spawn (14,156) so both stay visible
  const nearFire = (la, lo) => Math.hypot(la - 12, lo - 158) < 6 || Math.hypot(la - 14, lo - 156) < 4.5;
  for (let i = 0; i < 46; i++) {
    const la = latC + 4 + rand(-14, 14), lo = lonC + rand(-14, 14);
    if (nearFire(la, lo)) continue;
    const base = latLonToVec3(la, lo, 0);
    const o = makeTree(rand(2.4, 4.4));
    orientOnSphere(o, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    g.add(o);
  }
  for (let i = 0; i < 12; i++) {
    const la = latC - 8 + rand(-8, 8), lo = lonC + 6 + rand(-8, 8);
    if (nearFire(la, lo)) continue;
    const base = latLonToVec3(la, lo, 0);
    const o = makeTree(rand(1.8, 3));
    orientOnSphere(o, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    g.add(o);
  }
  // gather nodes: choppable pines (shake per hit, keel over when felled)
  for (const [la, lo] of [[16, 152], [10, 153], [17, 161], [9, 162]]) {
    const tree = makeTree(3);
    put(tree, la, lo, 0, rand(3));
    addNode({
      type: 'wood', item: 'wood', name: 'Pine', verb: 'Chop', icon: '🪵', color: 0x8fd06a, chime: 420,
      lat: la, lon: lo, kind: 'GATHER', tool: 'axe', stock: 3, respawn: 90, trunkStock: 2,
      shakeRoot: tree, fallRoot: tree,
    });
  }
  for (const [la, lo] of [[13, 161], [11, 155]]) {
    const { g: bush, berries } = makeBush();
    put(bush, la, lo, 0, rand(3));
    addNode({
      type: 'food', item: 'food', name: 'Berries', verb: 'Pick', icon: '🍎', color: 0xe04a5a, chime: 560,
      lat: la, lon: lo, kind: 'GATHER', tool: null, stock: 2, respawn: 60,
      onDeplete: () => (berries.visible = false), onRegrow: () => (berries.visible = true),
    });
  }
  // pond
  const pond = mesh(new THREE.CircleGeometry(3.2, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4fc3d8, roughness: 0.3, flatShading: true }), 0, 0, 0, false);
  put(pond, latC - 2, lonC + 10, 0.22, 0);
  // campfire
  const fire = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const st = mesh(new THREE.DodecahedronGeometry(0.28, 0), mat(0x8d8d94), Math.cos(i) * 1.2, 0.2, Math.sin(i) * 1.2);
    fire.add(st);
  }
  for (let i = 0; i < 3; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.0, 6), mat(0x7a5230), 0, 0.35, 0);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i / 3) * Math.PI; fire.add(log);
  }
  fireCone = mesh(new THREE.ConeGeometry(0.7, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0xff8c2e, emissive: 0xff5a00, emissiveIntensity: 1.2, flatShading: true }), 0, 1.0, 0, false);
  fire.add(fireCone);
  fireLight = new THREE.PointLight(0xff9a3d, 12, 14);
  fireLight.position.set(0, 1.6, 0); fire.add(fireLight);
  // seating logs
  for (let i = 0; i < 3; i++) {
    const seat = mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 7), mat(0x8a6238), Math.cos(i * 2.1) * 2.8, 0.4, Math.sin(i * 2.1) * 2.8);
    seat.rotation.z = Math.PI / 2; seat.rotation.y = i; fire.add(seat);
  }
  put(fire, latC - 6, lonC - 2, 0, 0);
  tickers.push((t) => {
    const s = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05;
    fireCone.scale.set(s, 1 + Math.sin(t * 11) * 0.18, s);
    fireLight.intensity = 10 + Math.sin(t * 13) * 3;
  });
  window.__fire = fire;
  // (the lighthouse now stands on Tideglass Reef; the chapel bell on Shell Cove)
  // cabin
  const cabin = new THREE.Group();
  cabin.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 2.8), mat(0x9a6b42), 0, 1.1, 0));
  cabin.add(mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x4a5d5a), 0, 2.9, 0));
  occluders.push(put(cabin, latC + 12, lonC - 4, 0, 0.5));
  // tent
  const tent = mesh(new THREE.ConeGeometry(1.6, 1.8, 4), mat(0xe08a3c), 0, 0.9, 0);
  put(tent, latC - 8, lonC - 6, 0, 0.7);
  // fox (trots, tail wags)
  const fox = new THREE.Group();
  fox.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.5), mat(0xe07b2a), 0, 0.6, 0));
  fox.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat(0xe07b2a), 0.7, 0.9, 0));
  const foxTail = mesh(new THREE.ConeGeometry(0.3, 0.7, 4), mat(0xf3e9dc), -0.7, 0.6, 0);
  fox.add(foxTail);
  const foxLegs = [];
  for (const [lx, lz] of [[-0.35, 0.15], [0.35, 0.15], [-0.35, -0.15], [0.35, -0.15]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.35, lz);
    pivot.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat(0x8a4a1a), 0, -0.17, 0));
    fox.add(pivot);
    foxLegs.push(pivot);
  }
  put(fox, latC - 1, lonC - 8, 0.2, 1.5);
  const foxHome = fox.position.clone();
  tickers.push((t) => {
    fox.position.copy(foxHome).add(V3(Math.sin(t * 0.7) * 0.8, Math.abs(Math.sin(t * 4)) * 0.15, Math.cos(t * 0.5) * 0.8));
    const trot = Math.sin(t * 10);
    foxLegs[0].rotation.x = trot * 0.5; foxLegs[3].rotation.x = trot * 0.5;
    foxLegs[1].rotation.x = -trot * 0.5; foxLegs[2].rotation.x = -trot * 0.5;
    foxTail.rotation.y = Math.sin(t * 3) * 0.4;
  });
  // ancient sprout (unique plant)
  const sprout = new THREE.Group();
  sprout.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), mat(0x3f9a4c), 0, 0.7, 0));
  sprout.add(mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x63d66f), 0, 1.6, 0));
  sprout.add(mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(0x9df0a8), 0.4, 1.2, 0.2, false));
  put(sprout, latC + 10, lonC + 6, 0, 0);
  window.__sprout = sprout;
  steppingStones([[22, 150], [20, 154], [18, 158], [16, 162], [14, 166], [12, 170], [10, 150], [12, 155]], 0xe8d9a8, 0.45);
}

// ---------- CRYSTAL TUNDRA ----------
let bearBig, fishHolePos;
{
  const g = new THREE.Group(); scene.add(g);
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  scatterOnSphere(g, 52, 100, 10, 16, () => makeCrystal(rand(0.8, 1.8)));
  put(makeCrystal(2.2), 62, 110, 0, 1);
  put(makeCrystal(1.6), 60, 95, 0, 2);
  // igloo
  const ig = new THREE.Group();
  ig.add(mesh(new THREE.SphereGeometry(2.0, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf4fafd), 0, 0, 0));
  ig.add(mesh(new THREE.BoxGeometry(1.2, 1.0, 1.4), mat(0xe6f1f6), 0, 0.5, 2.0));
  occluders.push(put(ig, 58, 125, 0, -0.6));
  // tent + sled campsite
  const tent = mesh(new THREE.ConeGeometry(1.5, 1.7, 4), mat(0xc9573a), 0, 0.85, 0);
  put(tent, 50, 118, 0, 0.4);
  const sled = new THREE.Group();
  sled.add(mesh(new THREE.BoxGeometry(2.0, 0.25, 1.0), mat(0x7a5230), 0, 0.5, 0));
  sled.add(mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), mat(0x5a3d22), 0, 0.2, 0.5));
  sled.add(mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), mat(0x5a3d22), 0, 0.2, -0.5));
  put(sled, 49, 122, 0, 1.1);
  // bears
  bearBig = makeBear(1.15, false);
  put(bearBig, 56, 105, 0.1, 2.2);
  const bearHome = bearBig.position.clone();
  tickers.push((t) => {
    bearBig.position.copy(bearHome).add(V3(Math.sin(t * 0.4) * 0.7, 0, Math.cos(t * 0.3) * 0.5));
  });
  const cub = makeBear(0.55, true);
  put(cub, 55, 108, 0.1, 0.5);
  const cub2 = makeBear(1.0, false);
  put(cub2, 60, 132, 0.1, -1);
  window.__bear = bearBig;
  // seals on floes
  for (let i = 0; i < 4; i++) {
    const floe = mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 8), mat(0xf6fbfe), 0, 0, 0);
    const la = 54 + rand(-4, 4), lo = 88 + rand(-6, 6);
    put(floe, la, lo, 0.15, 0);
    const s = makeSeal();
    s.position.copy(floe.position); s.quaternion.copy(floe.quaternion); s.translateY(0.4);
    g.add(s);
    tickers.push((t) => { s.position.y += Math.sin(t * 2 + i * 3) * 0.0015; });
  }
  // fishing hole
  const hole = new THREE.Group();
  const rim = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 12), mat(0xe8f4fa), 0, 0, 0);
  hole.add(rim);
  const water = mesh(new THREE.CircleGeometry(1.1, 14), new THREE.MeshStandardMaterial({ color: 0x14425e, roughness: 0.2 }), 0, 0.28, 0, false);
  water.rotation.x = -Math.PI / 2; hole.add(water);
  const rod = mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), mat(0x7a5230), 0.8, 1.6, 0);
  rod.rotation.z = -0.5; hole.add(rod);
  put(hole, 57, 118, 0.1, 0);
  fishHolePos = hole.position.clone();
  // fisherman NPC
  const fm = new THREE.Group();
  fm.add(mesh(new THREE.CapsuleGeometry(0.45, 0.8, 3, 8), mat(0xe8a33d), 0, 1.1, 0));
  fm.add(mesh(new THREE.SphereGeometry(0.38, 8, 7), mat(0xf2c49b), 0, 2.05, 0));
  fm.add(mesh(new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc93a3a), 0, 2.15, 0, false));
  put(fm, 57.5, 120, 0, -1.2);
  // pines at border
  scatterOnSphere(g, 46, 135, 6, 14, () => makeTree(rand(2, 3.4)));
  steppingStones([[52, 92], [54, 96], [55, 100], [56, 104], [57, 108], [58, 112]], 0xdceef7, 0.4);
}

// ---------- SHELL COVE ----------
let lagoonCenter;
const shellMeshes = [];
{
  const g = new THREE.Group(); scene.add(g);
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  // palms, but keep a clearing around the dune bell (14,279) + spawn view (13,277)
  for (let i = 0, placed = 0; i < 40 && placed < 14; i++) {
    const la = 14 + rand(-12, 12), lo = 285 + rand(-12, 12);
    if (Math.hypot(la - 14, lo - 279) < 6 || Math.hypot(la - 13, lo - 277) < 4) continue;
    const base = latLonToVec3(la, lo, 0);
    const o = makePalm();
    orientOnSphere(o, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    g.add(o); placed++;
  }
  // gather nodes: choppable palms (shake per hit, keel over when felled)
  for (const [la, lo] of [[11, 281], [16, 283], [9, 276]]) {
    const palm = makePalm();
    put(palm, la, lo, 0, rand(3));
    addNode({
      type: 'wood', item: 'wood', name: 'Palm', verb: 'Chop', icon: '🪵', color: 0x2f9e5f, chime: 420,
      lat: la, lon: lo, kind: 'GATHER', tool: 'axe', stock: 3, respawn: 90, trunkStock: 2,
      shakeRoot: palm, fallRoot: palm,
    });
  }
  // lifeguard tower
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    tower.add(mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), mat(0x8a6238), lx, 1.7, lz));
  tower.add(mesh(new THREE.BoxGeometry(2.8, 1.6, 2.4), mat(0xe0654a), 0, 4.2, 0));
  tower.add(mesh(new THREE.ConeGeometry(2.2, 1.0, 4), mat(0xf3e9dc), 0, 5.5, 0));
  occluders.push(put(tower, 12, 292, 0, 0.5));
  // chapel bell (moved here from Fernwood — Shell Cove's small moment)
  bellGroup = new THREE.Group();
  {
    const wood = mat(0x7a5230);
    bellGroup.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood, -1, 1.3, 0));
    bellGroup.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood, 1, 1.3, 0));
    bellGroup.add(mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), wood, 0, 2.6, 0));
    const bellMesh = mesh(new THREE.ConeGeometry(0.6, 1.0, 8), mat(0xe8c33d, { metalness: 0.5, roughness: 0.35 }), 0, 1.9, 0);
    bellMesh.name = 'bell'; bellGroup.add(bellMesh);
  }
  occluders.push(put(bellGroup, 14, 279, 0, 0.8));
  // dock
  const dock = new THREE.Group();
  for (let i = 0; i < 6; i++) dock.add(mesh(new THREE.BoxGeometry(1.6, 0.15, 0.5), mat(0x9a6b42), 0, 0, -i * 0.6));
  put(dock, -2, 288, 0.4, 3.1);
  // boats
  const boat = (sailC) => {
    const b = new THREE.Group();
    b.add(mesh(new THREE.BoxGeometry(2.2, 0.7, 1.0), mat(0xf3e9dc), 0, 0.35, 0));
    b.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), mat(0x7a5230), 0, 1.8, 0));
    const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 1.8), new THREE.Vector2(1.2, 0)]);
    b.add(mesh(new THREE.ShapeGeometry(sailShape), mat(sailC, { side: THREE.DoubleSide }), 0.05, 1.0, 0, false));
    return b;
  };
  put(boat(0xff8c5a), -6, 286, 0.5, 0.6);
  const kayakM = mat(0xff5a6e);
  const ky = mesh(new THREE.CapsuleGeometry(0.4, 2.0, 3, 6), kayakM, 0, 0, 0);
  ky.rotation.z = Math.PI / 2; put(ky, -7, 290, 0.5, 1.2);
  const ky2 = mesh(new THREE.CapsuleGeometry(0.4, 2.0, 3, 6), mat(0xffd23d), 0, 0, 0);
  ky2.rotation.z = Math.PI / 2; put(ky2, -6, 293, 0.5, -0.4);
  tickers.push((t) => { ky.position.y += Math.sin(t * 2) * 0.002; ky2.position.y += Math.cos(t * 2) * 0.002; });
  // umbrellas + chairs
  for (let i = 0; i < 3; i++) {
    const um = new THREE.Group();
    um.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), mat(0x8a6238), 0, 1.3, 0));
    um.add(mesh(new THREE.ConeGeometry(1.5, 0.8, 8), mat(i % 2 ? 0xff8c7a : 0x7ec8e8), 0, 2.7, 0));
    put(um, 6 + i * 3, 280 + i * 2, 0, rand(3));
    const chair = new THREE.Group();
    chair.add(mesh(new THREE.BoxGeometry(1.6, 0.15, 0.6), mat(0xf3e9dc), 0, 0.35, 0));
    put(chair, 5 + i * 3, 281 + i * 2, 0.1, rand(3));
  }
  // shells (collectibles)
  const shellCols = [0xf7c8c8, 0xfbe8c8, 0xf3d8f7];
  [[4, 284], [2, 287], [8, 290]].forEach(([la, lo], i) => {
    const sh = mesh(new THREE.SphereGeometry(0.4, 7, 5, 0, Math.PI), mat(shellCols[i]), 0, 0, 0);
    sh.scale.set(1, 0.6, 0.8);
    put(sh, la, lo, 0.3, rand(3));
    shellMeshes.push(sh);
    tickers.push((t) => { sh.position.y += Math.sin(t * 3 + i * 2) * 0.001; sh.rotation.y += 0.005; });
  });
  // crabs (scuttle sideways, claws snap)
  for (let i = 0; i < 3; i++) {
    const crab = new THREE.Group();
    const crabM = mat(0xe04a3a);
    crab.add(mesh(new THREE.SphereGeometry(0.35, 7, 6), crabM, 0, 0.3, 0));
    const crabLegs = [];
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const leg = mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), crabM, s * (0.3 + k * 0.12), 0.15, -0.15 + k * 0.15, false);
      leg.rotation.z = s * 0.5;
      crab.add(leg);
      crabLegs.push(leg);
    }
    const claws = [];
    for (const s of [-1, 1]) {
      const claw = mesh(new THREE.SphereGeometry(0.14, 6, 5), crabM, s * 0.25, 0.3, 0.4, false);
      crab.add(claw);
      claws.push(claw);
    }
    put(crab, rand(-2, 6), rand(282, 292), 0.15, rand(3));
    const home = crab.position.clone();
    tickers.push((t) => {
      crab.position.copy(home).add(V3(Math.sin(t + i * 2) * 0.5, Math.abs(Math.sin(t * 6 + i)) * 0.06, 0));
      crabLegs.forEach((leg, k) => (leg.rotation.x = Math.sin(t * 10 + k * 1.7 + i) * 0.5));
      const snap = Math.pow(Math.max(0, Math.sin(t * 2 + i * 3)), 8);
      claws.forEach((c) => c.scale.setScalar(1 + snap * 0.4));
    });
  }
  lagoonCenter = latLonToVec3(-14, 288, 0.4);
  // swimmer NPC marker (player goes here for lagoon wonder)
  steppingStones([[10, 282], [8, 284], [6, 286], [4, 288], [0, 288], [-4, 288]], 0xffffff, 0.35);
}

// ---------- SUNSTONE OASIS ----------
let oasisPond;
const sunstoneMats = [];
{
  const g = new THREE.Group(); scene.add(g);
  const latC = 10, lonC = 110;
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  const sandstone = mat(0xd9b988), sandDark = mat(0xb08d5a);
  // ruined stone arch (occluder)
  const arch = new THREE.Group();
  arch.add(mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), sandstone, -1.8, 2.1, 0));
  arch.add(mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), sandstone, 1.8, 2.1, 0));
  arch.add(mesh(new THREE.BoxGeometry(4.8, 1.0, 1.1), sandstone, 0, 4.6, 0));
  occluders.push(put(arch, latC + 4, lonC, 0, 0.3));
  // broken columns
  put(mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.6, 7), sandstone, 0, 1.3, 0), latC, lonC - 4, 0, 0);
  put(mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.1, 7), sandDark, 0, 0.55, 0), latC + 6, lonC + 4, 0, 1);
  // cacti
  const cactusM = mat(0x3f9a4c);
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    const h = rand(1.4, 2.6);
    c.add(mesh(new THREE.CapsuleGeometry(0.28, h, 3, 7), cactusM, 0, h / 2 + 0.4, 0));
    c.add(mesh(new THREE.CapsuleGeometry(0.18, 0.7, 3, 6), cactusM, 0.45, h * 0.55, 0));
    c.children[1].rotation.z = -0.5;
    put(c, latC + rand(-8, 8), lonC + rand(-15, 15), 0, rand(3));
  }
  // red tent
  put(mesh(new THREE.ConeGeometry(1.7, 2.0, 4), mat(0xc9573a), 0, 1.0, 0), latC + 2, lonC + 7, 0, 0.4);
  // camel (ambles in, sways its neck, swishes its tail)
  const camel = new THREE.Group();
  const camelM = mat(0xd9a95e);
  camel.add(mesh(new THREE.BoxGeometry(1.8, 0.9, 0.8), camelM, 0, 1.3, 0));
  camel.add(mesh(new THREE.SphereGeometry(0.55, 7, 6), camelM, 0, 1.9, 0));
  const neck = mesh(new THREE.BoxGeometry(0.35, 1.2, 0.35), camelM, 1.0, 2.0, 0);
  neck.rotation.z = -0.5; camel.add(neck);
  const camelHead = mesh(new THREE.BoxGeometry(0.7, 0.35, 0.35), camelM, 1.5, 2.5, 0);
  camel.add(camelHead);
  const camelLegs = [];
  for (const [lx, lz] of [[-0.6, 0.25], [0.6, 0.25], [-0.6, -0.25], [0.6, -0.25]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.0, lz);
    pivot.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 6), camelM, 0, -0.5, 0));
    camel.add(pivot);
    camelLegs.push(pivot);
  }
  const camelTail = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.8, 5), camelM, -1.0, 1.2, 0, false);
  camel.add(camelTail);
  put(camel, latC - 2, lonC - 6, 0, 1.2);
  const camelHome = camel.position.clone();
  const camelPh = rand(Math.PI * 2);
  tickers.push((t) => {
    camel.position.copy(camelHome);
    camel.position.y += Math.sin(t * 1.5 + camelPh) * 0.03;
    const a = Math.sin(t * 1.6 + camelPh); // pacing gait: both left, both right
    camelLegs[0].rotation.x = a * 0.28; camelLegs[2].rotation.x = a * 0.28;
    camelLegs[1].rotation.x = -a * 0.28; camelLegs[3].rotation.x = -a * 0.28;
    neck.rotation.x = Math.sin(t * 0.9 + camelPh) * 0.12;
    camelHead.position.y = 2.5 + Math.sin(t * 0.9 + camelPh) * 0.08;
    camelTail.rotation.x = Math.sin(t * 2.4 + camelPh) * 0.5;
  });
  // oasis pond + palms (the pond grows as the oasis wakes)
  oasisPond = mesh(new THREE.CircleGeometry(2.6, 18).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4fc3d8, roughness: 0.25, flatShading: true }), 0, 0, 0, false);
  oasisPond.scale.setScalar(0.65);
  put(oasisPond, latC - 6, lonC + 2, 0.2, 0);
  for (const [dla, dlo] of [[-3.5, -1], [-8, 4], [-4, 5]]) {
    const p = makePalm();
    put(p, latC + dla, lonC + dlo, 0, rand(3));
  }
  // three sunstones on pedestals around the pond
  [[-6, -2], [-6, 2], [-6, 6]].forEach(([dla, dlo], i) => {
    put(mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.9, 7), sandDark, 0, 0.45, 0), latC + dla, lonC + dlo, 0, 0);
    const sm = new THREE.MeshStandardMaterial({ color: 0xffc93d, emissive: 0xa86a00, emissiveIntensity: 0.25, flatShading: true, roughness: 0.3 });
    const stone = mesh(new THREE.OctahedronGeometry(0.55, 0), sm, 0, 0, 0, false);
    put(stone, latC + dla, lonC + dlo, 1.2, rand(3));
    sunstoneMats.push(sm);
    tickers.push((t) => { stone.rotation.y += 0.004 + i * 0.001; stone.position.y += Math.sin(t * 2 + i * 2) * 0.0012; });
  });
  // scattered dune rocks
  for (let i = 0; i < 7; i++)
    put(mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.7), 0), sandDark, 0, 0.2, 0), latC + rand(-10, 10), lonC + rand(-16, 16), 0.1, rand(3));
  steppingStones([[16, 100], [14, 104], [12, 108], [10, 112], [8, 116], [2, 110], [-2, 110]], 0xf0d68a, 0.45);
}

// ---------- TIDEGlass REEF ----------
let reefPivot, reefBeamM, reefLampM, reefLight;
{
  const g = new THREE.Group(); scene.add(g);
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  // rock pillar rising from the island (occluder) — mesh at origin, lift via h
  const pillar = mesh(new THREE.DodecahedronGeometry(2.2, 0), mat(0x98a3ad), 0, 0, 0);
  pillar.scale.set(1.2, 1.4, 1.2);
  occluders.push(put(pillar, 2, 230, 1.0, 0));
  // lighthouse on top — sits on the pillar, low enough to stay in frame
  const lh = new THREE.Group();
  lh.add(mesh(new THREE.CylinderGeometry(0.85, 1.1, 4.6, 8), mat(0xf2ede2), 0, 2.3, 0));
  lh.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 8), mat(0xc93a3a), 0, 2.9, 0));
  lh.add(mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.9, 8), mat(0x33414e), 0, 5.0, 0));
  reefLampM = new THREE.MeshStandardMaterial({ color: 0xffe9a3, emissive: 0xffc93d, emissiveIntensity: 0.25 });
  lh.add(mesh(new THREE.SphereGeometry(0.5, 8, 7), reefLampM, 0, 5.0, 0, false));
  occluders.push(put(lh, 2, 230, 3.2, 0.3));
  // rotating light beam (dark until the lighthouse is lit)
  reefPivot = new THREE.Group();
  reefBeamM = new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  reefPivot.add(mesh(new THREE.ConeGeometry(2.0, 15, 12, 1, true).rotateZ(-Math.PI / 2), reefBeamM, -7.5, 0, 0, false));
  put(reefPivot, 2, 230, 8.0, 0);
  reefLight = new THREE.PointLight(0xffc93d, 0, 30);
  put(reefLight, 2, 230, 8.0, 0);
  tickers.push((t, dt) => { if (reefLampM.emissiveIntensity > 1) reefPivot.rotation.y += dt * 0.8; });
  // coral heads breaking the surface — keep the island + spawn view clear
  const coralCols = [0xff8fb3, 0xff9a5a, 0xc49df0, 0xffe08a];
  for (let i = 0, placed = 0; i < 30 && placed < 10; i++) {
    const cla = rand(-6, 6), clo = rand(200, 250);
    if (Math.hypot(cla - 2, clo - 230) < 7 || Math.hypot(cla + 1, clo - 224) < 5) continue;
    const c = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = rand(1.2, 2.2);
      const branch = mesh(new THREE.ConeGeometry(0.32, h, 6), mat(coralCols[(Math.random() * coralCols.length) | 0]), rand(-0.5, 0.5), h / 2 - 0.2, rand(-0.5, 0.5), false);
      branch.rotation.z = rand(-0.25, 0.25);
      c.add(branch);
    }
    put(c, cla, clo, 0, rand(3)); placed++;
  }
  // buoys — southwest of the island so the spawn view stays open
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    b.add(mesh(new THREE.SphereGeometry(0.5, 8, 7), mat(0xe04a3a), 0, 0.4, 0, false));
    b.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.25, 8), mat(0xf3e9dc), 0, 0.4, 0, false));
    b.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), mat(0x7a5230), 0, 1.2, 0, false));
    put(b, -6 + i * 1.5, 210 + i * 4, 0.3, rand(3));
    const home = b.position.clone();
    tickers.push((t) => { b.position.copy(home); b.position.y += Math.sin(t * 2 + i * 2.5) * 0.08; b.rotation.z = Math.sin(t * 1.6 + i) * 0.12; });
  }
  // little red rowboat
  const rb = new THREE.Group();
  rb.add(mesh(new THREE.BoxGeometry(2.4, 0.6, 1.1), mat(0xc0392b), 0, 0.3, 0));
  rb.add(mesh(new THREE.BoxGeometry(2.0, 0.15, 0.8), mat(0x7a5230), 0, 0.62, 0, false));
  put(rb, -6, 220, 0.35, 0.7);
  const rbHome = rb.position.clone();
  tickers.push((t) => { rb.position.copy(rbHome); rb.position.y += Math.sin(t * 1.8) * 0.07; rb.rotation.x = Math.sin(t * 1.4) * 0.05; });
  // pale sandbar stones
  for (let i = 0; i < 5; i++)
    put(mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.6), 0), mat(0xefe0ae), 0, 0.15, 0, false), rand(5, 9), rand(205, 248), 0.1, rand(3));
}

// ---------- EMBER HEIGHTS ----------
{
  const g = new THREE.Group(); scene.add(g);
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  const basalt = mat(0x5a4a3c, { emissive: 0x2a1408, emissiveIntensity: 0.4 }), darkRock = mat(0x3a332c, { emissive: 0x1a0d06, emissiveIntensity: 0.3 });
  // volcano cone with glowing crater (occluder) — compact so the viewpoint frames it
  const cone = new THREE.Group();
  cone.add(mesh(new THREE.CylinderGeometry(1.8, 3.4, 5.5, 9), basalt, 0, 2.75, 0));
  cone.add(mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.8, 9), darkRock, 0, 5.6, 0));
  cone.add(mesh(new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 0, 5.85, 0, false));
  cone.add(mesh(new THREE.CircleGeometry(0.75, 10).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd23d }), 0, 5.9, 0, false));
  const craterGlow = new THREE.PointLight(0xff7a2a, 30, 22);
  craterGlow.position.set(0, 6.5, 0); cone.add(craterGlow);
  occluders.push(put(cone, 27, 332, 0, 0.5));
  // smoke column
  const smokeM = new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55 });
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const p = mesh(new THREE.DodecahedronGeometry(rand(0.7, 1.2), 0), smokeM, rand(-1, 1), 0, rand(-1, 1), false);
    cone.add(p);
    puffs.push({ m: p, off: i * 1.3 });
  }
  tickers.push((t) => {
    for (const p of puffs) {
      const k = ((t * 0.9 + p.off) % 9) / 9;
      p.m.position.y = 6.2 + k * 7;
      p.m.scale.setScalar(0.7 + k * 1.6);
    }
  });
  // gather nodes: mineable basalt (rubble while regrowing) — clear of the scan tripod view
  for (const [la, lo] of [[13, 324], [14, 320], [11, 318]]) {
    const rock = mesh(new THREE.DodecahedronGeometry(rand(0.6, 0.9), 0), basalt, 0, 0, 0);
    put(rock, la, lo, 0.2, rand(3));
    addNode({
      type: 'stone', item: 'stone', name: 'Basalt', verb: 'Mine', icon: '🪨', color: 0x9aa0a6, chime: 240,
      lat: la, lon: lo, kind: 'GATHER', tool: 'pick', stock: 2, respawn: 75,
      onDeplete: () => rock.scale.setScalar(0.45), onRegrow: () => rock.scale.setScalar(1),
    });
  }
  // lava flow strip + cooling rocks
  put(mesh(new THREE.BoxGeometry(1.4, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xff5a1a }), 0, 0, 0, false), 15, 330, 0.25, 0.1);
  for (let i = 0; i < 10; i++) {
    const glowing = i < 3;
    put(mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.8), 0),
      glowing ? new THREE.MeshBasicMaterial({ color: 0xff7a2a }) : darkRock, 0, 0.2, 0),
      rand(6, 22), rand(312, 348), 0.1, rand(3));
  }
  // survey tripod viewpoint
  const tri = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 5), mat(0x7a5230), 0, 0.9, 0);
    leg.rotation.z = 0.4; leg.rotation.y = (i / 3) * Math.PI * 2;
    const pivot = new THREE.Group(); pivot.add(leg);
    leg.position.set(0.55, 0, 0);
    pivot.position.y = 0; pivot.rotation.y = (i / 3) * Math.PI * 2;
    tri.add(pivot);
  }
  tri.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), mat(0x33414e), 0, 1.75, 0));
  const scope = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 7), mat(0xe8c33d, { metalness: 0.4, roughness: 0.4 }), 0, 2.0, 0);
  scope.rotation.x = -0.9; tri.add(scope);
  put(tri, 8, 328, 0, -0.6);
  // small camp tent
  put(mesh(new THREE.ConeGeometry(1.5, 1.6, 4), mat(0xd9c9a8), 0, 0.8, 0), 6, 320, 0, 0.9);
  steppingStones([[2, 328], [5, 328], [8, 328], [11, 328], [14, 329]], 0x8a7a6a, 0.4);
}

// ---------- NORTHLIGHT: stone circle + waking aurora ----------
const aurora = { target: 0, mats: [], light: null };
{
  const g = new THREE.Group(); scene.add(g);
  const put = (obj, la, lo, h = 0.05, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + h), yaw);
    g.add(obj); return obj;
  };
  // standing-stone circle
  const circle = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    circle.add(mesh(new THREE.BoxGeometry(0.7, rand(1.8, 2.4), 0.5), mat(0x8fa3b8), Math.cos(a) * 2.5, 1.0, Math.sin(a) * 2.5));
    circle.children[i].rotation.y = -a;
  }
  circle.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 1.1), mat(0x6b7f96), 0, 0.2, 0));
  put(circle, 60, 140, 0, 0.4);
  // aurora curtains high above the pole (invisible until woken)
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(80,255,170,0)');
  grad.addColorStop(0.45, 'rgba(80,255,170,0.85)');
  grad.addColorStop(0.75, 'rgba(90,200,255,0.5)');
  grad.addColorStop(1, 'rgba(90,120,255,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(38, 22, 32, 1);
    const pp = geo.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      const x = pp.getX(k);
      pp.setZ(k, Math.sin(x * 0.3 + i * 2) * 3);
    }
    const m = new THREE.MeshBasicMaterial({ map: tex.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    m.map.needsUpdate = true;
    const curtain = new THREE.Mesh(geo, m);
    // beyond the pole so the curtains hang over the far limb, inside the follow-camera frame
    orientOnSphere(curtain, latLonToVec3(80, 105 + i * 22, 12 + i * 2), i * 0.5);
    scene.add(curtain);
    aurora.mats.push(m);
  }
  aurora.light = new THREE.PointLight(0x50ffaa, 0, 34);
  put(aurora.light, 60, 140, 6, 0);
  tickers.push((t, dt) => {
    for (let i = 0; i < aurora.mats.length; i++) {
      const m = aurora.mats[i];
      m.opacity += (aurora.target * 0.9 - m.opacity) * Math.min(1, dt * 1.5);
      m.map.offset.x = (t * 0.02 * (1 + i * 0.3)) % 1;
    }
    aurora.light.intensity += (aurora.target * 30 - aurora.light.intensity) * Math.min(1, dt * 1.5);
  });
}

// ---------- fracture bridges (broken → restored) ----------
const bridges = [];
{
  const mkBridge = (la, lo, yaw, label) => {
    const g = new THREE.Group();
    const wood = mat(0x9a6b42);
    const left = new THREE.Group(), right = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      left.add(mesh(new THREE.BoxGeometry(1.5, 0.18, 0.6), wood, 0, 0, -i * 0.7));
      right.add(mesh(new THREE.BoxGeometry(1.5, 0.18, 0.6), wood, 0, 0, i * 0.7 + 3.4));
    }
    left.rotation.x = 0.35; right.rotation.x = -0.35; // broken tilt
    left.position.y = 0.8; right.position.y = 0.8;
    g.add(left, right);
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(g, latLonToVec3(la, lo, heightFor(b.normalize()) + 0.3), yaw);
    scene.add(g);
    bridges.push({ group: g, left, right, fixed: false, label });
  };
  mkBridge(10, 62, 0.5, 'Clover–Oasis link');
  mkBridge(16, 178, 1.2, 'Fernwood–Reef crossing');
  mkBridge(8, 298, -0.6, 'Cove–Ember trail');
}
function repairBridge(i) {
  const b = bridges[i];
  if (!b || b.fixed) return;
  b.fixed = true;
  toast(`✨ Landmass reconnected — ${b.label}!`);
  chime(660);
}

// ---------- clouds ----------
{
  const cm = mat(0xffffff, { transparent: true, opacity: 0.92 });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 3; k++) c.add(mesh(new THREE.IcosahedronGeometry(rand(1, 2), 0), cm, k * 1.8, rand(0, 0.6), rand(-0.5, 0.5), false));
    const a = rand(Math.PI * 2), rr = R + rand(12, 20);
    c.position.set(Math.cos(a) * rr, rand(8, 30), Math.sin(a) * rr);
    scene.add(c);
    const sp = rand(0.1, 0.35);
    tickers.push((t, dt) => { c.rotation.y += dt * sp * 0.2; c.position.applyAxisAngle(UP, dt * sp * 0.05); });
  }
}

// ---------- gulls (ambient seabirds circling the reef/cove waters) ----------
{
  const gullM = mat(0xf4f7fa);
  for (let i = 0; i < 3; i++) {
    const gull = new THREE.Group();
    const wlP = new THREE.Group(), wrP = new THREE.Group();
    wlP.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.4), gullM, -0.7, 0, 0, false));
    wrP.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.4), gullM, 0.7, 0, 0, false));
    gull.add(wlP, wrP);
    gull.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), gullM, 0, 0, 0.2, false));
    scene.add(gull);
    const r = R + rand(9, 13), sp = rand(0.15, 0.3) * (i % 2 ? 1 : -1), ph = rand(Math.PI * 2);
    const loC = rand(210, 290);
    tickers.push((t) => {
      const a = ph + t * sp;
      const la = 4 + Math.cos(a * 0.7) * 6, lo = loC + Math.sin(a) * 18;
      const nrm = latLonToVec3(la, lo, 0).normalize();
      gull.position.copy(nrm).multiplyScalar(r + Math.sin(t * 2 + ph) * 0.5);
      const ahead = latLonToVec3(la + Math.cos(a) * 2, lo + Math.cos(a) * 2, 0).normalize();
      const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), ahead.clone().negate(), nrm);
      gull.quaternion.setFromRotationMatrix(m);
      const flap = Math.sin(t * 9 + ph) * 0.55;
      wlP.rotation.z = flap; wrP.rotation.z = -flap;
    });
  }
}

// ---------- ground detail (instanced: grass, flowers, rocks, bushes, ice shards) ----------
function randomLandSpot(biomes) {
  for (let k = 0; k < 24; k++) {
    const la = rand(-18, 55), lo = rand(0, 360);
    const nrm = latLonToVec3(la, lo, 0).normalize();
    if (biomes.includes(biomeAt(nrm)) && heightFor(nrm) > 0.2) return [la, lo, nrm];
  }
  return [10, 40, latLonToVec3(10, 40, 0).normalize()];
}
const _dummy = new THREE.Object3D();
function scatterInstanced(geo, material, count, biomes, sMin, sMax, colors, opts = {}) {
  const m = new THREE.InstancedMesh(geo, material, count);
  m.frustumCulled = false; // instances span the planet; single bounds would cull wrongly
  m.castShadow = !!opts.shadow;
  m.receiveShadow = true;
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [la, lo, nrm] = randomLandSpot(biomes);
    _dummy.position.copy(nrm).multiplyScalar(R + heightFor(nrm) + (opts.lift || 0.05));
    _dummy.quaternion.setFromUnitVectors(UP, nrm);
    _dummy.rotateY(rand(Math.PI * 2));
    const s = rand(sMin, sMax);
    _dummy.scale.set(s, s * (opts.squash || 1), s);
    _dummy.updateMatrix();
    m.setMatrixAt(i, _dummy.matrix);
    col.setHex(colors[(Math.random() * colors.length) | 0]).offsetHSL(0, 0, rand(-0.03, 0.03));
    m.setColorAt(i, col);
  }
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
  return m;
}
scatterInstanced(new THREE.ConeGeometry(0.16, 0.6, 5), mat(0xffffff, { roughness: 1 }), 380,
  ['farm', 'forest', 'oasis', 'cove'], 0.7, 1.6, [0x4da855, 0x63bd63, 0x8fd06a, 0x2f9e5f]);
scatterInstanced(new THREE.IcosahedronGeometry(0.12, 0), mat(0xffffff, { roughness: 0.7 }), 130,
  ['farm', 'forest', 'cove'], 0.7, 1.3, [0xff8fb3, 0xffd23d, 0xffffff, 0xc49df0], { lift: 0.25 });
scatterInstanced(new THREE.DodecahedronGeometry(0.42, 0), mat(0xffffff, { roughness: 1 }), 90,
  ['farm', 'oasis', 'forest', 'cove', 'volcano', 'arctic'], 0.5, 1.4, [0x9aa0a6, 0x7d848c, 0xb9c2c9, 0xdce9f2, 0x5d4a38], { shadow: true, lift: 0.1 });
scatterInstanced(new THREE.ConeGeometry(0.14, 0.7, 5), mat(0xffffff, { roughness: 1 }), 90,
  ['oasis', 'volcano'], 0.7, 1.4, [0xd9b166, 0xc9a05a, 0x8a7a6a]);
scatterInstanced(new THREE.IcosahedronGeometry(0.7, 1), mat(0xffffff, { roughness: 1 }), 70,
  ['farm', 'forest'], 0.7, 1.5, [0x2f9e5f, 0x3fae4e, 0x26854a], { shadow: true, squash: 0.7, lift: 0.25 });
scatterInstanced(new THREE.OctahedronGeometry(0.5, 0),
  new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.2, emissive: 0x0b5f8a, emissiveIntensity: 0.45 }),
  46, ['arctic'], 0.6, 1.6, [0x9fe4ff, 0x5ecdf5, 0xd6f2ff], { lift: 0.35 });

// ---------- player (detailed traveler: boots, belt, arms with hands, face) ----------
const player = new THREE.Group();
{
  const coat = mat(0xf2b63a), skin = mat(0xf2c49b), dark = mat(0x33414e);
  const pants = mat(0x6b4a2f), packM = mat(0x2e8b8b);
  // legs with boots (pivot at hip for walk swing)
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.17, 0.66, 0);
    leg.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 7), pants, 0, -0.22, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.2, 0.16, 0.32), mat(0x4a3320), 0, -0.52, 0.04));
    player.add(leg);
    player.userData[s < 0 ? 'legL' : 'legR'] = leg;
  }
  // torso: tunic + belt + buckle + buttons
  player.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.95, 8), coat, 0, 1.12, 0));
  player.add(mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.13, 8), mat(0x4a3320), 0, 0.78, 0));
  player.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), mat(0xe8c33d, { metalness: 0.4, roughness: 0.4 }), 0, 0.78, 0.5, false));
  player.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), dark, 0.12, 1.2, 0.42, false));
  player.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), dark, 0.12, 1.02, 0.45, false));
  // scarf collar + tail
  player.add(mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.2, 8), mat(0xd93a3a), 0, 1.64, 0));
  player.add(mesh(new THREE.BoxGeometry(0.16, 0.4, 0.06), mat(0xd93a3a), 0.12, 1.4, -0.42));
  // arms: left swings simple; right is jointed (shoulder + elbow) for flat chops
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.5, 1.48, 0);
    arm.rotation.z = s * -0.1;
    arm.userData.baseZ = s * -0.1;
    arm.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 7), coat, 0, -0.24, 0));
    if (s > 0) {
      // elbow joint: forearm + hand + axe ride on it
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.32, 0);
      elbow.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.34, 7), coat, 0, -0.13, 0));
      elbow.add(mesh(new THREE.SphereGeometry(0.14, 7, 6), skin, 0, -0.3, 0)); // hand
      // trusty axe: stays hidden until chopping mode, then gripped with both hands
      const axe = new THREE.Group();
      axe.position.set(-0.08, -0.32, 0.1);
      axe.rotation.x = 0.5;
      axe.visible = false;
      axe.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), mat(0x7a5230), 0, -0.5, 0));
      axe.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.42), mat(0x9aa0a6, { metalness: 0.5, roughness: 0.4 }), 0, -0.95, 0.12));
      elbow.add(axe);
      arm.add(elbow);
      player.userData.axe = axe;
      player.userData.elbowR = elbow;
    } else {
      arm.add(mesh(new THREE.SphereGeometry(0.14, 7, 6), skin, 0, -0.56, 0)); // hand
    }
    player.add(arm);
    player.userData[s < 0 ? 'armL' : 'armR'] = arm;
  }
  // head: face, eyes, cheeks, cap with brim
  player.add(mesh(new THREE.SphereGeometry(0.36, 10, 8), skin, 0, 1.98, 0));
  player.add(mesh(new THREE.SphereGeometry(0.055, 6, 5), mat(0x22262b), -0.13, 2.02, 0.32, false));
  player.add(mesh(new THREE.SphereGeometry(0.055, 6, 5), mat(0x22262b), 0.13, 2.02, 0.32, false));
  player.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0xf0a0a0), -0.21, 1.92, 0.27, false));
  player.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0xf0a0a0), 0.21, 1.92, 0.27, false));
  player.add(mesh(new THREE.SphereGeometry(0.39, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd93a3a), 0, 2.06, 0, false));
  player.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.07, 10), mat(0xb52b2b), 0, 2.08, 0.42, false));
  // backpack + bedroll
  player.add(mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), packM, 0, 1.15, -0.52));
  const roll = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.56, 8), mat(0xe8d9a8), 0, 1.52, -0.52);
  roll.rotation.z = Math.PI / 2;
  player.add(roll);
  scene.add(player);
  // walk swing for arms + legs, tracked from actual motion (no game-loop coupling)
  const P = player.userData;
  let phase = 0, strideInit = false;
  const last = new THREE.Vector3();
  tickers.push((t, dt) => {
    // player.position starts at origin until the first updatePlayer runs — don't
    // mistake the teleport-to-surface for motion (it snapped limbs on load).
    if (!strideInit) {
      if (player.position.lengthSq() < 1) return;
      last.copy(player.position);
      strideInit = true;
    }
    const sp = Math.min(player.position.distanceTo(last) / Math.max(dt, 1e-4), 30);
    last.copy(player.position);
    const moving = sp > 1.0;
    if (moving) phase += dt * (4 + Math.min(sp, 12) * 0.9);
    const target = moving ? Math.sin(phase) * 0.6 : 0;
    const k = Math.min(1, 10 * dt);
    // two-handed axe grip: while chopping mode shows, both hands meet on the handle
    const wantGrip = P.axe && P.axe.visible ? 1 : 0;
    gripBlend += (wantGrip - gripBlend) * Math.min(1, 6 * dt);
    const ready = -0.5 * gripBlend; // both arms lift forward onto the shared handle
    // wading: high steps, arms out for balance
    const wading = heightFor(playerPos.clone().normalize()) < 0.12;
    wadeBlend += ((wading ? 1 : 0) - wadeBlend) * Math.min(1, 4 * dt);
    const wAmp = 0.8 + 0.5 * wadeBlend; // higher knees in water
    P.armL.rotation.x += (target + ready - P.armL.rotation.x) * k;
    P.armR.rotation.x += (-target + ready - P.armR.rotation.x) * k;
    P.armL.rotation.z += ((P.armL.userData.baseZ + 0.28 * gripBlend + 0.4 * wadeBlend) - P.armL.rotation.z) * k;
    P.armR.rotation.z += ((P.armR.userData.baseZ - 0.28 * gripBlend - 0.4 * wadeBlend) - P.armR.rotation.z) * k;
    // flat chop: small shoulder dip, elbow snaps through
    P.armR.rotation.x += chopOffset();
    P.armL.rotation.x += chopOffset() * 0.9;
    const elb = P.elbowR;
    if (elb) {
      const bend = -0.3 + (moving ? Math.sin(phase + Math.PI) * 0.1 : 0) + elbowChop();
      elb.rotation.x += (bend - elb.rotation.x) * k;
    }
    P.legL.rotation.x += (-target * wAmp - P.legL.rotation.x) * k;
    P.legR.rotation.x += (target * wAmp - P.legR.rotation.x) * k;
    // splashes while striding through water
    if (wading && moving && t - (P._splashT || 0) > 0.35) {
      P._splashT = t;
      const fp = player.position.clone(); fp.y += 0.2;
      burst(fp, 0x9fdcff, 5, 1.2);
    }
  });
}
let playerPos = latLonToVec3(2, 50, 0); // open path south of the farmstead, clear of buildings
let faceTarget = [12, 40]; // where the camera looks on load
// Deep links for testing/sharing worlds: #fernwood #clover #oasis #cove #reef #ember #north
{
  const spots = {
    fernwood: [14, 156, 12, 158], clover: [2, 50, 12, 40], oasis: [8, 106, 4, 112],
    cove: [13, 277, 14, 279], reef: [-1, 224, 2, 230], ember: [5, 323, 8, 328], north: [58, 136, 60, 140],
  };
  const s = spots[(location.hash || '').replace('#', '')];
  if (s) {
    playerPos = latLonToVec3(s[0], s[1], 0);
    faceTarget = [s[2], s[3]];
  }
}
playerPos = playerPos.clone().normalize().multiplyScalar(R + heightFor(playerPos.clone().normalize()) + 0.1);
let playerVel = 0, hopH = 0, facing = new THREE.Vector3(0, 0, 1);
let moveDirSmooth = new THREE.Vector3(1, 0, 0);

// ---------- particles ----------
const bursts = [];
function burst(pos, color = 0xffd97a, n = 14, spread = 2.2) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    v.push(V3(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)).multiplyScalar(spread));
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 1 }));
  scene.add(pts);
  bursts.push({ pts, v, life: 1 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.life -= dt * 1.2;
    const arr = b.pts.geometry.attributes.position;
    for (let k = 0; k < b.v.length; k++) {
      arr.array[k * 3] += b.v[k].x * dt;
      arr.array[k * 3 + 1] += b.v[k].y * dt;
      arr.array[k * 3 + 2] += b.v[k].z * dt;
      b.v[k].y -= dt * 4;
    }
    arr.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life);
    if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); bursts.splice(i, 1); }
  }
}

// ---------- audio (tiny synth) ----------
let audioCtx = null, muted = false;
function ac() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function chime(freq = 520) {
  if (muted) return;
  try {
    const ctx = ac(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.9);
  } catch { /* no audio */ }
}

// ---------- wonders / HUD ----------
// Seven worlds, seven small moments (mirrors the field journal).
const WORLDS = [
  { n: '01', code: 'FOREST', name: 'Fernwood', moment: 'Tend the fire', where: 'where the pines grow thick' },
  { n: '02', code: 'FARM', name: 'Clover Fields', moment: 'Water / harvest', where: 'where the red barn stands' },
  { n: '03', code: 'DESERT', name: 'Sunstone Oasis', moment: 'Wake the oasis', where: 'the golden dunes past the farm' },
  { n: '04', code: 'BEACH', name: 'Shell Cove', moment: 'Ring the bell', where: 'the pale sands and the dune bell' },
  { n: '05', code: 'OCEAN', name: 'Tideglass Reef', moment: 'Light the lighthouse', where: 'the shallow turquoise water' },
  { n: '06', code: 'VOLCANO', name: 'Ember Heights', moment: 'Scan the volcano', where: 'the smoking dark mountain' },
  { n: '07', code: 'ARCTIC', name: 'Northlight', moment: 'Wake the aurora', where: 'the ice cap beneath the sky' },
];
const wonders = [
  { id: 'flame', icon: '🔥', name: 'Eternal Flame', world: 0, done: false, stage: 0, hint: ['Tend the fire', 'Feed the flame', 'Nurture the blaze'] },
  { id: 'harvest', icon: '🌾', name: 'Bountiful Harvest', world: 1, done: false, stage: 0, hint: ['Plant the rows', 'Water the sprouts', 'Harvest!'] },
  { id: 'oasis', icon: '☀️', name: 'Wake the Oasis', world: 2, done: false, stage: 0, hint: ['Brush the sand', 'Turn the sunstones', 'Wake the oasis!'] },
  { id: 'bell', icon: '🔔', name: 'Ring the Bell', world: 3, done: false },
  { id: 'light', icon: '💡', name: 'Light the Lighthouse', world: 4, done: false },
  { id: 'scan', icon: '🌋', name: 'Scan the Volcano', world: 5, done: false, stage: 0 },
  { id: 'aurora', icon: '🌌', name: 'Wake the Aurora', world: 6, done: false },
];
let fishStage = 0; // flavor minigame state (no longer a wonder)
let scanTimer = null;
let scanPos = null; // assigned after anchor() is defined below
function renderCollection() {
  // Progress lives in the top-center tracker; the journal dialog lists the rest.
  document.getElementById('wonder-count').textContent = `${wonders.filter((w) => w.done).length} / 7`;
}
function renderJournal() {
  const list = document.getElementById('journal-list');
  if (!list) return;
  list.innerHTML = '';
  WORLDS.forEach((w, i) => {
    const done = wonders[i].done;
    const b = document.createElement('button');
    b.className = 'journal-entry' + (done ? ' done' : '');
    b.innerHTML = `<span class="entry-num">${w.n}</span><span class="entry-copy"><strong>${w.name}</strong><span>${done ? '✓ ' : ''}${w.moment}</span></span><span class="entry-arrow">↗</span>`;
    b.onclick = () => { toggleJournal(false); toast(`🧭 ${w.name} — ${w.where}.`); };
    list.appendChild(b);
  });
  const fill = document.getElementById('journal-fill');
  if (fill) fill.style.width = `${(wonders.filter((w) => w.done).length / 7) * 100}%`;
}
function toggleJournal(force) {
  const j = document.getElementById('journal-overlay');
  if (!j) return;
  const show = force !== undefined ? force : j.classList.contains('hidden');
  j.classList.toggle('hidden', !show);
  if (show) renderJournal();
}
renderCollection();

// ---------- inventory + survival meters (step 1: food/energy/cold) ----------
const inv = { wood: 0, stone: 0, gold: 0, food: 2, wool: 0 };
const meters = { energy: 100, cold: 0 };
const PACK_BASE = 10;
function packSize() { return inv.wood + inv.stone + inv.gold + inv.food + inv.wool; }
function packCap() { return PACK_BASE; } // +Big Pack research later
function addItem(id, n = 1) {
  if (packSize() + n > packCap()) { toast('🎒 Pack full! (capacity ' + packCap() + ')'); return false; }
  inv[id] += n;
  renderStats();
  return true;
}
function eatFood() {
  if (inv.food <= 0) return toast('🍽️ No food — fish, farm, or forage first.');
  if (meters.energy > 95) return toast('😋 Already full.');
  inv.food--;
  meters.energy = Math.min(100, meters.energy + 35);
  burst(player.position.clone(), 0x9df0a8, 10, 1.6);
  chime(620);
  toast('😋 +35 energy.');
  renderStats();
}
let wasExhausted = false, wasFreezing = false;
function meterAlerts() {
  const ex = meters.energy <= 0;
  if (ex && !wasExhausted) toast('😮‍💨 Exhausted! Eat food (F) or stand still to rest.');
  wasExhausted = ex;
  const fr = meters.cold >= 60;
  if (fr && !wasFreezing) toast('🥶 Freezing! Get off the ice — a wool parka will fix this.');
  wasFreezing = fr;
}
const statsCache = {};
function setText(id, v) {
  if (statsCache[id] !== v) { statsCache[id] = v; document.getElementById(id).textContent = v; }
}
function renderStats() {
  setText('inv-wood', inv.wood); setText('inv-stone', inv.stone); setText('inv-gold', inv.gold);
  setText('inv-food', inv.food); setText('inv-wool', inv.wool);
  setText('pack-count', packSize() + '/' + packCap());
  const e = Math.round(meters.energy), c = Math.round(meters.cold);
  if (statsCache.e !== e) { statsCache.e = e; document.getElementById('energy-fill').style.width = e + '%'; }
  if (statsCache.c !== c) { statsCache.c = c; document.getElementById('cold-fill').style.width = c + '%'; }
}
window.__lp = {
  inv, meters, tools, nodes, player, addItem, eatFood, packSize, packCap,
  hasTarget: () => !!moveTargetN,
  goto(lat, lon, flat, flon) { // debug teleport (also the future fast-travel hook)
    playerPos = latLonToVec3(lat, lon, 0);
    const n0 = playerPos.clone().normalize();
    playerPos = n0.clone().multiplyScalar(R + heightFor(n0) + 0.1);
    moveDirSmooth.copy(latLonToVec3(flat, flon, 0)).sub(playerPos);
    moveDirSmooth.addScaledVector(n0, -moveDirSmooth.dot(n0)).normalize();
    facing.copy(moveDirSmooth);
    lastBehind.copy(moveDirSmooth);
  },
};
function completeWonder(id) {
  const w = wonders.find((x) => x.id === id);
  if (!w || w.done) return;
  w.done = true;
  renderCollection();
  renderJournal();
  burst(player.position.clone(), 0xffd97a, 26, 3);
  chime(740);
  toast(`🌟 Small Wonder — ${w.name}! (${wonders.filter((x) => x.done).length}/7)`);
  const n = wonders.filter((x) => x.done).length;
  if (n === 2) repairBridge(0);
  if (n === 4) repairBridge(1);
  if (n === 6) repairBridge(2);
  if (n === 7) {
    setTimeout(() => { toast('🌍 The planet is whole again. Thank you, traveler.'); chime(880); globeMode = true; }, 1200);
  }
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

// interactable definitions (positions on sphere)
function anchor(lat, lon, h = 1) {
  const b = latLonToVec3(lat, lon, 0);
  return latLonToVec3(lat, lon, heightFor(b.normalize()) + h);
}
scanPos = anchor(8, 328);
const byId = (id) => wonders.find((x) => x.id === id);
const stageHint = (id) => { const w = byId(id); return w.done ? w.hint[w.hint.length - 1] + ' ✓' : w.hint[Math.min(w.stage, w.hint.length - 1)]; };
addInteract({ id: 'flame', pos: anchor(12, 158), kind: 'A SMALL WONDER', label: () => stageHint('flame'), onUse });
addInteract({ id: 'harvest', pos: anchor(8, 52), kind: 'CLOVER FIELDS', label: () => stageHint('harvest'), onUse });
addInteract({ id: 'oasis', pos: anchor(4, 110), kind: 'A SMALL WONDER', label: () => stageHint('oasis'), onUse });
addInteract({ id: 'bell', pos: anchor(14, 279), kind: 'A SMALL WONDER', label: () => 'Ring the Bell', onUse });
addInteract({ id: 'light', pos: anchor(2, 230), kind: 'A SMALL WONDER', label: () => (byId('light').done ? 'The beacon burns' : 'Light the lighthouse'), onUse, radius: 5 });
addInteract({ id: 'scan', pos: scanPos, kind: 'A SMALL WONDER', label: () => (scanTimer ? 'Scanning… hold still' : 'Scan the volcano'), onUse, radius: 4.5 });
addInteract({ id: 'aurora', pos: anchor(60, 140), kind: 'A SMALL WONDER', label: () => 'Wake the aurora', onUse, radius: 4.5 });
addInteract({ id: 'plant', pos: anchor(28, 166), kind: 'FERNWOOD', label: () => 'Nurture the sprout', onUse });
addInteract({ id: 'bear', pos: anchor(56, 105), kind: 'NORTHLIGHT', label: () => 'Greet the polar bear', onUse });
addInteract({ id: 'fish', pos: anchor(57, 118), kind: 'ICE FISHING', label: () => (fishStage === 1 ? 'Pull! (E)' : 'Cast the line'), onUse });
addInteract({ id: 'shell', pos: anchor(4, 284), kind: 'SHELL COVE', label: () => 'Pick up the shell', onUse });
addInteract({ id: 'shell2', pos: anchor(2, 287), kind: 'SHELL COVE', label: () => 'Pick up the shell', onUse });
addInteract({ id: 'shell3', pos: anchor(8, 290), kind: 'SHELL COVE', label: () => 'Pick up the shell', onUse });
addInteract({ id: 'lagoon', pos: latLonToVec3(-8, 288, 0.6), kind: 'SHELL COVE', label: () => 'Wade into water', onUse, radius: 4.5 });

function onUse(it) {
  const p = player.position.clone();
  if (it.id === 'harvest') {
    const w = byId('harvest');
    if (w.done) return toast('The harvest glows. The barn is full.');
    if (w.stage === 0) {
      w.stage = 1;
      cropSpots.forEach((c) => c.mesh.scale.setScalar(0.7));
      burst(p, 0x7ddf6a, 16, 2); chime(520); toast('🌱 Planted! Now water the rows (E).');
    } else if (w.stage === 1) {
      w.stage = 2;
      cropSpots.forEach((c) => { c.mesh.scale.setScalar(1.15); c.mesh.material = c.mats.pumpkinM; });
      burst(p, 0x4fb8ff, 18, 2); chime(600); toast('💧 Watered! Return to harvest (E).');
    } else { addItem('food', 2); completeWonder('harvest'); toast('🌾 Bountiful Harvest complete! (+2 food)'); }
  } else if (it.id === 'flame') {
    const w = byId('flame');
    if (w.done) { burst(p, 0xff9a3d, 10, 2); return toast('The flame dances for you.'); }
    w.stage++;
    fireCone.scale.multiplyScalar(1.25); fireLight.intensity += 5;
    burst(p, 0xff8c2e, 20, 2.5); chime(540 + w.stage * 60);
    if (w.stage >= 3) completeWonder('flame');
    else toast(`🔥 Tended (${w.stage}/3) — the path brightens.`);
  } else if (it.id === 'oasis') {
    const w = byId('oasis');
    if (w.done) { burst(p, 0x4fc3d8, 10, 2); return toast('The oasis ripples in the sun.'); }
    w.stage++;
    if (w.stage === 1) { oasisPond.scale.setScalar(0.85); burst(p, 0xe6c47c, 16, 2); chime(520); toast('🏜️ Sand brushed clear! Now turn the sunstones (E).'); }
    else if (w.stage === 2) {
      sunstoneMats.forEach((m) => (m.emissiveIntensity = 1.4));
      oasisPond.scale.setScalar(1.05);
      burst(p, 0xffc93d, 18, 2.4); chime(640); toast('☀️ The sunstones hum! One last push (E).');
    } else {
      oasisPond.scale.setScalar(1.3);
      burst(p, 0x4fc3d8, 24, 3); completeWonder('oasis');
    }
  } else if (it.id === 'bell') {
    const bellMesh = bellGroup.getObjectByName('bell');
    if (bellMesh && !bellMesh.userData.ringing) {
      bellMesh.userData.ringing = true;
      setTimeout(() => { if (bellMesh) { bellMesh.userData.ringing = false; bellMesh.rotation.z = 0; } }, 2500);
    }
    burst(p, 0xffe9a3, 18, 2.4); chime(880); completeWonder('bell');
  } else if (it.id === 'light') {
    if (byId('light').done) { burst(p, 0xffe9a3, 10, 2); return toast('The beacon sweeps the reef.'); }
    reefLampM.emissiveIntensity = 2.4;
    reefBeamM.opacity = 0.4;
    reefLight.intensity = 40;
    burst(p, 0xffe9a3, 22, 3); chime(760); completeWonder('light');
  } else if (it.id === 'scan') {
    if (byId('scan').done) return toast('The mountain keeps its stories. You carry one now.');
    if (scanTimer) return toast('🔭 Scanning… hold still at the tripod!');
    chime(500); toast('🔭 Scanning the crater… hold still!');
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (player.position.distanceTo(scanPos) < 7) {
        burst(player.position.clone(), 0xff7a2a, 24, 3); completeWonder('scan');
      } else toast('Scan interrupted — hold still at the tripod.');
    }, 2600);
  } else if (it.id === 'aurora') {
    if (byId('aurora').done) { burst(p, 0x50ffaa, 12, 2); return toast('The sky is awake because of you.'); }
    aurora.target = 1;
    burst(p, 0x50ffaa, 24, 3); chime(820); completeWonder('aurora');
  } else if (it.id === 'plant') {
    const s = window.__sprout;
    if (s) { s.scale.multiplyScalar(1.15); }
    burst(p, 0x9df0a8, 16, 2); chime(560); toast('🌿 The ancient sprout unfurls a new leaf.');
  } else if (it.id === 'bear') {
    const b = window.__bear;
    if (b) b.scale.multiplyScalar(1.04);
    burst(p, 0xffffff, 20, 2.2); chime(500); toast('The bear regards you with ancient calm.');
  } else if (it.id === 'fish') {
    if (fishStage === 0) {
      fishStage = 1; chime(440); toast('🎣 Line cast… wait… then press E again!');
      setTimeout(() => { if (fishStage === 1) toast('❗ Nibble! Press E now!'); }, 2200);
    } else { fishStage = 0; addItem('food', 1); burst(p, 0x7ad9ff, 22, 2.6); chime(660); toast('🐟 A flashing little marvel! (+1 food)'); }
  } else if (it.id.startsWith('shell')) {
    const idx = { shell: 0, shell2: 1, shell3: 2 }[it.id];
    const sh = shellMeshes[idx];
    if (sh && sh.visible) { sh.visible = false; burst(p, 0xf7c8c8, 14, 2); chime(620); toast('🐚 Pocketed! The cove has more.'); }
    else toast('Your pockets jingle with shells.');
  } else if (it.id === 'lagoon') {
    burst(p, 0x54e0d0, 20, 2.5); chime(580); toast('Warm shallows. Somewhere east, a bell waits to ring.');
  }
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) moveTargetN = null; // manual steering cancels click-to-move
  if (e.code === 'KeyE' && currentTarget) (currentTarget.onUse || onUse)(currentTarget);
  if (e.code === 'KeyF') eatFood();
  if (e.code === 'KeyM') toggleGlobe();
  if (e.code === 'KeyJ') toggleJournal();
  if (e.code === 'Escape') { toggleJournal(false); document.getElementById('help-overlay').classList.add('hidden'); }
});
addEventListener('keyup', (e) => (keys[e.code] = false));
let dragging = false, px = 0, py = 0, orbitYaw = 0, orbitPitch = 0;
let downX = 0, downY = 0, downT = 0, downOnCanvas = false;
let moveTargetN = null; // click-to-move destination (surface normal)
const clickRay = new THREE.Raycaster();
function clickToMove(x, y) {
  if (!planetMesh || globeMode) return;
  clickRay.setFromCamera({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, camera);
  const hits = clickRay.intersectObjects([planetMesh, ocean], false);
  if (!hits.length) return; // clicked the sky
  moveTargetN = hits[0].point.clone().normalize();
  burst(hits[0].point.clone(), 0xffffff, 8, 1.2); // ripple where you pointed
}
canvas.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; downX = e.clientX; downY = e.clientY; downT = performance.now(); downOnCanvas = true; ac(); });
addEventListener('pointerup', (e) => {
  dragging = false;
  if (downOnCanvas && Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && performance.now() - downT < 500) clickToMove(e.clientX, e.clientY);
  downOnCanvas = false;
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw += (e.clientX - px) * 0.005; orbitPitch += (e.clientY - py) * 0.005;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch, -0.5, 0.7);
  px = e.clientX; py = e.clientY;
});
// ---------- touch controls (joystick + buttons, touch devices only) ----------
const touchMove = { x: 0, y: 0 };
if ('ontouchstart' in window) {
  document.body.classList.add('touch');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  let stickId = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const drive = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), max = 45;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    touchMove.x = dx / max; touchMove.y = dy / max;
    setKnob(dx, dy);
  };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; try { stick.setPointerCapture(stickId); } catch { /* noop */ } drive(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) drive(e); });
  const release = (e) => { if (e.pointerId === stickId) { stickId = null; touchMove.x = 0; touchMove.y = 0; setKnob(0, 0); } };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);
  const hold = (id, down, up) => {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
    if (up) { b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); }
  };
  hold('btn-act', () => { if (currentTarget) (currentTarget.onUse || onUse)(currentTarget); });
  hold('btn-hop', () => (keys.Space = true), () => (keys.Space = false));
  hold('btn-eat', () => eatFood());
  hold('btn-run', () => (keys.KeyQ = true), () => (keys.KeyQ = false));
}
let globeMode = false;
function toggleGlobe() { globeMode = !globeMode; toast(globeMode ? '🌐 Globe view — the patchwork planet' : '🧭 Back to traveler view'); }
document.getElementById('btn-globe').onclick = toggleGlobe;
document.getElementById('btn-sound').onclick = (e) => {
  muted = !muted; e.target.textContent = muted ? '🔇' : '🔊';
  toast(muted ? 'Sound off' : 'Sound on — wind and bells');
};
document.getElementById('btn-help').onclick = () => document.getElementById('help-overlay').classList.remove('hidden');
document.getElementById('btn-close-help').onclick = () => document.getElementById('help-overlay').classList.add('hidden');
document.getElementById('btn-close-journal').onclick = () => toggleJournal(false);
document.getElementById('wonder-tracker').onclick = () => toggleJournal();
// Help opens only via the ⚙ button, so the 3D planet is visible from the first frame.

// ---------- HUD refs ----------
const interactBar = document.getElementById('interact-bar');
const interactLabel = document.getElementById('interact-label');
const interactKind = document.getElementById('interact-kind');
const biomeCode = document.getElementById('biome-code');
const biomeName = document.getElementById('biome-name');
const biomeDesc = document.getElementById('biome-desc');
const biomeLabel = document.getElementById('biome-label');
let currentTarget = null, lastBiome = '';

// ---------- main loop ----------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0); // smoothed up: world-Y in globe view, surface normal when following
const lastBehind = new THREE.Vector3(0, 0, 1); // smoothed behind-the-back follow direction
const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpM = new THREE.Vector3(), axis = new THREE.Vector3();

function updatePlayer(dt) {
  const n = playerPos.clone().normalize();
  // Steer from the smoothed heading — never the live camera. Deriving the
  // basis from the swinging camera fed the swing back into steering, so a
  // 180° S reversal wobbled instead of turning and juddered the camera.
  tmpF.copy(moveDirSmooth).addScaledVector(n, -moveDirSmooth.dot(n));
  if (tmpF.lengthSq() < 0.01) tmpF.copy(lastBehind); // mid-flip: hold last good heading
  else tmpF.normalize();
  tmpF.applyAxisAngle(n, orbitYaw); // stay aligned with a drag-orbited camera
  tmpR.crossVectors(tmpF, n).normalize();
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  // touch joystick feeds the same axes (analog)
  let jx = touchMove.x, jy = touchMove.y;
  if (Math.hypot(jx, jy) < 0.15) { jx = 0; jy = 0; }
  ix += jx; iz += -jy;
  if (jx || jy) moveTargetN = null; // joystick steers, cancels click-to-move
  const running = keys.KeyQ && meters.energy > 0 ? 1.7 : 1;
  const inWater = heightFor(n) < 0.12; // lagoon floor + reef shelf lie below the ocean skin
  let speed = (inWater ? 3.2 : 6.2) * running;
  if (meters.energy <= 0) speed *= 0.5; // exhausted: trudge; eat (F) or stand still to recover
  let autoMove = false;
  if (ix || iz) {
    tmpM.set(0, 0, 0).addScaledVector(tmpF, iz).addScaledVector(tmpR, ix).normalize();
    axis.crossVectors(n, tmpM).normalize();
    playerPos.applyAxisAngle(axis, (speed * dt) / R);
    // S reverses the walk like any other turn: the mesh swings around fast
    // (no 180° pop) and the camera trails behind exactly once, with nothing
    // steering off its mid-swing motion.
    facing.lerp(tmpM, 1 - Math.exp(-12 * dt)).normalize();
    moveDirSmooth.lerp(tmpM, 1 - Math.exp(-8 * dt));
    if (moveDirSmooth.lengthSq() < 1e-6) moveDirSmooth.copy(tmpM); // never collapse mid-flip
    else moveDirSmooth.addScaledVector(n, -moveDirSmooth.dot(n)).normalize();
  } else if (moveTargetN) {
    // click-to-move: step along the great circle toward the target, then stop
    const ang = n.angleTo(moveTargetN);
    if (ang < 1.4 / R) moveTargetN = null;
    else {
      autoMove = true;
      axis.crossVectors(n, moveTargetN).normalize();
      playerPos.applyAxisAngle(axis, Math.min((speed * dt) / R, ang));
      tmpM.crossVectors(axis, n).normalize();
      facing.lerp(tmpM, 1 - Math.exp(-12 * dt)).normalize();
      moveDirSmooth.lerp(tmpM, 1 - Math.exp(-8 * dt));
      if (moveDirSmooth.lengthSq() < 1e-6) moveDirSmooth.copy(tmpM);
      else moveDirSmooth.addScaledVector(n, -moveDirSmooth.dot(n)).normalize();
    }
  }
  // hop
  if (keys.Space && hopH <= 0.01 && playerVel <= 0) playerVel = 5.2;
  playerVel -= 14 * dt;
  hopH += playerVel * dt;
  if (hopH < 0) { hopH = 0; playerVel = 0; }
  const nn = playerPos.clone().normalize();
  const surfH = heightFor(nn) + 0.1 + hopH + (inWater ? -0.35 : 0);
  // survival meters: sprinting burns energy, standing still restores, arctic chills
  const sprinting = !!(ix || iz) && keys.KeyQ && meters.energy > 0;
  if (sprinting) meters.energy = Math.max(0, meters.energy - 8 * dt);
  else if (!(ix || iz)) meters.energy = Math.min(100, meters.energy + 5 * dt);
  if (biomeAt(nn) === 'arctic') meters.cold = Math.min(100, meters.cold + 6 * dt);
  else meters.cold = Math.max(0, meters.cold - 12 * dt);
  if (meters.cold >= 60) meters.energy = Math.max(0, meters.energy - 4 * dt);
  meterAlerts();
  renderStats();
  player.position.copy(nn).multiplyScalar(R + surfH);
  // orient (+Z faces travel direction; backpack stays behind at -Z)
  const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), facing.clone().negate(), nn);
  player.quaternion.setFromRotationMatrix(m);
  // bob
  player.position.addScaledVector(nn, Math.abs(Math.sin(performance.now() * 0.008)) * ((ix || iz || autoMove) ? 0.12 : 0.03));
  // lagoon splash while wading (flavor only)
  const lagoonD = player.position.distanceTo(lagoonCenter);
  if (lagoonD < 5) {
    if (!updatePlayer._t || performance.now() - updatePlayer._t > 2500) {
      updatePlayer._t = performance.now();
      burst(player.position.clone(), 0x54e0d0, 8, 1.5);
    }
  }
  return nn;
}

function updateCamera(dt, n) {
  if (globeMode) {
    const t = performance.now() * 0.00012;
    tmpM.copy(n).multiplyScalar(R * 3.1).add(V3(Math.cos(t) * 18, 10, Math.sin(t) * 18));
    camPos.lerp(tmpM, 1 - Math.exp(-2 * dt));
    camera.position.copy(camPos);
    camUp.lerp(UP, 1 - Math.exp(-2 * dt)).normalize();
    camera.up.copy(camUp);
    camera.lookAt(0, 0, 0);
    return;
  }
  // Diablo-style: high camera trailing behind the player's back, looking ahead.
  tmpF.copy(moveDirSmooth).addScaledVector(n, -moveDirSmooth.dot(n));
  // Hold the last good side while the facing vector dips (e.g. instant 180° turns).
  if (tmpF.length() > 0.25) { tmpF.normalize(); lastBehind.copy(tmpF); }
  else tmpF.copy(lastBehind);
  tmpF.applyAxisAngle(n, orbitYaw); // manual drag-orbit around the follow direction
  const height = 16 - orbitPitch * 8, backDist = 15;
  tmpR.copy(player.position).addScaledVector(tmpF, 5); // look ahead of the player
  tmpM.copy(player.position).addScaledVector(tmpF, -backDist).addScaledVector(n, height);
  // pull in front of any tall building blocking the view (ray starts at the
  // player, min distance keeps the player between camera and look target)
  axis.copy(tmpM).sub(player.position);
  const wantDist = axis.length();
  if (wantDist > 1e-4) {
    camRay.set(player.position, axis.multiplyScalar(1 / wantDist));
    camRay.far = wantDist;
    const hit = camRay.intersectObjects(occluders, true)[0];
    if (hit) tmpM.copy(player.position).addScaledVector(axis, Math.max(7, hit.distance - 1.2));
  }
  // keep camera outside planet
  if (tmpM.length() < R + 6) tmpM.setLength(R + 6);
  // never park the camera inside a building: march the target back toward the
  // player until it exits every occluder box (no freezing — it keeps tracking)
  if (pointInOccluder(tmpM)) {
    let s = wantDist;
    do {
      s -= 0.5;
      tmpM.copy(player.position).addScaledVector(axis, Math.max(s, 7));
    } while (s > 7 && pointInOccluder(tmpM));
    if (pointInOccluder(tmpM)) tmpM.copy(player.position).addScaledVector(n, height + 7);
  }
  // rise over obstacles: trade blocked horizontal distance for height
  const lack = wantDist - tmpM.distanceTo(player.position);
  if (lack > 1) {
    axis.copy(tmpM);
    tmpM.addScaledVector(n, Math.min(lack * 0.9, 12));
    if (pointInOccluder(tmpM)) tmpM.copy(axis); // rise clipped: keep the marched spot
  }
  axis.copy(camPos); // remember last good before lerping
  camPos.lerp(tmpM, 1 - Math.exp(-4 * dt));
  if (camPos.lengthSq() < 1) camPos.copy(tmpM);
  if (pointInOccluder(camPos)) camPos.copy(axis); // lerp cut a corner: revert
  camera.position.copy(camPos);
  camLook.lerp(tmpR, 1 - Math.exp(-6 * dt)); // tmpR already holds the ahead-look target
  // Lock the camera's up to the surface normal: with default world-Y up, lookAt
  // degenerates and rolls upside-down on the far side of the planet.
  camUp.lerp(n, 1 - Math.exp(-6 * dt)).normalize();
  camera.up.copy(camUp);
  camera.lookAt(camLook.lengthSq() ? camLook : tmpR);
}

function updateInteract() {
  let best = null, bestD = 1e9;
  for (const it of interactables) {
    const d = player.position.distanceTo(it.pos);
    if (d < (it.radius || 3.6) && d < bestD) { best = it; bestD = d; }
  }
  currentTarget = best;
  // chopping mode: axe appears only near a choppable tree (or mid-swing)
  const axe = player.userData.axe;
  if (axe) axe.visible = chopT > 0 || !!(best && best.node && best.node.tool === 'axe');
  if (best) {
    interactBar.classList.remove('hidden');
    interactKind.textContent = best.kind || 'INTERACT';
    interactLabel.textContent = typeof best.label === 'function' ? best.label() : best.label;
  } else interactBar.classList.add('hidden');
}

function updateBiomeLabel(n) {
  const b = biomeAt(n);
  if (b === lastBiome) return;
  lastBiome = b;
  const meta = BIOME_META[b];
  biomeCode.textContent = meta.code;
  biomeName.textContent = meta.name;
  biomeDesc.textContent = meta.desc;
  biomeLabel.classList.remove('swap');
  void biomeLabel.offsetWidth;
  biomeLabel.classList.add('swap');
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  for (const fn of tickers) fn(t, dt);
  const _bell = bellGroup?.getObjectByName('bell');
  if (_bell?.userData.ringing) _bell.rotation.z = Math.sin(t * 10) * 0.5;
  updateBursts(dt);
  // bridge repair animation
  for (const b of bridges) {
    const target = b.fixed ? 0 : 0.35;
    b.left.rotation.x += (target - b.left.rotation.x) * dt * 2;
    b.right.rotation.x += (-target - b.right.rotation.x) * dt * 2;
  }
  const n = updatePlayer(dt);
  updateCamera(dt, n);
  updateInteract();
  updateBiomeLabel(n);
  // ocean shimmer
  ocean.position.y = Math.sin(t * 0.8) * 0.08;
  renderer.render(scene, camera);
}
{
  const n0 = playerPos.clone().normalize();
  moveDirSmooth.copy(latLonToVec3(faceTarget[0], faceTarget[1], 0)).sub(playerPos); // face the local moment
  moveDirSmooth.addScaledVector(n0, -moveDirSmooth.dot(n0)).normalize();
  lastBehind.copy(moveDirSmooth);
  facing.copy(moveDirSmooth); // mesh starts facing the local moment, back to camera
  camPos.copy(playerPos).addScaledVector(moveDirSmooth, -15).addScaledVector(n0, 16);
  camLook.copy(playerPos).addScaledVector(moveDirSmooth, 5);
  camUp.copy(n0);
}
// Static bounding boxes for the tall structures (camera never parks inside one).
const occluderBoxes = occluders.map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.7));
function pointInOccluder(p) {
  for (const b of occluderBoxes) if (b.containsPoint(p)) return true;
  return false;
}
animate();
