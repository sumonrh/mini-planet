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
  const darkM = mat(0x222222);
  const body = mesh(new THREE.SphereGeometry(1, 7, 6), fur, 0, 0.9, 0);
  body.scale.set(1.5, 0.9, 0.9); g.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.set(1.4, 1.2, 0);
  g.add(headPivot);
  const head = mesh(new THREE.SphereGeometry(0.55, 7, 6), fur, 0.1, 0, 0);
  headPivot.add(head);
  // snout + nose
  headPivot.add(mesh(new THREE.SphereGeometry(0.28, 6, 5), mat(0xe8eef2), 0.5, -0.12, 0, false));
  headPivot.add(mesh(new THREE.SphereGeometry(0.11, 6, 5), darkM, 0.72, -0.06, 0, false));
  // eyes
  const eyeL = mesh(new THREE.SphereGeometry(0.09, 6, 5), darkM, 0.35, 0.16, 0.28, false);
  const eyeR = mesh(new THREE.SphereGeometry(0.09, 6, 5), darkM, 0.35, 0.16, -0.28, false);
  headPivot.add(eyeL, eyeR);
  // rounded ears
  const earL = mesh(new THREE.SphereGeometry(0.18, 6, 5), fur, -0.1, 0.5, 0.32, false);
  const earR = mesh(new THREE.SphereGeometry(0.18, 6, 5), fur, -0.1, 0.5, -0.32, false);
  headPivot.add(earL, earR);
  // stub tail
  const tail = mesh(new THREE.SphereGeometry(0.2, 6, 5), fur, -1.4, 0.9, 0, false);
  g.add(tail);
  const legs = [];
  for (const [lx, lz] of [[-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.6, lz);
    const leg = mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.8, 6), fur, 0, -0.3, 0);
    pivot.add(leg);
    // dark paws
    pivot.add(mesh(new THREE.SphereGeometry(0.22, 6, 5), mat(0xdfe8ee), 0, -0.68, 0.05, false));
    g.add(pivot);
    legs.push(pivot);
  }
  g.scale.setScalar(scale);
  // All motion is driven by the central bear updater (walk speed, attack rear-up,
  // idle breathing) so bears can chase, swipe and die as one system.
  g.userData.bearAnim = { body, headPivot, legs, tail, phase: rand(Math.PI * 2), cub };
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
const bears = []; // combat entities: { mesh, pos, home, facing, hp, maxHp, adult, dead, ... }
function spawnBear(la, lon, scale, cub, parent) {
  const mesh = makeBear(scale, cub);
  const b0 = latLonToVec3(la, lon, 0);
  const n0 = b0.clone().normalize();
  const pos = n0.clone().multiplyScalar(R + heightFor(n0) + 0.1);
  mesh.position.copy(pos);
  parent.add(mesh);
  const bear = {
    mesh, pos: pos.clone(), home: pos.clone(),
    facing: V3(1, 0, 0), hp: cub ? 40 : 100, maxHp: cub ? 40 : 100,
    adult: !cub && scale >= 0.9, cub,
    dead: false, attackT: 0, attackCd: 0, hitFlash: 0, wanderT: rand(2, 5),
    target: null, speedNow: 0, phase: rand(Math.PI * 2),
  };
  // initial facing: tangent toward increasing longitude
  const n = pos.clone().normalize();
  bear.facing = V3(-n.z, 0, n.x).normalize();
  bears.push(bear);
  return bear;
}
function bearSurfaceOrient(bear) {
  const n = bear.pos.clone().normalize();
  const f = bear.facing.clone().addScaledVector(n, -bear.facing.dot(n));
  if (f.lengthSq() < 1e-6) return;
  f.normalize();
  // model faces +X: build basis X=forward, Y=up, Z=X×Y
  const xA = f, yA = n, zA = new THREE.Vector3().crossVectors(xA, yA).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, yA, zA);
  bear.mesh.quaternion.setFromRotationMatrix(m);
}
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
  // bears (animated combat entities — adults defend their ground, cubs scamper)
  const bigBear = spawnBear(56, 105, 1.15, false, g);
  bearBig = bigBear.mesh;
  spawnBear(55, 108, 0.55, true, g);
  spawnBear(60, 132, 1.0, false, g);
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
  if (Life.chronicle.length) { // family saga entries below the wonders
    const h = document.createElement('div');
    h.className = 'journal-eyebrow';
    h.style.margin = '10px 0 4px';
    h.textContent = `HEARTH CHRONICLE · GEN ${Life.gen}`;
    list.appendChild(h);
    for (const c of Life.chronicle.slice(-8)) {
      const d = document.createElement('div');
      d.className = 'goal-row';
      d.innerHTML = `<span class="goal-era">✦</span><span>${c}</span>`;
      list.appendChild(d);
    }
  }
}
function toggleJournal(force) {
  const j = document.getElementById('journal-overlay');
  if (!j) return;
  const show = force !== undefined ? force : j.classList.contains('hidden');
  j.classList.toggle('hidden', !show);
  if (show) renderJournal();
}
renderCollection();

// ---------- inventory + survival meters (step 1: food/energy/cold + health/remedy) ----------
const inv = { wood: 0, stone: 0, gold: 0, food: 2, wool: 0, remedy: 0, egg: 0, milk: 0, meal: 0 };
const meters = { energy: 100, cold: 0, health: 100, hunger: 100, warmth: 100, morale: 80 };
let playerDead = false; // game-over gate: input + bears ignore the fallen traveler
let combatNow = 0; // seconds, advanced in animate(); drives regen + cooldowns
let lastDamageT = -99; // last time the player took a hit (for slow recovery)
let lastCheckpointId = null;
const PACK_BASE = 10;
function packSize() { return inv.wood + inv.stone + inv.gold + inv.food + inv.wool + inv.remedy + (inv.egg || 0) + (inv.milk || 0) + (inv.meal || 0); }
function packCap() { return PACK_BASE; } // +Big Pack research later
function addItem(id, n = 1) {
  if (packSize() + n > packCap()) { toast('🎒 Pack full! (capacity ' + packCap() + ')'); return false; }
  inv[id] += n;
  renderStats();
  return true;
}
// Atomic barter helper: only removes when every cost item is available.
function removeItems(cost) {
  for (const k of Object.keys(cost)) if ((inv[k] || 0) < cost[k]) return false;
  for (const k of Object.keys(cost)) inv[k] -= cost[k];
  renderStats();
  return true;
}
function eatFood() {
  if (playerDead) return;
  // trail priority: hearty meals first, then milk, berries, raw eggs last
  const menu = [
    { k: 'meal', hunger: 55, energy: 25 },
    { k: 'milk', hunger: 18, energy: 8 },
    { k: 'food', hunger: 22, energy: 12 },
    { k: 'egg', hunger: 12, energy: 6 },
  ];
  const m = menu.find((x) => (inv[x.k] || 0) > 0);
  if (!m) return toast('🍽️ No food — fish, farm, or forage first.');
  if (meters.hunger > 96 && meters.energy > 95) return toast('😋 Stuffed.');
  inv[m.k]--;
  meters.hunger = Math.min(100, (meters.hunger ?? 100) + m.hunger);
  meters.energy = Math.min(100, meters.energy + m.energy);
  if (m.k === 'meal') Life.stats.meals++;
  burst(player.position.clone(), 0x9df0a8, 10, 1.6);
  chime(620);
  toast(m.k === 'meal' ? '🍲 Hearty meal! (+55 full, +25 energy)' : `😋 +${m.hunger} full.`);
  renderStats();
}
function useRemedy() {
  if (playerDead) return;
  if (inv.remedy <= 0) return toast('🌿 No remedy — pick glowing herbs from bushes.');
  if (meters.health > 96) return toast('💚 Health already full.');
  inv.remedy--;
  meters.health = Math.min(100, meters.health + 55);
  lastDamageT = combatNow; // quick cure counts as care, not combat
  burst(player.position.clone(), 0x50ffaa, 22, 2.4);
  chime(700);
  toast('🌿 Natural remedy soothes you. (+55 health)');
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
  setText('inv-food', inv.food); setText('inv-wool', inv.wool); setText('inv-remedy', inv.remedy);
  setText('inv-egg', inv.egg || 0); setText('inv-milk', inv.milk || 0); setText('inv-meal', inv.meal || 0);
  setText('pack-count', packSize() + '/' + packCap());
  setText('home-tier', Home.house >= 2 ? `Farmhouse T${Home.house - 1}` : (Home.house === 1 ? 'Hut' : 'Tent'));
  setText('clothes-tier', CLOTHES[Life.clothes] || 'Rags');
  setText('upkeep', `👪 ${familyUpkeep()}🍎/day`);
  const e = Math.round(meters.energy), c = Math.round(meters.cold), h = Math.round(meters.health);
  if (statsCache.e !== e) { statsCache.e = e; document.getElementById('energy-fill').style.width = e + '%'; }
  if (statsCache.c !== c) { statsCache.c = c; document.getElementById('cold-fill').style.width = c + '%'; }
  if (statsCache.h !== h) {
    statsCache.h = h;
    const hf = document.getElementById('health-fill');
    if (hf) { hf.style.width = Math.max(0, h) + '%'; hf.classList.toggle('low', h <= 30); }
  }
  const hu = Math.round(meters.hunger ?? 100), wa = Math.round(meters.warmth ?? 100), mo = Math.round(meters.morale ?? 80);
  if (statsCache.hu !== hu) { statsCache.hu = hu; document.getElementById('hunger-fill').style.width = Math.max(0, hu) + '%'; }
  if (statsCache.wa !== wa) { statsCache.wa = wa; document.getElementById('warmth-fill').style.width = Math.max(0, wa) + '%'; }
  if (statsCache.mo !== mo) { statsCache.mo = mo; document.getElementById('morale-fill').style.width = Math.max(0, mo) + '%'; }
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
// Polar-bear combat targets are registered once the bear entities exist.
// Each entry tracks its bear live (pos updates every frame in updateBears).
for (const [i, b] of bears.entries()) {
  const it = {
    id: 'bear' + i, pos: b.mesh.position.clone(), bear: b, radius: 4.2,
    kind: b.adult ? '⚔️ POLAR BEAR' : '🐻 BEAR CUB',
    label: () => bearLabel(b), onUse: (t) => attackBear(b),
  };
  b.interact = it;
  addInteract(it);
}
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
  } else if (it.id.startsWith('bear')) {
    if (it.bear) attackBear(it.bear);
    else {
      const b = window.__bear;
      if (b) b.scale.multiplyScalar(1.04);
      burst(p, 0xffffff, 20, 2.2); chime(500); toast('The bear regards you with ancient calm.');
    }
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

// ---------- polar-bear combat + health + checkpoints ----------
// Adults (scale >= 0.9) guard their ground: wander home, chase inside 7u,
// swipe inside 3u for 10–16 damage. Cubs never attack — they flee.
// The axe (E on a bear) deals 12–20 × axe level with a 0.55s swing cooldown.
// Health regens slowly out of combat; 🌿 remedy heals fast.
const BEAR_AGGRO = 7, BEAR_STRIKE = 3.1, BEAR_LEASH = 14;
let playerAttackCd = 0;
function bearLabel(b) {
  if (b.dead) return 'The bear is still… (victory)';
  if (b.cub) return `Cub ${Math.ceil(b.hp)}/${b.maxHp} — it means no harm`;
  return `Bear ❤ ${Math.ceil(b.hp)}/${b.maxHp} — strike! (E)`;
}
function flashDamage() {
  const f = document.getElementById('damage-flash');
  if (!f) return;
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 160);
}
function damagePlayer(amount, from) {
  if (playerDead || meters.health <= 0) return;
  meters.health = Math.max(0, meters.health - amount);
  lastDamageT = combatNow;
  flashDamage();
  burst(player.position.clone(), 0xe03131, 12, 2.2);
  chime(160);
  // knockback: shove the traveler a step away from the swipe
  if (from) {
    const n = playerPos.clone().normalize();
    const away = player.position.clone().sub(from).addScaledVector(n, -player.position.clone().sub(from).dot(n));
    if (away.lengthSq() > 1e-6) {
      away.normalize();
      const ax = new THREE.Vector3().crossVectors(n, away).normalize();
      playerPos.applyAxisAngle(ax, 1.1 / R);
    }
  }
  renderStats();
  if (meters.health <= 0) killPlayer();
}
function attackBear(b) {
  if (!b || b.dead || playerDead) return;
  const d = player.position.distanceTo(b.mesh.position);
  if (d > 4.6) { toast(b.adult ? '⚠️ Too far — step closer to strike.' : 'The cub scampers just out of reach.'); return; }
  if (playerAttackCd > 0) return;
  playerAttackCd = 0.55;
  startChop(); // axe swing (also forces the axe visible, see updateInteract)
  // damage lands mid-swing so the hit matches the axe visually
  setTimeout(() => {
    if (b.dead || playerDead) return;
    if (player.position.distanceTo(b.mesh.position) > 5.2) return; // whiffed: bear moved away
    const dmg = Math.round((12 + Math.random() * 8) * (tools.axe || 1));
    b.hp -= dmg;
    b.hitFlash = 1;
    burst(b.mesh.position.clone(), 0xffd97a, 14, 2.4);
    chime(300);
    toast(b.cub ? `You shoo the cub (${dmg} dmg) — it flees!` : `🪓 You strike the bear for ${dmg}! (${Math.max(0, Math.ceil(b.hp))}/${b.maxHp})`);
    if (b.hp <= 0) killBear(b);
    else if (b.cub) {
      // cubs bolt from the swing: pick a flight target away from the player
      const n = b.pos.clone().normalize();
      const away = b.pos.clone().sub(player.position).addScaledVector(n, -b.pos.clone().sub(player.position).dot(n)).normalize();
      const ax = new THREE.Vector3().crossVectors(n, away);
      if (ax.lengthSq() > 1e-6) { ax.normalize(); b.fleeTarget = b.pos.clone().applyAxisAngle(ax, 8 / R); }
      b.wanderT = 0;
    }
    renderStats();
  }, 220);
}
function killBear(b) {
  b.dead = true;
  b.hp = 0;
  burst(b.mesh.position.clone(), 0xffffff, 26, 3);
  burst(b.mesh.position.clone(), 0xe03131, 14, 2);
  chime(240);
  if (b.interact) b.interact.kind = '🏆 BEAR BESTED';
  if (b.cub) toast('The cub yelps and plays dead… it will scamper off soon.');
  else {
    toast('🐻‍❄️ You bested the polar bear! Rest — health recovers slowly. (+2 food)');
    addItem('food', 2);
  }
  saveCheckpoint('bear', true); // a victory is worth remembering quietly
}
function killPlayer() {
  if (playerDead) return;
  playerDead = true;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  moveTargetN = null;
  burst(player.position.clone(), 0xe03131, 30, 3);
  chime(110);
  const g = document.getElementById('gameover');
  if (g) g.classList.remove('hidden');
  const sub = document.getElementById('gameover-sub');
  if (sub) sub.textContent = lastCheckpointId
    ? 'Returning to the last checkpoint…'
    : 'Returning to where you started…';
  setTimeout(respawnAtCheckpoint, 2600);
}
function respawnAtCheckpoint() {
  const snap = loadSave();
  const g = document.getElementById('gameover');
  if (g) g.classList.add('hidden');
  if (snap) applySave(snap, true);
  else {
    // no checkpoint yet: restart fresh at the farmstead with full health
    meters.health = 100; meters.energy = 100; meters.cold = 0;
    playerPos = latLonToVec3(2, 50, 0);
    const n0 = playerPos.clone().normalize();
    playerPos = n0.clone().multiplyScalar(R + heightFor(n0) + 0.1);
  }
  playerDead = false;
  lastDamageT = combatNow;
  renderStats();
  toast('🧭 Back on your feet. Mind the bears — axe ready (E).');
}
// slow recovery: +2/s after 6s without taking a hit (also ticks while walking)
function updateHealth(dt) {
  if (playerDead || meters.health <= 0) return;
  if (combatNow - lastDamageT > 6 && meters.health < 100) {
    meters.health = Math.min(100, meters.health + 2 * dt);
    renderStats();
  }
  if (playerAttackCd > 0) playerAttackCd -= dt;
}
// Per-frame bear brains + animation. Bears walk on the sphere (great-circle
// steps), so they chase and flee correctly anywhere on the tiny planet.
function updateBears(t, dt) {
  for (const b of bears) {
    const anim = b.mesh.userData.bearAnim;
    if (b.interact) b.interact.pos.copy(b.mesh.position);
    if (b.attackCd > 0) b.attackCd -= dt;
    if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 3);
    if (b.dead) {
      // toppled: roll onto the side and settle (stays as a trophy of the fight)
      b.mesh.rotation.z += 0; // orientation is basis-driven; use a tip offset below
      b.tip = Math.min(1, (b.tip || 0) + dt * 1.2);
      const n = b.pos.clone().normalize();
      b.mesh.position.copy(n).multiplyScalar(R + heightFor(n) + 0.1 - 0.25 * b.tip);
      bearSurfaceOrient(b);
      b.mesh.rotateX(1.35 * b.tip);
      if (anim) {
        for (const leg of anim.legs) leg.rotation.x *= 0.9;
        anim.headPivot.rotation.z = -0.5 * b.tip;
        anim.body.position.y = 0.9;
      }
      continue;
    }
    const n = b.pos.clone().normalize();
    const toPlayer = player.position.clone().sub(b.mesh.position);
    const dist = toPlayer.length();
    let moveDir = null, speed = 0;
    if (!playerDead && b.adult) {
      const homeD = b.pos.distanceTo(b.home);
      if (dist < BEAR_STRIKE) {
        // strike range: face the traveler, rear up and swipe on cooldown
        const flat = toPlayer.addScaledVector(n, -toPlayer.dot(n));
        if (flat.lengthSq() > 1e-6) b.facing.lerp(flat.normalize(), 1 - Math.exp(-8 * dt)).normalize();
        if (b.attackCd <= 0) {
          b.attackCd = 1.3;
          b.attackT = 0.65;
          setTimeout(() => {
            if (!b.dead && !playerDead && player.position.distanceTo(b.mesh.position) < BEAR_STRIKE + 0.6) {
              damagePlayer(Math.round(10 + Math.random() * 6), b.mesh.position);
              toast('🐻‍❄️ The bear swipes you! Fight back (E) or run!');
            }
          }, 280);
        }
      } else if (dist < BEAR_AGGRO && homeD < BEAR_LEASH) {
        // chase the traveler across the ice
        const flat = toPlayer.addScaledVector(n, -toPlayer.dot(n));
        if (flat.lengthSq() > 1e-6) { moveDir = flat.normalize(); speed = 4.2; }
      } else if (homeD > 4) {
        // leashed: amble home
        const toHome = b.home.clone().sub(b.pos);
        const flat = toHome.addScaledVector(n, -toHome.dot(n));
        if (flat.lengthSq() > 1e-6) { moveDir = flat.normalize(); speed = 1.6; }
      }
    }
    if (!moveDir && !b.adult) {
      // cubs: flee the player, otherwise scamper around home
      if (!playerDead && dist < 5) {
        const away = b.pos.clone().sub(player.position);
        const flat = away.addScaledVector(n, -away.dot(n));
        if (flat.lengthSq() > 1e-6) { moveDir = flat.normalize(); speed = 3.4; }
      }
    }
    if (!moveDir) {
      // idle wander: pick a new nearby heading every few seconds
      b.wanderT -= dt;
      if (b.wanderT <= 0 || !b.target) {
        b.wanderT = rand(2.5, 6);
        const tangent = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
        tangent.addScaledVector(n, -tangent.dot(n));
        if (tangent.lengthSq() > 1e-6) b.target = tangent.normalize();
      }
      if (b.fleeTarget) {
        const toF = b.fleeTarget.clone().sub(b.pos);
        const flat = toF.addScaledVector(n, -toF.dot(n));
        if (flat.length() < 1) b.fleeTarget = null;
        else { moveDir = flat.normalize(); speed = 3.0; }
      } else if (b.pos.distanceTo(b.home) < 10) {
        moveDir = b.target; speed = b.cub ? 1.6 : 0.9;
      } else {
        const toHome = b.home.clone().sub(b.pos);
        const flat = toHome.addScaledVector(n, -toHome.dot(n));
        if (flat.lengthSq() > 1e-6) { moveDir = flat.normalize(); speed = 1.4; }
      }
    }
    if (moveDir && speed > 0) {
      b.facing.lerp(moveDir, 1 - Math.exp(-6 * dt)).normalize();
      const axis = new THREE.Vector3().crossVectors(n, b.facing);
      if (axis.lengthSq() > 1e-6) {
        axis.normalize();
        b.pos.applyAxisAngle(axis, (speed * dt) / R);
        const nn = b.pos.clone().normalize();
        b.pos.copy(nn).multiplyScalar(R + heightFor(nn) + 0.1);
      }
    }
    b.speedNow += ((moveDir ? speed : 0) - b.speedNow) * Math.min(1, 5 * dt);
    if (b.attackT > 0) b.attackT -= dt;
    // place + orient on the sphere
    const nn = b.pos.clone().normalize();
    b.mesh.position.copy(nn).multiplyScalar(R + heightFor(nn) + 0.1);
    bearSurfaceOrient(b);
    // --- animation: amble scales with speed, attack rears up, hits flinch ---
    if (anim) {
      const amble = b.cub ? 7 : 3.2;
      b.phase += dt * (1.2 + b.speedNow * (b.cub ? 2.2 : 1.6));
      const s = Math.sin(b.phase * amble * 0.55);
      const amp = 0.12 + Math.min(b.speedNow / 4, 1) * 0.5;
      anim.legs[0].rotation.x = s * amp; anim.legs[3].rotation.x = s * amp;
      anim.legs[1].rotation.x = -s * amp; anim.legs[2].rotation.x = -s * amp;
      anim.body.rotation.z = s * 0.05;
      anim.body.position.y = 0.9 + Math.abs(Math.cos(b.phase * amble * 0.55)) * 0.07 * (0.5 + Math.min(b.speedNow, 3));
      // rear-up swipe: lift the head, pin the ears, lash the tail
      const atk = b.attackT > 0 ? Math.sin((b.attackT / 0.65) * Math.PI) : 0;
      b.mesh.rotateZ(atk * 0.35);
      anim.headPivot.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.08 + atk * 0.7;
      anim.headPivot.rotation.y = Math.sin(t * 0.7 + b.phase) * 0.15;
      anim.tail.rotation.x = Math.sin(t * 3 + b.phase) * 0.4 + atk * 0.8;
      if (b.hitFlash > 0) {
        // flinch: dip the head and shudder while the axe connects
        anim.headPivot.rotation.z -= b.hitFlash * 0.5;
        anim.body.position.y -= b.hitFlash * 0.12;
      } else {
        // idle breathing + ear twitches when standing still
        if (b.speedNow < 0.3 && atk <= 0) {
          anim.body.scale.y = 0.9 + Math.sin(t * 2 + b.phase) * 0.02;
          anim.headPivot.rotation.z += Math.sin(t * 0.9 + b.phase * 2) * 0.04;
        } else anim.body.scale.y = 0.9;
      }
    }
  }
}
tickers.push((t, dt) => updateBears(t, dt));

// ---------- villagers: one friendly face per zone, each happy to trade ----------
// Gold has no wild source — villagers are how it enters the traveler's pack.
const ITEM_ICON = { wood: '🪵', stone: '🪨', gold: '🪙', food: '🍎', wool: '🐑', remedy: '🌿', egg: '🥚', milk: '🥛', meal: '🍲' };
const fmtItems = (obj) => Object.entries(obj).map(([k, n]) => `${n} ${ITEM_ICON[k] || k}`).join(' + ') || '—';
function makeVillager({ coat = 0xe8a33d, hat = 'straw', hatColor = 0xe8d27a, skin = 0xf2c49b } = {}) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CapsuleGeometry(0.42, 0.75, 3, 8), mat(coat), 0, 1.05, 0));
  g.add(mesh(new THREE.SphereGeometry(0.37, 9, 7), mat(skin), 0, 1.95, 0));
  if (hat === 'straw') g.add(mesh(new THREE.ConeGeometry(0.55, 0.42, 9), mat(hatColor), 0, 2.38, 0, false));
  else if (hat === 'hood') g.add(mesh(new THREE.SphereGeometry(0.43, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(hatColor), 0, 2.0, 0, false));
  else if (hat === 'cap') g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.22, 9), mat(hatColor), 0, 2.28, 0, false));
  else if (hat === 'circlet') g.add(mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 12), mat(hatColor, { metalness: 0.5, roughness: 0.35 }), 0, 2.18, 0, false));
  else if (hat === 'fur') {
    g.add(mesh(new THREE.TorusGeometry(0.4, 0.14, 6, 12), mat(hatColor), 0, 1.98, 0, false));
    g.add(mesh(new THREE.SphereGeometry(0.42, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(coat), 0, 2.02, -0.06, false));
  }
  // waving arm (right side pivots at the shoulder)
  const arm = new THREE.Group();
  arm.position.set(0.5, 1.4, 0);
  arm.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 7), mat(coat), 0, -0.26, 0));
  arm.add(mesh(new THREE.SphereGeometry(0.12, 7, 6), mat(skin), 0, -0.56, 0, false));
  g.add(arm);
  const armL = mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 7), mat(coat), -0.52, 1.1, 0);
  g.add(armL);
  // golden "!" marker so travelers can spot a trader from afar
  const markM = new THREE.MeshStandardMaterial({ color: 0xffd97a, emissive: 0xa86a00, emissiveIntensity: 0.9, flatShading: true });
  const mark = mesh(new THREE.OctahedronGeometry(0.22, 0), markM, 0, 3.1, 0, false);
  g.add(mark);
  g.userData.villager = { arm, mark, phase: rand(Math.PI * 2) };
  return g;
}
const NPCS = [
  {
    id: 'maren', name: 'Maren', zone: 'CLOVER FIELDS', lat: 3.5, lon: 52,
    look: { coat: 0x3f9a4c, hat: 'straw', hatColor: 0xe8d27a },
    lines: [
      'Mind the sheep, love — shear them gentle and I’ll make it worth your while.',
      'Wool for winter coats, food for the table. That’s the whole economy, love.',
    ],
    trades: [
      { id: 'wool-food', give: { wool: 1 }, get: { food: 2 }, blurb: 'Wool for winter coats' },
      { id: 'food-gold', give: { food: 2 }, get: { gold: 1 }, blurb: 'Sell the harvest surplus' },
    ],
  },
  {
    id: 'ash', name: 'Ash the Firekeeper', zone: 'FERNWOOD', lat: 15.5, lon: 158,
    look: { coat: 0xc9573a, hat: 'hood', hatColor: 0x7a2e1a },
    lines: [
      'The flame eats pine like I eat stew. Bring wood, leave fed.',
      'Cold nights, warm fire. You chop, I cook — fair?',
    ],
    trades: [
      { id: 'wood-food', give: { wood: 2 }, get: { food: 1 }, blurb: 'Firewood for hot stew' },
      { id: 'woodwool-gold', give: { wood: 1, wool: 1 }, get: { gold: 1 }, blurb: 'Bundles for the cabin' },
    ],
  },
  {
    id: 'zara', name: 'Zara the Spice Trader', zone: 'SUNSTONE OASIS', lat: 9.5, lon: 108,
    look: { coat: 0x7a4fc9, hat: 'circlet', hatColor: 0xe8c33d },
    lines: [
      'Gold for dates, stone for carvings — the desert provides, darling.',
      'Everything has a price, and my prices are almost fair.',
    ],
    trades: [
      { id: 'gold-food', give: { gold: 1 }, get: { food: 2 }, blurb: 'Spiced dates and flatbread' },
      { id: 'stone-gold', give: { stone: 2 }, get: { gold: 1 }, blurb: 'Carved basalt charms' },
    ],
  },
  {
    id: 'pip', name: 'Pip the Beachcomber', zone: 'SHELL COVE', lat: 14.5, lon: 275,
    look: { coat: 0x2e8b8b, hat: 'cap', hatColor: 0xf3e9dc },
    lines: [
      'Driftwood, shells, sea-herbs — the tide brings it, I trade it!',
      'Found a sea-herb poultice today. Good for bear scratches, I’d wager.',
    ],
    trades: [
      { id: 'wood-gold', give: { wood: 2 }, get: { gold: 1 }, blurb: 'Polished driftwood' },
      { id: 'gold-remedy', give: { gold: 1 }, get: { remedy: 1 }, blurb: 'Sea-herb poultice' },
    ],
  },
  {
    id: 'marina', name: 'Marina the Keeper', zone: 'TIDEGLASS REEF', lat: 0.5, lon: 226,
    look: { coat: 0x33414e, hat: 'cap', hatColor: 0xe8c33d },
    court: true,
    lines: [
      'The beacon burns because sailors share. Got stone for the repairs?',
      'Fish for friends, remedies for the wise. The reef looks after its own.',
    ],
    trades: [
      { id: 'stone-food', give: { stone: 1 }, get: { food: 2 }, blurb: 'Help repair, eat well' },
      { id: 'food-remedy', give: { food: 1, gold: 1 }, get: { remedy: 2 }, blurb: 'Sailor’s tonic (2×)' },
    ],
  },
  {
    id: 'cinder', name: 'Cinder the Smith', zone: 'EMBER HEIGHTS', lat: 6.5, lon: 325,
    look: { coat: 0x4a4038, hat: 'hood', hatColor: 0x2a2320 },
    lines: [
      'Basalt for coin, and — for the right bundle — I’ll put a real edge on that axe.',
      'A sharp axe chops faster AND bites bears harder. Think about it.',
    ],
    trades: [
      { id: 'stone-gold', give: { stone: 2 }, get: { gold: 1 }, blurb: 'Volcanic glass stock' },
      {
        id: 'sharpen', give: { wood: 3, stone: 2 }, get: {}, blurb: 'Sharpen axe (1.5× chop + fight)',
        once: true, effect: () => { tools.axe = 1.5; },
        doneText: 'Axe already razor-sharp ✓',
      },
    ],
  },
  {
    id: 'siku', name: 'Siku the Ice Guide', zone: 'NORTHLIGHT', lat: 59.5, lon: 138,
    look: { coat: 0xeef4f6, hat: 'fur', hatColor: 0xcfd8dc },
    lines: [
      'Bears mind their ground — give them room, keep your axe ready.',
      'Warming tea-herbs for the trail, and I pay well for warm wool.',
    ],
    trades: [
      { id: 'food-remedy', give: { food: 1 }, get: { remedy: 1 }, blurb: 'Warming tea-herbs' },
      { id: 'wool-gold', give: { wool: 1 }, get: { gold: 2 }, blurb: 'Wool for a parka' },
    ],
  },
  {
    id: 'lena', name: 'Lena the Shepherdess', zone: 'CLOVER FIELDS', lat: 5.5, lon: 47,
    look: { coat: 0xe8a33d, hat: 'straw', hatColor: 0xc9573a },
    court: true,
    lines: [
      'My sheep, my hills, my whole heart. Well. Most of it.',
      'Bring me an apple a day and we’ll see where this goes, traveler.',
    ],
    trades: [
      { id: 'food-wool', give: { food: 2 }, get: { wool: 1 }, blurb: 'Fresh-shorn fleece' },
      { id: 'gold-food', give: { gold: 2 }, get: { food: 3 }, blurb: 'Picnic basket' },
    ],
  },
];
for (const n of NPCS) {
  for (const t of n.trades) t.count = 0;
  n.met = false;
  n.greeted = false;
  n.lineIdx = 0;
  n.mesh = makeVillager(n.look);
  n.pos = anchor(n.lat, n.lon, 0);
  n.mesh.position.copy(n.pos);
  n.facing = V3(1, 0, 0);
  scene.add(n.mesh);
  // face the traveler: orient +Z toward the smoothed facing (same convention as the player)
  const _m4 = new THREE.Matrix4();
  const _up = n.pos.clone().normalize();
  n.facing.copy(V3(-_up.z, 0, _up.x).normalize());
  n.mesh.position.copy(_up.clone().multiplyScalar(R + heightFor(_up) + 0.05));
  addInteract({
    id: 'npc-' + n.id, pos: n.mesh.position.clone(), npc: n, radius: 4.2,
    kind: '🧑 ' + n.zone, label: () => `Talk to ${n.name}`,
    onUse: () => openTrade(n),
  });
}
function tradeAfford(n, t) {
  if (t.once && t.count > 0) return { ok: false, why: t.doneText || 'Done ✓' };
  for (const [k, need] of Object.entries(t.give)) {
    if ((inv[k] || 0) < need) return { ok: false, why: `Need ${need - (inv[k] || 0)} more ${ITEM_ICON[k] || k}` };
  }
  const giveN = Object.values(t.give).reduce((a, b) => a + b, 0);
  const getN = Object.values(t.get).reduce((a, b) => a + b, 0);
  if (packSize() - giveN + getN > packCap()) return { ok: false, why: 'No pack room' };
  return { ok: true };
}
function doTrade(n, t) {
  if (playerDead || npcOpen !== n) return;
  const aff = tradeAfford(n, t);
  if (!aff.ok) { toast(`😕 ${n.name}: ${aff.why}.`); return; }
  if (!removeItems(t.give)) { toast(`😕 ${n.name}: not enough goods.`); return; }
  let gotAll = true;
  for (const [k, num] of Object.entries(t.get)) {
    for (let i = 0; i < num; i++) if (!addItem(k, 1)) { gotAll = false; break; }
    if (!gotAll) break;
  }
  if (!gotAll) { // pack filled mid-trade: refund what we can no longer deliver
    for (const [k, num] of Object.entries(t.give)) inv[k] += num;
    renderStats();
    return toast('🎒 Pack full — trade cancelled.');
  }
  if (t.effect) t.effect();
  t.count++;
  n.lineIdx = (n.lineIdx + 1) % n.lines.length;
  burst(player.position.clone(), 0xffd97a, 16, 2);
  chime(660);
  const got = Object.keys(t.get).length ? ` (+${fmtItems(t.get)})` : '';
  toast(`🤝 ${t.blurb}${got}`);
  renderTradePanel();
  saveCheckpoint('trade', true); // persist the barter quietly so progress survives death
  renderStats();
}
// Per-frame villager life: breathe, wave, turn to face nearby travelers.
function updateNpcs(t) {
  for (const n of NPCS) {
    const v = n.mesh.userData.villager;
    const nn = n.pos.clone().normalize();
    n.mesh.position.copy(nn).multiplyScalar(R + heightFor(nn) + 0.05 + Math.sin(t * 1.8 + v.phase) * 0.05);
    const d = player.position.distanceTo(n.mesh.position);
    const toP = player.position.clone().sub(n.mesh.position);
    toP.addScaledVector(nn, -toP.dot(nn));
    if (!playerDead && toP.lengthSq() > 1e-6 && d < 9) {
      n.facing.lerp(toP.normalize(), 0.08);
    } else {
      // idle scan of the horizon when no one is near
      const slow = V3(Math.sin(t * 0.3 + v.phase), 0, Math.cos(t * 0.3 + v.phase));
      slow.addScaledVector(nn, -slow.dot(nn));
      if (slow.lengthSq() > 1e-6) n.facing.lerp(slow.normalize(), 0.01);
    }
    n.facing.addScaledVector(nn, -n.facing.dot(nn)).normalize();
    const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), n.facing.clone().negate(), nn);
    n.mesh.quaternion.setFromRotationMatrix(m);
    // friendly wave that speeds up when the traveler is close
    const waveAmp = d < 6 ? 0.7 : 0.15;
    v.arm.rotation.z = -0.25 + Math.sin(t * (d < 6 ? 5 : 1.6) + v.phase) * waveAmp;
    v.mark.position.y = 3.1 + Math.sin(t * 2.2 + v.phase) * 0.18;
    v.mark.rotation.y += 0.02;
    if (!n.greeted && !playerDead && d < 5.5) {
      n.greeted = true;
      toast(`🧑 ${n.name} waves you over — press E to talk & trade.`);
      chime(620);
    }
  }
}
tickers.push((t) => updateNpcs(t));

// ---------- NPC trade dialogue panel ----------
let npcOpen = null;
function openTrade(n) {
  if (playerDead || npcOpen) return;
  npcOpen = n;
  n.met = true;
  document.getElementById('npc-eyebrow').textContent = n.zone;
  document.getElementById('npc-name').textContent = n.name;
  document.getElementById('npc-line').textContent = `“${n.lines[n.lineIdx % n.lines.length]}”`;
  document.getElementById('npc-overlay').classList.remove('hidden');
  renderTradePanel();
  chime(520);
}
function renderTradePanel() {
  const n = npcOpen;
  if (!n) return;
  const box = document.getElementById('npc-trades');
  box.innerHTML = '';
  document.getElementById('npc-line').textContent = `“${n.lines[n.lineIdx % n.lines.length]}”`;
  renderCourtRow(n, box);
  for (const t of n.trades) {
    const aff = tradeAfford(n, t);
    const b = document.createElement('button');
    b.className = 'npc-trade';
    b.disabled = !aff.ok;
    const route = Object.keys(t.get).length
      ? `${fmtItems(t.give)} → ${fmtItems(t.get)}`
      : `${fmtItems(t.give)} → ${t.resultText || '✨ axe sharper'}`;
    b.innerHTML = `<span class="trade-main"><span class="trade-route">${route}</span>` +
      `<span class="trade-blurb"><br>${t.blurb}${aff.ok ? '' : ` — ${aff.why}`}</span></span>` +
      `<span class="trade-count">${t.once ? (t.count > 0 ? '✓' : '1×') : (t.count > 0 ? `×${t.count}` : '')}</span>`;
    b.onclick = () => doTrade(n, t);
    box.appendChild(b);
  }
}
function closeTrade() {
  if (!npcOpen) return;
  npcOpen = null;
  document.getElementById('npc-overlay').classList.add('hidden');
}

// ==================== HEARTH & HARVEST life-sim ====================
// --- time, seasons, sky ---
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
const DAY_LEN = 240; // real seconds per full day
const DAYS_PER_SEASON = 6;
const CLOTHES = ['Rags', 'Tunic', 'Parka', 'Festive Garb'];
const Life = {
  day: 1, t: 0.3, clothes: 0, gen: 1, ring: false, spouse: null,
  kids: [], workers: [], forecast: null, festival: false,
  nights: 0, lastGift: {}, kidSeq: 0,
  stats: { maxFood: 2, harvests: 0, meals: 0, goldEarned: 0, disasters: 0, tornadoSeen: false },
  rot: { food: 0, egg: 0, milk: 0, meal: 0 },
  chronicle: [],
};
const nightLights = []; // {l, base} — lanterns/windows glow harder at night
function seasonOf(day) { return Math.floor((day - 1) / DAYS_PER_SEASON) % 4; }
function seasonNow() { return seasonOf(Life.day); }
function isNight() { const t = ((Life.t % 1) + 1) % 1; return t >= 0.62 || t < 0.05; }
const _skyDay = new THREE.Color(0x16324a), _skyNight = new THREE.Color(0x070f1c);
let starPts = null, hemiL = null;
scene.traverse((o) => { if (!starPts && o.isPoints) starPts = o; if (!hemiL && o.isHemisphereLight) hemiL = o; });
function updateSky() {
  const t = ((Life.t % 1) + 1) % 1;
  const dl = Math.sin(t * Math.PI * 2 - 0.3);
  const dayF = THREE.MathUtils.smoothstep(dl, -0.15, 0.5);
  scene.background.copy(_skyNight).lerp(_skyDay, dayF);
  if (scene.fog) scene.fog.color.copy(scene.background);
  const ang = t * Math.PI * 2 - Math.PI / 2;
  sun.position.set(Math.cos(ang) * 60, Math.sin(ang) * 60 + 8, 25);
  sun.intensity = 0.3 + dayF * 2.0;
  if (hemiL) hemiL.intensity = 0.35 + dayF * 0.75;
  if (starPts) starPts.material.opacity = 0.75 * (1 - dayF) + 0.08;
  for (const L of nightLights) L.l.intensity = L.base * (1 - dayF * 0.7);
  renderer.toneMappingExposure = 1.0 + dayF * 0.25;
}
function dayPillText() {
  const icon = isNight() ? '🌙' : '☀️';
  let s = `${icon} Day ${Life.day} · ${SEASON_ICON[seasonNow()]} ${SEASONS[seasonNow()]}`;
  if (Life.festival) s += ' · 🎉 Festival!';
  else if (Life.forecast) s += ` · ⚠️ ${DISASTER_ICON[Life.forecast]} tomorrow`;
  return s;
}
tickers.push((t, dt) => {
  if (!playerDead && !sleeping) {
    Life.t += dt / DAY_LEN;
    if (Life.t >= 1) { Life.t -= 1; Life.day++; dawnRoutine(false); }
  }
  updateSky();
  const el = document.getElementById('day-pill');
  if (el) { const s = dayPillText(); if (el.textContent !== s) el.textContent = s; }
});
// --- sleep ---
let sleeping = false;
function sleepUntilMorning() {
  if (sleeping || playerDead) return;
  sleeping = true;
  const f = document.getElementById('sleep-fade');
  f.classList.remove('hidden');
  requestAnimationFrame(() => f.classList.add('show'));
  chime(320);
  setTimeout(() => {
    Life.t = 0.06; Life.day++;
    dawnRoutine(true);
    f.classList.remove('show');
    setTimeout(() => { f.classList.add('hidden'); sleeping = false; }, 700);
  }, 1000);
}
// --- the overnight engine: every subsystem resolves here at dawn ---
function dawnRoutine(rested) {
  Life.nights++;
  Life.festival = (Life.day % DAYS_PER_SEASON === 0);
  Life.blizzard = false; Life.drought = false; Life.sheltered = false; // yesterday's weather ends
  const todayHit = Life.forecast; Life.forecast = null;
  if (todayHit) triggerDisaster(todayHit);
  rollForecast();
  overnightNeeds(rested);
  overnightAnimals();
  overnightCrops();
  overnightSpoilage();
  overnightWorkers();
  overnightFamily(rested);
  overnightStall();
  ageKids();
  const bedQ = [70, 85, 100, 100, 100][Home.house] ?? 70;
  if (rested) {
    meters.energy = Math.max(meters.energy, bedQ);
    meters.health = Math.min(100, meters.health + 20);
  } else {
    meters.energy = Math.max(0, meters.energy - 30);
  }
  if (Life.festival) {
    meters.morale = Math.min(100, meters.morale + 30);
    addItem('food', 2);
    burst(player.position.clone(), 0xf7a8c4, 22, 2.5);
  }
  if (Life.bless?.aurora) addItem('food', 1); // sky blessing on the doorstep
  saveCheckpoint('sleep', true);
  renderStats();
  let msg = `☀️ Day ${Life.day} · ${SEASONS[seasonNow()]}` + (rested ? '' : ' (nodded off outside 😴−⚡)') + (Life.festival ? ` · 🎉 ${SEASONS[seasonNow()]} festival!` : '');
  if (Life.forecast) msg += ` — ⚠️ ${DISASTER_ICON[Life.forecast]} tomorrow! Prepare!`;
  toast(msg);
  chime(520);
}
// --- life-sim save/load (v2; old v1 saves load with fresh homestead defaults) ---
function saveLife() {
  return {
    day: Life.day, t: Life.t, clothes: Life.clothes, gen: Life.gen, ring: Life.ring,
    spouse: Life.spouse, kids: Life.kids.map((k) => ({ ...k })), workers: Life.workers.map((w) => ({ ...w })),
    wolfRaid: Life.wolfRaid || 0,
    forecast: Life.forecast, nights: Life.nights, lastGift: { ...Life.lastGift }, kidSeq: Life.kidSeq,
    stats: { ...Life.stats }, rot: { ...Life.rot }, chronicle: [...Life.chronicle],
    bless: { ...(Life.bless || {}) },
    home: { house: Home.house, well: Home.well, barn: Home.barn, fences: Home.fences, cabin: Home.cabin, stall: Home.stall, lanterns: Home.lanterns, dog: Home.dog, decor: Home.decor, plots: Home.plots.map((p) => ({ crop: p.crop, growth: p.growth, water: p.water })) },
    animals: animals.map((a) => ({ kind: a.kind, fed: a.fed, sick: a.sick })),
    hearts: NPCS.map((n) => ({ id: n.id, hearts: n.hearts || 0 })),
  };
}
function restoreLife(s) {
  Object.assign(Life, { day: s.day ?? 1, t: s.t ?? 0.3, clothes: s.clothes ?? 0, gen: s.gen ?? 1, ring: !!s.ring, spouse: s.spouse ?? null, forecast: s.forecast ?? null, nights: s.nights ?? 0, kidSeq: s.kidSeq ?? 0 });
  Life.kids = (s.kids || []).map((k) => ({ ...k }));
  Life.workers = (s.workers || []).map((w) => ({ ...w }));
  Life.lastGift = { ...(s.lastGift || {}) };
  Object.assign(Life.stats, s.stats || {});
  Object.assign(Life.rot, s.rot || {});
  Life.chronicle = [...(s.chronicle || [])];
  Life.bless = { ...((s.bless) || {}) };
  Life.wolfRaid = s.wolfRaid || 0;
  if (s.home) {
    Home.house = s.home.house ?? 0; Home.well = !!s.home.well; Home.barn = s.home.barn ?? 0;
    Home.fences = s.home.fences ?? 0; Home.cabin = !!s.home.cabin; Home.stall = !!s.home.stall;
    Home.lanterns = s.home.lanterns ?? 0; Home.dog = !!s.home.dog; Home.decor = s.home.decor ?? 0;
    Home.plots = (s.home.plots || []).map((p) => ({ bought: !!p.bought, crop: !!p.crop, growth: p.growth ?? 0, water: !!p.water }));
    while (Home.plots.length < 6) Home.plots.push({ crop: false, growth: 0, water: false });
  }
  rebuildHomestead();
  clearAnimals();
  for (const sa of s.animals || []) spawnAnimal(sa.kind, true);
  for (const sh of s.hearts || []) { const n = NPCS.find((x) => x.id === sh.id); if (n) n.hearts = sh.hearts || 0; }
  settleSpouse(false);
  spawnWorkers();
  spawnKidsMeshes();
  if (Home.dog && !dogEnt) spawnDog();
  renderStats();
}

// --- needs: hunger, warmth buffer, morale + clothing ---
function familyUpkeep() {
  let n = 1; // self
  if (Life.spouse) n += 1;
  for (const k of Life.kids) n += k.stage >= 2 ? 2 : 1;
  for (const w of Life.workers) n += 2;
  return n;
}
function kidStageName(s) { return ['Baby', 'Child', 'Teen', 'Adult'][s] || '?'; }
let hungerWarned = false;
function moraleTarget() {
  let m = 45 + Home.house * 7 + Home.decor * 3 + (Life.spouse ? 10 : 0) + Life.kids.length * 3 + (Life.festival ? 25 : 0) + (Life.bless?.bell ? 10 : 0);
  if (Life.grief > 0) m -= 30;
  return THREE.MathUtils.clamp(m, 5, 100);
}
function moraleSpeed() { const m = meters.morale ?? 80; return m < 30 ? 0.9 : (m > 70 ? 1.05 : 1); }
function nearHomeFire() {
  if (!homeFirePos) return false;
  return player.position.distanceTo(homeFirePos) < 7;
}
// Warmth is the body's heat buffer; when it runs out, the old cold meter climbs.
function coldTick(dt, nn) {
  const winter = seasonNow() === 3;
  const arctic = biomeAt(nn) === 'arctic';
  let exposure = arctic ? 9 : 0;
  if (winter && !arctic) exposure += 5;
  else if (winter) exposure += 2;
  if (isNight()) exposure += 1;
  if (Life.blizzard) exposure += 6;
  if (Life.bless?.flame) exposure *= 0.8;
  const wTarget = THREE.MathUtils.clamp(100 - exposure * 10 + (nearHomeFire() ? 60 : 0) + Life.clothes * 12, 0, 100);
  const rate = 3 + exposure;
  meters.warmth += THREE.MathUtils.clamp(wTarget - meters.warmth, -dt * rate, dt * rate);
  if ((meters.warmth ?? 100) >= 60) {
    meters.cold = Math.max(0, meters.cold - 12 * dt);
  } else {
    const clothF = 1 - 0.22 * (Life.clothes || 0);
    meters.cold = Math.min(100, meters.cold + ((60 - meters.warmth) / 60) * 6 * clothF * dt);
  }
  if (meters.cold >= 60) meters.energy = Math.max(0, meters.energy - 4 * dt);
}
function overnightNeeds(rested) {
  // family supper: auto-eat cheapest raw produce first, hearty meals saved for the trail
  const need = familyUpkeep();
  let ate = 0;
  while (ate < need) {
    let took = false;
    for (const k of ['egg', 'milk', 'food']) { if (inv[k] > 0) { inv[k]--; ate++; took = true; break; } }
    if (!took) break;
  }
  if (ate < need) {
    meters.hunger = Math.max(0, meters.hunger - 40);
    meters.morale = Math.max(0, meters.morale - 15);
    Life.grief = Math.min(1.5, (Life.grief || 0) + 0.6);
  }
  meters.hunger = Math.max(0, meters.hunger - 15);
  renderStats();
}
function cookMeal() {
  if (playerDead) return;
  const have = (inv.food || 0) + (inv.egg || 0) + (inv.milk || 0);
  if (have < 2) return toast('🍲 Need 2 produce (🍎/🥚/🥛) to cook a meal.');
  let need = 2;
  for (const k of ['food', 'egg', 'milk']) { while (need > 0 && inv[k] > 0) { inv[k]--; need--; } }
  inv.meal = (inv.meal || 0) + 1; // net −1 pack, always fits
  meters.energy = Math.min(100, meters.energy + 5);
  burst(homeFirePos ? homeFirePos.clone() : player.position.clone(), 0xffb35a, 14, 2);
  chime(700);
  toast('🍲 Cooked a hearty meal! (F to eat)');
  renderStats();
}
tickers.push((t, dt) => {
  if (playerDead || sleeping) return;
  meters.hunger = Math.max(0, (meters.hunger ?? 100) - dt * (100 / 300));
  if (meters.hunger <= 0) {
    meters.health = Math.max(1, meters.health - 2 * dt); // starving aches but won't finish you
    meters.energy = Math.max(0, meters.energy - 3 * dt);
    if (!hungerWarned) { hungerWarned = true; toast('🍽️ Starving! Eat something (F).'); chime(200); }
  } else if (meters.hunger > 30) hungerWarned = false;
  const stock = inv.food + (inv.egg || 0) + (inv.milk || 0) + (inv.meal || 0);
  if (stock > Life.stats.maxFood) Life.stats.maxFood = stock;
  if (Life.grief > 0) Life.grief = Math.max(0, Life.grief - dt / 120);
  const mt = moraleTarget();
  meters.morale += THREE.MathUtils.clamp(mt - (meters.morale ?? 80), -dt * 2, dt * 2);
});

// --- homestead: buildings, plots, well (fixed site south of Clover Fields) ---
const HOME = { lat: -3, lon: 56 };
const Home = {
  house: 0, well: false, barn: 0, fences: 0, cabin: false, stall: false,
  lanterns: 0, dog: false, decor: 0, dmg: {},
  plots: Array.from({ length: 6 }, () => ({ crop: false, growth: 0, water: false })),
};
let homeFirePos = null;
const homeGroup = new THREE.Group();
scene.add(homeGroup);
const plotMesh = [];
function homeSpot(lat, lon, h = 0.05) {
  const b = latLonToVec3(lat, lon, 0);
  return latLonToVec3(lat, lon, heightFor(b.normalize()) + h);
}
function placeAt(obj, lat, lon, h = 0.05, yaw = 0) {
  orientOnSphere(obj, homeSpot(lat, lon, h), yaw);
  homeGroup.add(obj);
  return obj;
}
function addOccluder(obj) {
  occluders.push(obj);
  try { occluderBoxes.push(new THREE.Box3().setFromObject(obj).expandByScalar(0.7)); } catch { /* boxes not ready yet */ }
}
const HOUSE_SPOT = { lat: -2, lon: 56 };
// soil + crop visuals per plot
const soilDryM = () => mat(0x8a5a33);
const soilWetM = () => mat(0x5a3a22);
function buildPlotMesh(i, lat, lon) {
  const g = new THREE.Group();
  const soil = mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 8), soilDryM(), 0, 0.12, 0);
  g.add(soil);
  const cropG = new THREE.Group();
  g.add(cropG);
  placeAt(g, lat, lon, 0, 0);
  plotMesh[i] = { g, soil, cropG };
  updatePlotMesh(i);
}
function updatePlotMesh(i) {
  const pm = plotMesh[i];
  if (!pm) return;
  const p = Home.plots[i];
  pm.soil.material = p.water ? soilWetM() : soilDryM();
  while (pm.cropG.children.length) pm.cropG.remove(pm.cropG.children[0]);
  if (!p.crop) return;
  const sproutM = mat(0x3fae4e), pumpkinM = mat(0xe07b2a);
  if (p.growth >= 1) for (let k = 0; k < 3; k++)
    pm.cropG.add(mesh(new THREE.ConeGeometry(0.14, 0.5 + p.growth * 0.25, 5), sproutM, -0.4 + k * 0.4, 0.5, (k % 2) * 0.3 - 0.15, false));
  if (p.growth >= 3) for (let k = 0; k < 2; k++)
    pm.cropG.add(mesh(new THREE.IcosahedronGeometry(0.26, 0), pumpkinM, -0.25 + k * 0.5, 0.35, 0.25, false));
}
function refreshPlotMeshes() { for (let i = 0; i < 6; i++) updatePlotMesh(i); }
function buildHouseMesh() {
  const t = Home.house, broken = Home.dmg.house;
  if (t === 0) {
    const tent = mesh(new THREE.ConeGeometry(1.5, 1.9, 6), mat(0xd9c9a8), 0, 0, 0);
    placeAt(tent, HOUSE_SPOT.lat, HOUSE_SPOT.lon, 0.9, 0.4);
    placeAt(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.56, 8), mat(0xe8d9a8), 0, 0, 0, false), HOUSE_SPOT.lat + 1.2, HOUSE_SPOT.lon + 0.5, 0.2, 1);
    return;
  }
  const g = new THREE.Group();
  const wallM = mat(t >= 4 ? 0xf3e4c8 : 0x9a6b42), roofM = mat(t >= 3 ? 0x7a2e2e : 0x4a5d5a);
  const w = t >= 3 ? 4.2 : 3.2, d = t >= 3 ? 3.6 : 2.8, hgt = t >= 4 ? 3.2 : 2.2;
  g.add(mesh(new THREE.BoxGeometry(w, hgt, d), wallM, 0, hgt / 2, 0));
  const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.5, 4), roofM, 0, hgt + 0.75, 0);
  roof.rotation.y = Math.PI / 4; g.add(roof);
  if (t >= 3) { // second wing + cellar door
    g.add(mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), wallM, w / 2 + 0.8, 0.9, 0.4));
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.1, 0.15), mat(0x4a3320), -w / 2 + 0.6, 0.55, d / 2 + 0.02, false));
  }
  // warm windows (emissive at night via shared material)
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), windowGlowM, -w / 4, 1.3, d / 2 + 0.02, false));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), windowGlowM, w / 4, 1.3, d / 2 + 0.02, false));
  const chim = mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 6), mat(0x8d8d94), w / 4, hgt + 1.2, -d / 4);
  g.add(chim);
  g.userData.chimney = new THREE.Vector3(w / 4, hgt + 2, -d / 4);
  if (broken) { g.rotation.z = 0.12; } // storm-tilted until repaired
  placeAt(g, HOUSE_SPOT.lat, HOUSE_SPOT.lon, 0, 0.5);
  addOccluder(g);
  Home.chimneyG = g;
}
const windowGlowM = new THREE.MeshStandardMaterial({ color: 0xffe9a3, emissive: 0xffb35a, emissiveIntensity: 0.4, flatShading: true });
function buildBarnMesh() {
  if (!Home.barn) return;
  const t = Home.barn, broken = Home.dmg.barn;
  const g = new THREE.Group();
  const s = t >= 2 ? 1.25 : 1;
  g.add(mesh(new THREE.BoxGeometry(3.4 * s, 2.4, 2.6), mat(0xc93a3a), 0, 1.2, 0));
  const roof = mesh(new THREE.ConeGeometry(2.6 * s, 1.4, 4), mat(0x2f4f4a), 0, 3.0, 0);
  roof.rotation.y = Math.PI / 4; g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(1.2, 1.6, 0.12), mat(0x4a3320), 0, 0.8, 1.32, false));
  if (broken) g.rotation.z = -0.1;
  placeAt(g, -5, 55, 0, -0.3);
  addOccluder(g);
}
function buildFenceMesh() {
  if (!Home.fences) return;
  const c = latLonToVec3(HOME.lat, HOME.lon, 0).normalize();
  const up = c.clone();
  const u = V3(-up.z, 0, up.x).normalize(), v = new THREE.Vector3().crossVectors(up, u).normalize();
  const postM = mat(Home.fences >= 3 ? 0x8d8d94 : 0x9a6b42);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = c.clone().addScaledVector(u, Math.cos(a) * 4.2).addScaledVector(v, Math.sin(a) * 4.2).normalize();
    const post = mesh(new THREE.CylinderGeometry(0.09, 0.11, Home.fences >= 2 ? 1.3 : 0.9, 5), postM, 0, 0, 0);
    orientOnSphere(post, p.clone().multiplyScalar(R + heightFor(p) + 0.45), 0);
    homeGroup.add(post);
    if (Home.fences >= 2 && i % 2 === 0) { // rails between posts
      const a2 = ((i + 1) / 12) * Math.PI * 2;
      const p2 = c.clone().addScaledVector(u, Math.cos(a2) * 4.2).addScaledVector(v, Math.sin(a2) * 4.2).normalize();
      const mid = p.clone().add(p2).multiplyScalar(0.5).normalize();
      const rail = mesh(new THREE.BoxGeometry(2.3, 0.12, 0.12), postM, 0, 0, 0, false);
      orientOnSphere(rail, mid.clone().multiplyScalar(R + heightFor(mid) + 0.85), -a);
      homeGroup.add(rail);
    }
  }
}
function buildMiscMeshes() {
  if (Home.well) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.9, 8), mat(0x8d8d94), 0, 0.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5), mat(0x7a5230), -0.6, 1.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5), mat(0x7a5230), 0.6, 1.2, 0));
    g.add(mesh(new THREE.ConeGeometry(1.0, 0.7, 6), mat(0x7a8b6f), 0, 2.3, 0));
    if (Home.dmg.well) g.rotation.z = 0.12;
    placeAt(g, -1.5, 54, 0, 0);
  }
  if (Home.cabin) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.4, 1.9, 2.2), mat(0x8a6238), 0, 0.95, 0));
    const roof = mesh(new THREE.ConeGeometry(2.0, 1.0, 4), mat(0x4a5d5a), 0, 2.4, 0);
    roof.rotation.y = Math.PI / 4; g.add(roof);
    if (Home.dmg.cabin) g.rotation.z = -0.1;
    placeAt(g, -0.5, 52.5, 0, 0.2);
    addOccluder(g);
  }
  if (Home.stall) {
    const g = new THREE.Group();
    for (const sx of [-0.9, 0.9]) for (const sz of [-0.6, 0.6])
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 5), mat(0x7a5230), sx, 1.1, sz));
    for (let k = 0; k < 4; k++)
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.08, 1.5), mat(k % 2 ? 0xc93a3a : 0xf3e9dc), -0.85 + k * 0.57, 2.25, 0, false));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.5, 0.9), mat(0x9a6b42), 0, 0.5, 0));
    if (Home.dmg.stall) g.rotation.z = 0.1;
    placeAt(g, -2.5, 59.5, 0, 1.2);
  }
  for (let i = 0; i < Home.lanterns; i++) {
    const spots = [[-2, 54.5], [-4, 59], [-5.5, 53.5]];
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 5), mat(0x4a3320), 0, 1.0, 0));
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffe9a3, emissive: 0xffb35a, emissiveIntensity: 1.6, flatShading: true });
    g.add(mesh(new THREE.OctahedronGeometry(0.24, 0), lampM, 0, 2.15, 0, false));
    const li = new THREE.PointLight(0xffc93d, 6, 9);
    li.position.set(0, 2.3, 0); g.add(li);
    nightLights.push({ l: li, base: 6, home: true });
    placeAt(g, spots[i][0], spots[i][1], 0, 0);
  }
  if (Home.dog) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), mat(0x8a6238), 0, 0.4, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), mat(0x8a6238), 0, 0.9, 0.5));
    placeAt(g, -5.5, 57.5, 0, 0.8);
  }
  // fire pit (always) + trough + board
  {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++)
      g.add(mesh(new THREE.DodecahedronGeometry(0.2, 0), mat(0x8d8d94), Math.cos(i) * 0.8, 0.12, Math.sin(i) * 0.8));
    for (let i = 0; i < 3; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5), mat(0x7a5230), 0, 0.25, 0);
      log.rotation.z = Math.PI / 2; log.rotation.y = (i / 3) * Math.PI; g.add(log);
    }
    const fl = mesh(new THREE.ConeGeometry(0.4, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xff8c2e, emissive: 0xff5a00, emissiveIntensity: 1.4, flatShading: true }), 0, 0.7, 0, false);
    g.add(fl);
    const li = new THREE.PointLight(0xff9a3d, 8, 12);
    li.position.set(0, 1.4, 0); g.add(li);
    nightLights.push({ l: li, base: 8, home: true });
    g.userData.flame = fl;
    tickers.push((t) => { const s = 1 + Math.sin(t * 9) * 0.12; fl.scale.set(s, 1 + Math.sin(t * 11) * 0.18, s); });
    placeAt(g, -3, 58, 0, 0);
    homeFirePos = homeSpot(-3, 58, 1);
  }
  {
    const trough = mesh(new THREE.BoxGeometry(2.0, 0.5, 0.8), mat(0x7a5230), 0, 0, 0);
    placeAt(trough, -4, 57, 0.25, 0.3);
  }
  {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), mat(0x7a5230), 0, 1.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.8, 1.0, 0.12), mat(0xe8c33d), 0, 2.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.7, 0.14), mat(0x2a2000), 0, 2.2, 0.01, false));
    placeAt(g, -1, 58.5, 0, -0.6);
  }
}
function rebuildHomestead() {
  // drop homestead lights registered by the previous build (meshes are rebuilt below)
  for (let i = nightLights.length - 1; i >= 0; i--) if (nightLights[i].home) nightLights.splice(i, 1);
  while (homeGroup.children.length) homeGroup.remove(homeGroup.children[0]);
  for (let i = plotMesh.length; i < 6; i++) plotMesh.push(null);
  buildHouseMesh();
  buildBarnMesh();
  buildFenceMesh();
  buildMiscMeshes();
  for (let i = 0; i < 6; i++) {
    if (Home.plots[i].bought) buildPlotMesh(i, -4.5, 53.5 + i);
    else plotMesh[i] = null;
  }
  renderStats();
}

// --- homestead interactions (registered once; meshes rebuild around them) ---
function beds() { return [1, 2, 3, 4, 6][Home.house] ?? 1; }
function residents() { return 1 + (Life.spouse ? 1 : 0) + Life.kids.length; }
addInteract({ id: 'home-board', pos: homeSpot(-1, 58.5, 1), kind: '🏡 HOMESTEAD', label: () => 'Build & goals (H)', onUse: () => openBuild() });
addInteract({ id: 'home-bed', pos: homeSpot(-2, 56, 1.2), kind: '🛏️ REST', label: () => 'Sleep until dawn', onUse: () => sleepUntilMorning() });
addInteract({ id: 'home-fire', pos: homeSpot(-3, 58, 1), kind: '🔥 COOKPOT', label: () => 'Cook a meal (2 produce)', onUse: () => cookMeal() });
addInteract({ id: 'home-trough', pos: homeSpot(-4, 57, 1), kind: '🥣 TROUGH', label: () => troughLabel(), onUse: () => feedAnimals() });
addInteract({
  id: 'home-well', pos: homeSpot(-1.5, 54, 1), kind: '🪣 WELL',
  label: () => (Home.well ? 'Cool drink (+5⚡)' : 'Dig a well (see board)'),
  onUse: () => {
    if (!Home.well) return openBuild();
    if (Home.dmg.well) return toast('🪣 The well is choked with storm debris — repair it (H).');
    if (meters.energy > 95) return toast('💧 Not thirsty.');
    meters.energy = Math.min(100, meters.energy + 5);
    chime(560); toast('💧 Cool well water. (+5⚡)'); renderStats();
  },
});
for (let pi = 0; pi < 6; pi++) {
  const i = pi;
  addInteract({
    id: 'plot' + i, pos: homeSpot(-4.5, 53.5 + i, 0.9), kind: '🌱 PLOT', radius: 3.0,
    label: () => plotLabel(i), onUse: () => plotCycle(i),
  });
}
addInteract({
  id: 'home-barn', pos: homeSpot(-5, 55, 1.5), kind: '🐄 BARN',
  label: () => (Home.barn ? `Herd: ${animals.length} animals` : 'Raise a barn (see board)'),
  onUse: () => (Home.barn ? toast(`🐄 ${animals.length} animals. Keep the trough full!`) : openBuild()),
});
addInteract({
  id: 'home-stall', pos: homeSpot(-2.5, 59.5, 1.2), kind: '🏪 STALL',
  label: () => (Home.stall ? 'Surplus auto-sells at dawn' : 'Build a stall (see board)'),
  onUse: () => (Home.stall ? toast('🏪 Anything above 8🍎 sells itself overnight (2🍎→1🪙).') : openBuild()),
});
addInteract({
  id: 'home-door', pos: homeSpot(-2, 56, 1.6), kind: '🏠 HOME',
  label: () => (tornadoEnt ? '🌪️ TAKE SHELTER!' : 'Family & upgrades'),
  onUse: () => {
    if (tornadoEnt) {
      if (Home.house < 1) return toast('🌪️ A tent won’t save you — run clear of the funnel!');
      Life.sheltered = true;
      if (Home.house >= 3 && !Home.dmg.house) { toast('🌪️ You hunker down in the cellar. Safe.'); chime(600); }
      else { toast('🌪️ You brace inside. (A cellar would be safer!)'); chime(400); }
      return;
    }
    openBuild();
  },
});
function troughLabel() {
  if (!animals.length) return 'Empty trough — buy animals from Maren';
  const fed = animals.filter((a) => a.fed).length;
  return `Trough — ${fed}/${animals.length} fed`;
}
function feedAnimals() {
  if (playerDead) return;
  if (!animals.length) return toast('🥣 Empty trough — buy hens, sheep or cows from Maren.');
  const need = Math.ceil(animals.length / 2);
  if ((inv.food || 0) < need) return toast(`🥣 Need ${need}🍎 scraps to feed ${animals.length} animals.`);
  inv.food -= need;
  for (const a of animals) { a.fed = true; a.sick = false; }
  burst(homeSpot(-4, 57, 1), 0xe8c96a, 10, 1.4);
  chime(600); toast('🥣 Animals fed! Expect produce at dawn.');
  renderStats();
}
function plotLabel(i) {
  const bought = Home.plots[i].bought;
  if (!bought) return 'Empty soil — buy this plot (H)';
  const p = Home.plots[i];
  if (p.crop && p.growth >= 3) return 'Ripe! Harvest (E)';
  if (p.crop && !p.water) return Home.well ? 'Thirsty — water (E)' : 'Thirsty — haul water (E, 5⚡)';
  if (!p.crop) return 'Sow seeds — 1🍎 (E)';
  return 'Growing… watered ✓';
}
function plotCycle(i) {
  if (playerDead) return;
  if (!Home.plots[i].bought) return openBuild();
  const p = Home.plots[i];
  if (p.crop && p.growth >= 3) {
    if (packSize() + 2 > packCap()) return toast('🎒 Pack full — make room, then harvest!');
    p.crop = false; p.growth = 0; p.water = false;
    addItem('food', 2);
    Life.stats.harvests++;
    burst(plotMesh[i].g.position.clone(), 0x8fd06a, 12, 1.6);
    chime(600); toast('🌾 Harvest! (+2🍎)');
  } else if (p.crop && !p.water) {
    const noWell = !Home.well || Home.dmg.well;
    if (noWell && meters.energy < 5) return toast('😮‍💨 Too tired to haul water from the pond.');
    if (noWell) meters.energy = Math.max(0, meters.energy - 5);
    p.water = true;
    chime(500); toast('💧 Watered.');
  } else if (!p.crop) {
    if ((inv.food || 0) < 1) return toast('🌱 Need 1🍎 as seed to plant.');
    inv.food--; p.crop = true; p.growth = 0; p.water = false;
    chime(520); toast('🌱 Planted! Water it (E).');
  } else toast('💧 Already watered — see you at dawn.');
  updatePlotMesh(i);
  renderStats();
}
function autoWaterCount() {
  let n = 0;
  if (Life.spouse) n += 2;
  for (const k of Life.kids) n += k.stage === 2 ? 2 : (k.stage >= 3 ? 4 : 0);
  for (const w of Life.workers) n += 4;
  return n;
}
function overnightCrops() {
  const winter = seasonNow() === 3;
  const fast = Life.bless?.harvest ? 2 : 1;
  let auto = autoWaterCount();
  for (const p of Home.plots) { if (p.bought && p.crop && !p.water && auto > 0) { p.water = true; auto--; } }
  for (const p of Home.plots) {
    if (!p.bought || !p.crop) continue;
    if (winter && !Life.bless?.flame) { p.water = false; continue; } // dormant
    if (Life.drought && !(Home.well && !Home.dmg.well) && !Life.bless?.oasis) { p.water = false; continue; }
    if (p.water) p.growth = Math.min(3, p.growth + fast);
    p.water = false;
  }
  refreshPlotMeshes();
}
function overnightStall() {
  if (!Home.stall || Home.dmg.stall) return;
  let sold = 0;
  while (inv.food > 8 && sold < 3) { inv.food -= 2; inv.gold++; sold++; Life.stats.goldEarned++; }
}
// chimney smoke (one ticker for the whole homestead)
let smokeT = 0;
tickers.push((t, dt) => {
  if (Home.house < 2 || !Home.chimneyG || isNight()) { smokeT = 0.2; return; }
  smokeT -= dt;
  if (smokeT <= 0) {
    smokeT = 0.5;
    burst(Home.chimneyG.localToWorld(Home.chimneyG.userData.chimney.clone()), 0x9aa0a6, 2, 0.7);
  }
});
// --- build menu ---
let buildOpen = false;
const BUILD_DEFS = [
  { id: 'hut', name: 'Mud Hut', cost: { wood: 4 }, blurb: 'First real roof. Better sleep.', req: () => (Home.house === 0 ? { ok: true } : { ok: false, why: 'Built ✓' }), apply: () => { Home.house = 1; } },
  { id: 'house1', name: 'Farmhouse', cost: { wood: 8, stone: 4 }, blurb: '3 beds, cooking corner. Marriage-ready.', req: () => (Home.house === 1 ? { ok: true } : { ok: false, why: Home.house > 1 ? 'Built ✓' : 'Needs hut first' }), apply: () => { Home.house = 2; } },
  { id: 'house2', name: 'Big Farmhouse + cellar', cost: { wood: 10, stone: 8, gold: 10 }, blurb: '4 beds. Cellar keeps food, shelters tornadoes.', req: () => (Home.house === 2 ? { ok: true } : { ok: false, why: Home.house > 2 ? 'Built ✓' : 'Needs farmhouse first' }), apply: () => { Home.house = 3; } },
  { id: 'house3', name: 'Manor', cost: { wood: 12, stone: 10, gold: 25 }, blurb: '6 beds. The talk of the planet.', req: () => (Home.house === 3 ? { ok: true } : { ok: false, why: Home.house > 3 ? 'Built ✓' : 'Needs big farmhouse first' }), apply: () => { Home.house = 4; } },
  { id: 'well', name: 'Stone Well', cost: { stone: 4 }, blurb: 'Free watering. Drought-proof crops.', req: () => (!Home.well ? { ok: true } : { ok: false, why: 'Dug ✓' }), apply: () => { Home.well = true; } },
  { id: 'barn1', name: 'Barn', cost: { wood: 8, stone: 4 }, blurb: 'Shelter for 4 animals.', req: () => (Home.barn === 0 ? { ok: true } : { ok: false, why: 'Built ✓' }), apply: () => { Home.barn = 1; } },
  { id: 'barn2', name: 'Big Barn', cost: { wood: 10, stone: 6, gold: 10 }, blurb: 'Room for 8 animals.', req: () => (Home.barn === 1 ? { ok: true } : { ok: false, why: Home.barn > 1 ? 'Built ✓' : 'Needs barn first' }), apply: () => { Home.barn = 2; } },
  { id: 'fence1', name: 'Wooden Fences', cost: { wood: 3 }, blurb: 'Wolves sometimes bounce off.', req: () => (Home.fences === 0 ? { ok: true } : { ok: false, why: 'Built ✓' }), apply: () => { Home.fences = 1; } },
  { id: 'fence2', name: 'Tall Fences', cost: { wood: 4, stone: 2 }, blurb: 'Wolves often bounce off.', req: () => (Home.fences === 1 ? { ok: true } : { ok: false, why: Home.fences > 1 ? 'Built ✓' : 'Needs fences first' }), apply: () => { Home.fences = 2; } },
  { id: 'fence3', name: 'Stone Walls', cost: { wood: 5, stone: 4, gold: 5 }, blurb: 'Wolves rarely get through.', req: () => (Home.fences === 2 ? { ok: true } : { ok: false, why: Home.fences > 2 ? 'Built ✓' : 'Needs tall fences first' }), apply: () => { Home.fences = 3; } },
  { id: 'cabin', name: 'Worker Cabin', cost: { wood: 6, stone: 4 }, blurb: 'Bunks for 2 hired hands.', req: () => (!Home.cabin ? { ok: true } : { ok: false, why: 'Built ✓' }), apply: () => { Home.cabin = true; } },
  { id: 'stall', name: 'Market Stall', cost: { wood: 4, gold: 2 }, blurb: 'Surplus 🍎 auto-sells at dawn.', req: () => (!Home.stall ? { ok: true } : { ok: false, why: 'Built ✓' }), apply: () => { Home.stall = true; } },
  { id: 'lantern', name: 'Lantern Post', cost: { wood: 2, stone: 1 }, blurb: `Light that repels wolves (${Home.lanterns}/3).`, req: () => (Home.lanterns < 3 ? { ok: true } : { ok: false, why: 'All lit ✓' }), apply: () => { Home.lanterns++; } },
  { id: 'dog', name: 'Adopt Stray Dog', cost: { food: 8, gold: 2 }, blurb: 'Loyal guardian. Chases wolves.', req: () => (!Home.dog ? { ok: true } : { ok: false, why: 'Adopted ✓' }), apply: () => { Home.dog = true; spawnDog(); } },
  { id: 'tunic', name: 'Sew Tunic', cost: { wool: 3 }, blurb: 'First real clothes. Warmer.', req: () => (Life.clothes === 0 ? { ok: true } : { ok: false, why: 'Owned ✓' }), apply: () => { Life.clothes = 1; } },
  { id: 'parka', name: 'Sew Parka', cost: { wool: 4, gold: 2 }, blurb: 'Cold gain nearly halved.', req: () => (Life.clothes === 1 ? { ok: true } : { ok: false, why: Life.clothes > 1 ? 'Owned ✓' : 'Needs tunic first' }), apply: () => { Life.clothes = 2; } },
  { id: 'festive', name: 'Festive Garb', cost: { wool: 2, gold: 5 }, blurb: 'Wedding-grade. Toastiest.', req: () => (Life.clothes === 2 && Life.spouse ? { ok: true } : { ok: false, why: Life.spouse ? 'Needs parka first' : 'Marry first 💛' }), apply: () => { Life.clothes = 3; } },
  { id: 'ring', name: 'Sunstone Ring', cost: { stone: 2, gold: 5 }, blurb: 'Propose at 4❤️ (farmhouse needed).', req: () => (!Life.ring ? (Home.house >= 2 ? { ok: true } : { ok: false, why: 'Needs farmhouse' }) : { ok: false, why: 'Forged ✓' }), apply: () => { Life.ring = true; } },
  { id: 'child', name: 'Welcome a Child', cost: { food: 5 }, blurb: 'A new mouth — and joy (bed needed).', req: () => childReq(), apply: () => haveChild() },
  { id: 'hire', name: 'Hire Farmhand', cost: { gold: 5 }, blurb: 'Waters + feeds daily (2🍎+1🪙/day).', req: () => hireReq(), apply: () => hireWorker() },
  { id: 'decor', name: 'Decorate Home', cost: { gold: 2, wood: 1 }, blurb: `Cozy corners (+morale, ${Home.decor}/5).`, req: () => (Home.decor < 5 ? { ok: true } : { ok: false, why: 'Lovely ✓' }), apply: () => { Home.decor++; } },
];
for (let pii = 0; pii < 6; pii++) {
  const i = pii;
  BUILD_DEFS.push({
    id: 'plot' + i, name: `Field Plot ${i + 1}`, cost: { wood: 2 }, blurb: 'Till soil for crops.',
    req: () => (!Home.plots[i].bought ? { ok: true } : { ok: false, why: 'Tilled ✓' }),
    apply: () => { Home.plots[i].bought = true; },
  });
}
function buildAfford(b) {
  const r = b.req();
  if (!r.ok) return r;
  for (const [k, need] of Object.entries(b.cost)) {
    if ((inv[k] || 0) < need) return { ok: false, why: `Need ${need - (inv[k] || 0)} more ${ITEM_ICON[k] || k}` };
  }
  return { ok: true };
}
function doBuild(b) {
  if (playerDead || !buildOpen) return;
  const aff = buildAfford(b);
  if (!aff.ok) { toast(`🔨 ${aff.why}.`); return; }
  if (!removeItems(b.cost)) { toast('🔨 Not enough materials.'); return; }
  b.apply();
  rebuildHomestead();
  burst(homeSpot(HOME.lat, HOME.lon, 1.5), 0x9df0a8, 18, 2.4);
  chime(700);
  toast(`🔨 ${b.name} done!`);
  renderBuild();
  saveCheckpoint('build', true);
  renderStats();
}
function openBuild() {
  if (playerDead || buildOpen || npcOpen) return;
  buildOpen = true;
  document.getElementById('build-overlay').classList.remove('hidden');
  renderBuild();
  chime(520);
}
function renderBuild() {
  if (!buildOpen) return;
  const era = hearthEra();
  document.getElementById('build-title').textContent = `Gen ${Life.gen} · ${era.name}`;
  document.getElementById('build-sub').textContent = era.blurb;
  const gb = document.getElementById('build-goals');
  gb.innerHTML = '';
  for (const g of era.goals) {
    const d = document.createElement('div');
    d.className = 'goal-row' + (g.done() ? ' done' : '');
    d.innerHTML = `<span class="goal-era">${g.done() ? '✓' : '○'}</span><span>${g.text()}</span>`;
    gb.appendChild(d);
  }
  const box = document.getElementById('build-list');
  box.innerHTML = '';
  const defs = [...BUILD_DEFS];
  for (const id of Object.keys(Home.dmg)) {
    if (!Home.dmg[id]) continue;
    defs.unshift({
      id: 'repair-' + id, name: `🛠️ Repair ${id}`, cost: { wood: 3, stone: 2 }, blurb: 'Storm damage. Restore function.',
      req: () => ({ ok: true }), apply: () => { Home.dmg[id] = false; },
    });
  }
  for (const b of defs) {
    const aff = buildAfford(b);
    const el = document.createElement('button');
    el.className = 'npc-trade';
    el.disabled = !aff.ok;
    el.innerHTML = `<span class="trade-main"><span class="trade-route">${b.name} — ${fmtItems(b.cost)}</span>` +
      `<span class="trade-blurb"><br>${b.blurb}${aff.ok ? '' : ` — ${aff.why}`}</span></span>`;
    el.onclick = () => doBuild(b);
    box.appendChild(el);
  }
  for (const k of Life.kids) {
    if (k.stage < 3) continue;
    const el = document.createElement('button');
    el.className = 'npc-trade';
    el.innerHTML = `<span class="trade-main"><span class="trade-route">🎒 ${k.name} leaves the nest (+5🪙)</span><span class="trade-blurb"><br>Adult child, with your blessing. +morale.</span></span>`;
    el.onclick = () => releaseKid(k.name);
    box.appendChild(el);
  }
  const retire = hearthRetireReady();
  if (retire.ok) {
    const el = document.createElement('button');
    el.className = 'npc-trade';
    el.innerHTML = `<span class="trade-main"><span class="trade-route">🌅 Retire into your heir</span><span class="trade-blurb"><br>${retire.why}</span></span>`;
    el.onclick = () => retireToHeir();
    box.appendChild(el);
  }
}
function closeBuild() {
  if (!buildOpen) return;
  buildOpen = false;
  document.getElementById('build-overlay').classList.add('hidden');
}
// first light: raise the homestead + a stone path from the farm trail
rebuildHomestead();
steppingStones([[-1, 52], [-2, 54], [-3, 56]], 0xf0d68a, 0.45);

// --- farm animals, guard dog, wolves (sphere-walking entities) ---
const animals = [];
const wolves = [];
let dogEnt = null;
const ANIMAL_INFO = {
  hen: { name: 'Hen', price: 3, produce: 'egg', icon: '🥚' },
  sheep: { name: 'Sheep', price: 5, produce: 'wool', icon: '🐑' },
  cow: { name: 'Cow', price: 8, produce: 'milk', icon: '🥛' },
};
function animalCap() { return 2 + Home.barn * 3; }
function tangentStep(pos, dir, dist) {
  const n = pos.clone().normalize();
  const d = dir.clone().addScaledVector(n, -dir.dot(n));
  if (d.lengthSq() < 1e-6) return null;
  d.normalize();
  const ax = new THREE.Vector3().crossVectors(n, d).normalize();
  pos.applyAxisAngle(ax, dist / R);
  const nn = pos.clone().normalize();
  pos.copy(nn).multiplyScalar(R + heightFor(nn) + 0.1);
  return d;
}
function faceAlong(obj, pos, dir) {
  const n = pos.clone().normalize();
  const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), dir.clone().negate(), n);
  obj.quaternion.setFromRotationMatrix(m);
}
function makeHen() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.28, 7, 6), mat(0xf5f2ea), 0, 0.35, 0));
  const beak = mesh(new THREE.ConeGeometry(0.09, 0.2, 5), mat(0xe8a33d), 0, 0.38, 0.3, false);
  beak.rotation.x = Math.PI / 2; g.add(beak);
  g.add(mesh(new THREE.SphereGeometry(0.09, 5, 4), mat(0xd93a3a), 0, 0.58, 0, false));
  return g;
}
function makeFarmSheep() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(0xf5f2ea), 0, 0.55, 0));
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat(0x3a3330), 0, 0.55, 0.5));
  return g;
}
function makeCow() {
  const g = new THREE.Group();
  const hide = mat(0x8a5a33);
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 1.3), hide, 0, 0.65, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), hide, 0, 1.0, 0.8));
  for (const sx of [-0.28, 0.28])
    g.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 5), mat(0xe8d9a8), sx, 1.3, 0.8, false));
  return g;
}
function registerEntInteract(ent, id, kind, labelFn, onUse) {
  addInteract({ id, pos: ent.mesh.position.clone(), kind, label: labelFn, onUse, radius: 3.4 });
  ent.interact = interactables[interactables.length - 1];
}
function spawnAnimal(kind, silent) {
  if (!ANIMAL_INFO[kind]) return null;
  if (animals.length >= animalCap()) return null;
  const builders = { hen: makeHen, sheep: makeFarmSheep, cow: makeCow };
  const m = builders[kind]();
  const home = homeSpot(-5 + rand(-1, 1), 55 + rand(-1.5, 1.5), 0);
  const n = home.clone().normalize();
  const a = { kind, mesh: m, pos: home.clone(), facing: V3(-n.z, 0, n.x).normalize(), fed: false, sick: false, hp: 20, phase: rand(6), wt: 0, tgt: null };
  m.position.copy(home);
  scene.add(m);
  animals.push(a);
  registerEntInteract(a, 'animal' + animals.length + kind + Date.now() % 1000, '🐄 LIVESTOCK',
    () => `${ANIMAL_INFO[kind].name} ${a.sick ? '🤒 sick — feed!' : (a.fed ? '😋 fed' : '🍽️ hungry')}`,
    () => { meters.morale = Math.min(100, (meters.morale ?? 80) + 3); burst(a.mesh.position.clone(), 0xf7a8c4, 6, 1); chime(760); toast(`💛 The ${kind} nuzzles you. (+morale)`); renderStats(); });
  if (!silent) { burst(home, 0x9df0a8, 12, 1.6); chime(660); renderStats(); }
  return a;
}
function buyAnimal(kind) {
  if (animals.length >= animalCap()) {
    inv.gold += ANIMAL_INFO[kind].price; renderStats();
    return toast('🐄 No room — build/upgrade the barn first! (refunded)');
  }
  spawnAnimal(kind);
  toast(`🐄 A new ${ANIMAL_INFO[kind].name.toLowerCase()} joins the homestead!`);
}
function clearAnimals() {
  for (const a of animals) {
    scene.remove(a.mesh);
    if (a.interact) { const ix = interactables.indexOf(a.interact); if (ix >= 0) interactables.splice(ix, 1); }
  }
  animals.length = 0;
  if (dogEnt) {
    scene.remove(dogEnt.mesh);
    if (dogEnt.interact) { const ix = interactables.indexOf(dogEnt.interact); if (ix >= 0) interactables.splice(ix, 1); }
    dogEnt = null;
  }
}
function overnightAnimals() {
  const winter = seasonNow() === 3;
  for (const a of animals) {
    if (!a.fed) { a.sick = true; continue; }
    a.sick = false;
    if (winter && !Home.barn && !Life.bless?.aurora) continue; // too cold unsheltered
    if (Life.blizzard) continue;
    const got = ANIMAL_INFO[a.kind].produce;
    if (!addItem(got, 1)) toast('🎒 Pack full — morning produce left in the barn.');
    a.fed = false;
  }
}
tickers.push((t, dt) => {
  if (playerDead) return;
  const barnC = homeSpot(-5, 55, 0);
  for (const a of animals) {
    a.wt -= dt;
    if (a.wt <= 0) { a.wt = rand(2, 5); a.tgt = barnC.clone().add(V3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5))); }
    const toT = a.tgt.clone().sub(a.pos);
    if (toT.length() > 0.4) {
      const d = tangentStep(a.pos, toT, dt * 1.1);
      if (d) a.facing.lerp(d, 0.2).normalize();
    }
    const n = a.pos.clone().normalize();
    a.mesh.position.copy(a.pos).addScaledVector(n, Math.abs(Math.sin(t * 5 + a.phase)) * (toT.length() > 0.4 ? 0.12 : 0.03));
    a.facing.addScaledVector(n, -a.facing.dot(n)).normalize();
    faceAlong(a.mesh, a.pos, a.facing);
    a.mesh.rotateZ(Math.sin(t * 5 + a.phase) * 0.05);
    if (a.interact) a.interact.pos.copy(a.mesh.position);
  }
});
// --- guard dog ---
function makeDog() {
  const g = new THREE.Group();
  const fur = mat(0x9a6b42);
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.45, 0.9), fur, 0, 0.4, 0));
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.35, 0.4), fur, 0, 0.62, 0.55));
  for (const sx of [-0.2, 0.2])
    g.add(mesh(new THREE.ConeGeometry(0.08, 0.22, 4), fur, sx, 0.86, 0.5, false));
  const tail = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 5), fur, 0, 0.5, -0.55, false);
  tail.rotation.x = -0.7; g.add(tail);
  g.userData.tail = tail;
  return g;
}
function spawnDog() {
  if (dogEnt) return;
  const m = makeDog();
  const home = homeSpot(-5.5, 57.5, 0);
  const n = home.clone().normalize();
  dogEnt = { mesh: m, pos: home.clone(), facing: V3(-n.z, 0, n.x).normalize(), phase: rand(6), barkCd: 0 };
  m.position.copy(home);
  scene.add(m);
  registerEntInteract(dogEnt, 'dog', '🐕 GUARD DOG',
    () => 'Good dog — pets wolves away',
    () => { meters.morale = Math.min(100, (meters.morale ?? 80) + 3); burst(dogEnt.mesh.position.clone(), 0xf7a8c4, 6, 1); chime(880); toast('🐕 *happy barking* (+morale)'); renderStats(); });
}
tickers.push((t, dt) => {
  const d = dogEnt;
  if (!d || playerDead) return;
  let goal = null, speed = 1.4;
  if (wolves.length) {
    let best = null, bd = 1e9;
    for (const w of wolves) { const dd = d.pos.distanceTo(w.pos); if (dd < bd) { bd = dd; best = w; } }
    if (best && bd < 12) { goal = best.pos.clone().sub(d.pos); speed = 5.5; }
  }
  if (!goal) {
    d.wt = (d.wt ?? 0) - dt;
    if (d.wt <= 0) { d.wt = rand(3, 6); goal = homeSpot(-2 + rand(-2, 2), 56 + rand(-2, 2), 0).sub(d.pos); }
    else goal = (d.tgt ?? d.facing.clone());
    d.tgt = goal.clone();
  }
  const stepped = tangentStep(d.pos, goal, dt * speed);
  if (stepped) d.facing.lerp(stepped, 0.25).normalize();
  const n = d.pos.clone().normalize();
  d.mesh.position.copy(d.pos).addScaledVector(n, Math.abs(Math.sin(t * 8 + d.phase)) * 0.08);
  d.facing.addScaledVector(n, -d.facing.dot(n)).normalize();
  faceAlong(d.mesh, d.pos, d.facing);
  d.mesh.userData.tail.rotation.z = Math.sin(t * 10) * 0.5;
  if (d.interact) d.interact.pos.copy(d.mesh.position);
});
// --- wolves: stalk the herd at night, bounce off fences & lanterns ---
function makeWolf() {
  const g = new THREE.Group();
  const fur = mat(0x5a5a66);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.45, 1.1), fur, 0, 0.45, 0));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.36, 0.45), fur, 0, 0.66, 0.65));
  for (const sx of [-0.2, 0.2])
    g.add(mesh(new THREE.ConeGeometry(0.08, 0.24, 4), fur, sx, 0.92, 0.6, false));
  const eyeM = mat(0xe03131, { emissive: 0x7a1010, emissiveIntensity: 0.8 });
  for (const sx of [-0.12, 0.12])
    g.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeM, sx, 0.7, 0.86, false));
  const tail = mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.6, 5), fur, 0, 0.5, -0.7, false);
  tail.rotation.x = -1.0; g.add(tail);
  return g;
}
function lanternWard(pos) {
  const spots = [[-2, 54.5], [-4, 59], [-5.5, 53.5]];
  const r = 6 + (Life.bless?.light ? 2 : 0);
  for (let i = 0; i < Home.lanterns; i++) {
    if (pos.distanceTo(homeSpot(spots[i][0], spots[i][1], 1)) < r) return true;
  }
  return false;
}
function spawnWolves(n) {
  const c = homeSpot(HOME.lat, HOME.lon, 0);
  const up = c.clone().normalize();
  const u = V3(-up.z, 0, up.x).normalize(), v = new THREE.Vector3().crossVectors(up, u).normalize();
  for (let k = 0; k < n; k++) {
    const a = rand(Math.PI * 2);
    const p = c.clone().addScaledVector(u, Math.cos(a) * rand(10, 13)).addScaledVector(v, Math.sin(a) * rand(10, 13)).normalize();
    const m = makeWolf();
    const pos = p.clone().multiplyScalar(R + heightFor(p) + 0.1);
    const w = { mesh: m, pos, facing: u.clone(), hp: 30, atkCd: 0, phase: rand(6), state: 'stalk' };
    m.position.copy(pos);
    scene.add(m);
    wolves.push(w);
    registerEntInteract(w, 'wolf' + Date.now() % 100000 + k, '🐺 WOLF',
      () => `Wolf ❤ ${Math.max(0, Math.ceil(w.hp))} — strike! (E)`,
      () => attackWolf(w));
  }
  toast('🐺 Wolves stalk your herd! (axe, lanterns, dog, fences)');
  chime(140);
}
function nearestAnimal(pos) {
  let best = null, bd = 1e9;
  for (const a of animals) { const d = pos.distanceTo(a.mesh.position); if (d < bd) { bd = d; best = a; } }
  return best ? { a: best, d: bd } : null;
}
function attackWolf(w) {
  if (!w || playerDead || w.hp <= 0) return;
  if (player.position.distanceTo(w.mesh.position) > 4.6) return toast('⚠️ Too far — step closer to strike.');
  if (playerAttackCd > 0) return;
  playerAttackCd = 0.55;
  startChop();
  setTimeout(() => {
    if (w.hp <= 0 || playerDead) return;
    if (player.position.distanceTo(w.mesh.position) > 5.2) return;
    const dmg = Math.round((12 + Math.random() * 8) * (tools.axe || 1));
    w.hp -= dmg;
    burst(w.mesh.position.clone(), 0xffd97a, 12, 2);
    chime(300);
    toast(`🪓 You strike the wolf for ${dmg}!`);
    if (w.hp <= 0) killWolf(w);
    renderStats();
  }, 220);
}
function killWolf(w) {
  const ix = wolves.indexOf(w);
  if (ix >= 0) wolves.splice(ix, 1);
  scene.remove(w.mesh);
  if (w.interact) { const jx = interactables.indexOf(w.interact); if (jx >= 0) interactables.splice(jx, 1); }
  burst(w.mesh.position.clone(), 0xffffff, 20, 2.5);
  addItem('food', 2);
  meters.morale = Math.min(100, (meters.morale ?? 80) + 5);
  Life.grief = Math.max(0, (Life.grief || 0) - 0.3);
  chime(240);
  toast('🐺 Wolf driven off! (+2🍎 meat)');
  saveCheckpoint('wolf', true);
  renderStats();
}
function killAnimal(a, byWolf) {
  const ix = animals.indexOf(a);
  if (ix >= 0) animals.splice(ix, 1);
  scene.remove(a.mesh);
  if (a.interact) { const jx = interactables.indexOf(a.interact); if (jx >= 0) interactables.splice(jx, 1); }
  burst(a.mesh.position.clone(), 0xe03131, 16, 2);
  Life.grief = Math.min(1.5, (Life.grief || 0) + 0.8);
  meters.morale = Math.max(0, (meters.morale ?? 80) - 12);
  chime(150);
  toast(byWolf ? `🐺 A ${a.kind} was taken by wolves!` : `☠️ Lost a ${a.kind}.`);
  renderStats();
}
function updateWolves(t, dt) {
  if (!wolves.length || playerDead) return;
  const homeC = homeSpot(HOME.lat, HOME.lon, 0);
  for (let i = wolves.length - 1; i >= 0; i--) {
    const w = wolves[i];
    if (w.atkCd > 0) w.atkCd -= dt;
    if (!isNight()) { // dawn courage fails — bolt for the treeline
      const away = w.pos.clone().sub(homeC);
      tangentStep(w.pos, away, dt * 5);
      w.facing.lerp(away.normalize(), 0.2);
      if (w.pos.distanceTo(homeC) > 16) {
        scene.remove(w.mesh);
        if (w.interact) { const jx = interactables.indexOf(w.interact); if (jx >= 0) interactables.splice(jx, 1); }
        wolves.splice(i, 1);
        continue;
      }
    } else {
      // dog pursuit turns the tables
      let flee = null;
      if (dogEnt && w.pos.distanceTo(dogEnt.pos) < 6) flee = w.pos.clone().sub(dogEnt.pos);
      else if (lanternWard(w.pos)) flee = w.pos.clone().sub(homeC); // skirt the light
      let goalDir = null, speed = 3.5;
      if (flee && flee.lengthSq() > 1e-6) { goalDir = flee; speed = 5; }
      else {
        const found = nearestAnimal(w.pos);
        const pd = w.pos.distanceTo(player.position);
        if (found && found.d < pd) {
          goalDir = found.a.mesh.position.clone().sub(w.pos); speed = found.d < 6 ? 5 : 3.5;
          w.prey = found.a;
        } else if (pd < 9) {
          goalDir = player.position.clone().sub(w.pos); speed = pd < 6 ? 5 : 3.5;
          w.prey = null; w.huntsPlayer = true;
        } else if (found) { goalDir = found.a.mesh.position.clone().sub(w.pos); w.prey = found.a; }
      }
      if (goalDir) {
        const stepped = tangentStep(w.pos, goalDir, dt * speed);
        if (stepped) w.facing.lerp(stepped, 0.2).normalize();
      }
      // strike
      if (w.atkCd <= 0) {
        if (w.prey && animals.includes(w.prey) && w.pos.distanceTo(w.prey.mesh.position) < 1.8) {
          w.atkCd = 1.4;
          if (Math.random() < 0.22 * Home.fences) {
            burst(w.prey.mesh.position.clone(), 0x9df0a8, 10, 1.5);
            chime(500); toast('🛡️ The fence holds! The wolf slinks back.');
            const away = w.pos.clone().sub(homeC);
            tangentStep(w.pos, away, 3);
          } else {
            w.prey.hp -= 8;
            burst(w.prey.mesh.position.clone(), 0xe03131, 10, 1.8);
            chime(150);
            if (w.prey.hp <= 0) killAnimal(w.prey, true);
          }
        } else if (w.huntsPlayer && w.pos.distanceTo(player.position) < 2.2) {
          w.atkCd = 1.4;
          damagePlayer(Math.round(6 + Math.random() * 5), w.mesh.position);
          toast('🐺 The wolf snaps at you! Fight back (E)!');
        }
      }
    }
    const n = w.pos.clone().normalize();
    w.mesh.position.copy(w.pos).addScaledVector(n, Math.abs(Math.sin(t * 7 + w.phase)) * 0.1);
    w.facing.addScaledVector(n, -w.facing.dot(n)).normalize();
    faceAlong(w.mesh, w.pos, w.facing);
    if (w.interact) w.interact.pos.copy(w.mesh.position);
  }
}
tickers.push((t, dt) => updateWolves(t, dt));
tickers.push(() => { // forecast packs slink in after dark, never in daylight
  if (Life.wolfRaid > 0 && isNight() && !wolves.length && !playerDead && !sleeping) {
    spawnWolves(Life.wolfRaid);
    Life.wolfRaid = 0;
  }
});
// Maren sells livestock (cap enforced, refund on overflow)
{
  const maren = NPCS.find((n) => n.id === 'maren');
  if (maren) maren.trades.push(
    { id: 'buy-hen', give: { gold: 3 }, get: {}, resultText: '🐔 a hen', blurb: 'Lays 🥚 at dawn (if fed)', effect: () => buyAnimal('hen') },
    { id: 'buy-sheep', give: { gold: 5 }, get: {}, resultText: '🐑 a sheep', blurb: 'Gives wool at dawn (if fed)', effect: () => buyAnimal('sheep') },
    { id: 'buy-cow', give: { gold: 8 }, get: {}, resultText: '🐄 a cow', blurb: 'Gives 🥛 at dawn (if fed)', effect: () => buyAnimal('cow') },
  );
}

// --- courtship, marriage, kids ---
function renderCourtRow(n, box) {
  if (!n.court) return;
  if (Life.spouse === n.id) {
    const d = document.createElement('div');
    d.className = 'goal-row done';
    d.innerHTML = `<span class="goal-era">💛</span><span>Your spouse — tending plots & cooking at home.</span>`;
    box.appendChild(d);
    return;
  }
  if (Life.spouse) return; // already wed to another
  const hearts = n.hearts || 0;
  const d = document.createElement('div');
  d.className = 'goal-row';
  d.innerHTML = `<span class="goal-era">${'❤️'.repeat(hearts)}${'🤍'.repeat(4 - hearts)}</span><span>${hearts >= 4 ? (Life.ring ? 'They adore you — propose!' : 'They adore you! Bring a sunstone ring (H).') : 'Give gifts (1🍎/day) to win their heart.'}</span>`;
  box.appendChild(d);
  const gifted = (Life.lastGift[n.id] ?? -1) === Life.day;
  const gb = document.createElement('button');
  gb.className = 'npc-trade';
  gb.disabled = gifted || (inv.food || 0) < 1;
  gb.innerHTML = `<span class="trade-main"><span class="trade-route">🎁 Give gift — 1 🍎</span><span class="trade-blurb"><br>${gifted ? 'Already gave one today' : '+1❤️ (once a day)'}</span></span>`;
  gb.onclick = () => giveGift(n);
  box.appendChild(gb);
  if (hearts >= 4 && Life.ring) {
    const pb = document.createElement('button');
    pb.className = 'npc-trade';
    pb.innerHTML = `<span class="trade-main"><span class="trade-route">💍 Propose marriage!</span><span class="trade-blurb"><br>They move into the farmhouse.</span></span>`;
    pb.onclick = () => proposeTo(n);
    box.appendChild(pb);
  }
}
function giveGift(n) {
  if (Life.spouse || playerDead) return;
  if ((Life.lastGift[n.id] ?? -1) === Life.day) return toast('🎁 Already gave a gift today. Come back tomorrow.');
  if ((inv.food || 0) < 1) return toast('🎁 Bring 1🍎 as a gift.');
  inv.food--;
  Life.lastGift[n.id] = Life.day;
  n.hearts = Math.min(4, (n.hearts || 0) + 1);
  n.lineIdx = (n.lineIdx + 1) % n.lines.length;
  burst(n.mesh.position.clone(), 0xf7a8c4, 12, 1.6);
  chime(700);
  toast(n.hearts >= 4 ? `❤️❤️❤️❤️ ${n.name} adores you! Bring a sunstone ring (H) to propose.` : `💗 ${n.name} loved it! (${n.hearts}/4❤️)`);
  renderTradePanel(); renderStats();
  saveCheckpoint('gift', true);
}
function proposeTo(n) {
  if (Life.spouse || (n.hearts || 0) < 4 || !Life.ring || playerDead) return;
  Life.ring = false;
  Life.spouse = n.id;
  meters.morale = 100;
  Life.chronicle.push(`Day ${Life.day}: Married ${n.name} 💛`);
  settleSpouse(false);
  burst(n.mesh.position.clone(), 0xf7a8c4, 30, 3);
  chime(660); setTimeout(() => chime(760), 200); setTimeout(() => chime(880), 400);
  toast(`💛 ${n.name} said yes! Married! They tend plots & cook.`);
  closeTrade(); renderStats();
  saveCheckpoint('marry', true);
}
function settleSpouse() {
  if (!Life.spouse) return;
  const n = NPCS.find((x) => x.id === Life.spouse);
  if (!n) return;
  n.pos = homeSpot(0, 57, 0);
  n.it = n.it || interactables.find((i) => i.id === 'npc-' + n.id);
}
tickers.push(() => { // spouse interact follows them home
  if (!Life.spouse) return;
  const n = NPCS.find((x) => x.id === Life.spouse);
  if (n && n.it) n.it.pos.copy(n.mesh.position);
});
function overnightFamily() {
  if (!Life.spouse) return;
  // spouse cooks a meal from the cheapest raw produce
  const took = [];
  for (const k of ['egg', 'milk', 'food']) { while (took.length < 2 && inv[k] > 0) { inv[k]--; took.push(k); } }
  if (took.length === 2) { inv.meal = (inv.meal || 0) + 1; }
  else for (const k of took) inv[k]++;
}
const KID_NAMES = ['Rowan', 'Wren', 'Ash', 'Birch', 'Clover', 'Reed'];
let kidMeshes = [];
function childReq() {
  if (!Life.spouse) return { ok: false, why: 'Marry first 💛' };
  if (Home.house < 2) return { ok: false, why: 'Needs farmhouse' };
  if (Life.kids.length >= 2) return { ok: false, why: 'Full house ✓' };
  if (residents() >= beds()) return { ok: false, why: 'No spare bed' };
  return { ok: true };
}
function haveChild() {
  const name = KID_NAMES[Life.kidSeq % KID_NAMES.length]; Life.kidSeq++;
  Life.kids.push({ name, age: 0, stage: 0 });
  Life.chronicle.push(`Day ${Life.day}: ${name} was born! 🍼`);
  spawnKidsMeshes();
  meters.morale = Math.min(100, (meters.morale ?? 80) + 15);
  burst(homeSpot(HOUSE_SPOT.lat, HOUSE_SPOT.lon, 2), 0xf7a8c4, 24, 2.5);
  chime(880);
  toast(`🍼 ${name} was born! (+morale, +upkeep)`);
}
function ageKids() {
  for (const k of Life.kids) {
    const old = k.stage;
    k.age++;
    k.stage = k.age >= 12 ? 3 : (k.age >= 8 ? 2 : (k.age >= 4 ? 1 : 0));
    if (k.stage !== old) {
      burst(homeSpot(HOUSE_SPOT.lat, HOUSE_SPOT.lon, 2), 0xffd97a, 18, 2);
      chime(700);
      toast(`🎂 ${k.name} is now a ${kidStageName(k.stage)}!` + (k.stage === 3 ? ' They work the farm FREE.' : (k.stage === 2 ? ' They help water crops.' : '')));
      meters.morale = Math.min(100, (meters.morale ?? 80) + 10);
    }
  }
  spawnKidsMeshes();
}
function releaseKid(name) {
  const ix = Life.kids.findIndex((k) => k.name === name);
  if (ix < 0) return;
  Life.kids.splice(ix, 1);
  inv.gold += 5; Life.stats.goldEarned += 5;
  meters.morale = Math.min(100, (meters.morale ?? 80) + 20);
  Life.chronicle.push(`Day ${Life.day}: ${name} left to see the world 🎒 (+5🪙 farewell gifts)`);
  spawnKidsMeshes();
  toast(`🎒 ${name} heads off with your blessing! (+5🪙, +morale)`);
  chime(760);
  renderBuild(); renderStats();
  saveCheckpoint('family', true);
}
function spawnKidsMeshes() {
  for (const m of kidMeshes) scene.remove(m.mesh);
  kidMeshes = [];
  const coats = [0xe8a33d, 0x7a4fc9, 0x2e8b8b];
  Life.kids.forEach((k, i) => {
    const m = makeVillager({ coat: coats[i % 3], hat: 'cap', hatColor: 0xf3e9dc });
    m.scale.setScalar(0.55 + k.stage * 0.15);
    const home = homeSpot(0.5 + i * 1.4, 57.8, 0);
    m.position.copy(home);
    scene.add(m);
    const n = home.clone().normalize();
    kidMeshes.push({ mesh: m, pos: home.clone(), facing: V3(-n.z, 0, n.x).normalize(), phase: rand(6), wt: 0, tgt: null, scale: 0.55 + k.stage * 0.15 });
  });
}
tickers.push((t, dt) => {
  if (playerDead) return;
  const homeC = homeSpot(0, 57.5, 0);
  for (const k of kidMeshes) {
    k.wt -= dt;
    if (k.wt <= 0) { k.wt = rand(2.5, 6); k.tgt = homeC.clone().add(V3(rand(-2, 2), 0, rand(-2, 2))); }
    const toT = k.tgt.clone().sub(k.pos);
    if (toT.length() > 0.4) {
      const d = tangentStep(k.pos, toT, dt * 0.9);
      if (d) k.facing.lerp(d, 0.2).normalize();
    }
    const n = k.pos.clone().normalize();
    k.mesh.position.copy(k.pos).addScaledVector(n, Math.abs(Math.sin(t * 6 + k.phase)) * 0.06);
    k.facing.addScaledVector(n, -k.facing.dot(n)).normalize();
    faceAlong(k.mesh, k.pos, k.facing);
  }
});

// --- hired hands, spoilage, disasters, festivals' teeth ---
const HAND_NAMES = ['Bram', 'Tilda', 'Fen', 'Moss'];
function hireReq() {
  if (Home.house < 2) return { ok: false, why: 'Needs farmhouse first' };
  if (!Home.cabin) return { ok: false, why: 'Needs worker cabin' };
  if (Life.workers.length >= 2) return { ok: false, why: 'Cabin full ✓' };
  return { ok: true };
}
function hireWorker() {
  const name = HAND_NAMES.find((n) => !Life.workers.some((w) => w.name === n)) || ('Hand' + (Life.workers.length + 1));
  Life.workers.push({ name });
  Life.chronicle.push(`Day ${Life.day}: Hired ${name} 🤝`);
  spawnWorkers();
  toast(`🤝 ${name} joins the farm! (2🍎+1🪙/day at dawn)`);
}
let workerMeshes = [];
function spawnWorkers() {
  for (const m of workerMeshes) scene.remove(m.mesh);
  workerMeshes = [];
  Life.workers.forEach((w, i) => {
    const coats = [0x6b4a2f, 0x4a5d5a];
    const m = makeVillager({ coat: coats[i % 2], hat: 'cap', hatColor: 0x8d8d94 });
    const home = homeSpot(-0.5 + i * 1.6, 51.5, 0);
    m.position.copy(home);
    scene.add(m);
    const n = home.clone().normalize();
    workerMeshes.push({ mesh: m, pos: home.clone(), facing: V3(-n.z, 0, n.x).normalize(), phase: rand(6), wt: 0, tgt: null });
  });
}
tickers.push((t, dt) => { // hands amble between cabin, plots and barn
  if (playerDead) return;
  const stops = [homeSpot(-0.5, 52.5, 0), homeSpot(-4.5, 56, 0), homeSpot(-5, 55, 0), homeSpot(-1, 58.5, 0)];
  for (const k of workerMeshes) {
    k.wt -= dt;
    if (k.wt <= 0) { k.wt = rand(3, 7); k.tgt = stops[(Math.random() * stops.length) | 0].clone(); }
    const toT = k.tgt.clone().sub(k.pos);
    if (toT.length() > 0.5) {
      const d = tangentStep(k.pos, toT, dt * 1.2);
      if (d) k.facing.lerp(d, 0.2).normalize();
    }
    const n = k.pos.clone().normalize();
    k.mesh.position.copy(k.pos).addScaledVector(n, Math.abs(Math.sin(t * 6 + k.phase)) * 0.06);
    k.facing.addScaledVector(n, -k.facing.dot(n)).normalize();
    faceAlong(k.mesh, k.pos, k.facing);
  }
});
function overnightWorkers() {
  for (let i = Life.workers.length - 1; i >= 0; i--) {
    const w = Life.workers[i];
    if ((inv.food || 0) >= 2 && (inv.gold || 0) >= 1) { inv.food -= 2; inv.gold -= 1; }
    else {
      Life.workers.splice(i, 1);
      Life.chronicle.push(`Day ${Life.day}: ${w.name} quit — unpaid! 😠`);
      toast(`😠 ${w.name} quit — unpaid wages! (needs 2🍎+1🪙/day)`);
      meters.morale = Math.max(0, (meters.morale ?? 80) - 10);
    }
  }
  spawnWorkers();
}
const ROT_DAYS = { food: 4, egg: 3, milk: 2, meal: 8 };
function overnightSpoilage() {
  const cellar = Home.house >= 3 && !Home.dmg.house;
  for (const k of ['food', 'egg', 'milk', 'meal']) {
    if ((inv[k] || 0) <= 0) { Life.rot[k] = 0; continue; }
    Life.rot[k] = (Life.rot[k] || 0) + (cellar ? 0.5 : 1);
    if (Life.rot[k] >= ROT_DAYS[k]) { Life.rot[k] = 0; inv[k]--; toast(`🤢 A ${ITEM_ICON[k]} spoiled!${cellar ? '' : ' (cellar slows rot)'}`); }
  }
}
// --- disasters: forecast a day ahead, survive by preparing ---
const DISASTER_ICON = { drought: '☀️', flood: '🌊', tornado: '🌪️', blizzard: '❄️', wolves: '🐺' };
function rollForecast() {
  const s = seasonNow();
  let pool = [];
  if (s === 0) pool = [['flood', 0.25]];
  else if (s === 1) pool = [['drought', 0.30]];
  else if (s === 2) pool = [['tornado', 0.20], ['wolves', 0.20]];
  else pool = [['blizzard', 0.35], ['wolves', 0.25]];
  const diff = 1 + (Life.gen - 1) * 0.15;
  for (const [id, ch] of pool) {
    const ward = (id === 'wolves' && Life.bless?.light) ? 0.5 : 1;
    if (Math.random() < ch * diff * ward) { Life.forecast = id; return; }
  }
  Life.forecast = null;
}
function triggerDisaster(id) {
  Life.stats.disasters++;
  Life.grief = Math.min(1.5, (Life.grief || 0) + 0.8);
  meters.morale = Math.max(0, (meters.morale ?? 80) - 10);
  if (id === 'drought') {
    Life.drought = true;
    toast('☀️ DROUGHT! Crops stall — the well keeps them growing. Water everything!');
    chime(180);
  } else if (id === 'flood') {
    const growing = Home.plots.filter((p) => p.bought && p.crop);
    if (growing.length && Home.fences < 2) {
      const p = growing[(Math.random() * growing.length) | 0];
      p.crop = false; p.growth = 0; p.water = false;
      toast('🌊 Flood drowned a crop! (fences ≥2 sandbag the fields)');
    } else toast('🌊 Flood waters rose — the fenced fields held!');
    refreshPlotMeshes();
    chime(180);
  } else if (id === 'tornado') {
    startTornado();
  } else if (id === 'blizzard') {
    Life.blizzard = true;
    toast('❄️ BLIZZARD all day! Cold everywhere. Stay by the fire, keep stock!');
    chime(140);
  } else if (id === 'wolves') {
    Life.wolfRaid = 1 + Math.min(2, (Life.gen - 1) + (Math.random() < 0.5 ? 1 : 0));
    toast('🐺 Howls on the wind… a pack will stalk the herd TONIGHT. Light lanterns, pen the animals!');
    chime(140);
  }
  renderStats();
}
// live tornado: a funnel crosses the homestead; shelter in a cellar or risk it
let tornadoEnt = null;
function startTornado() {
  if (tornadoEnt) return;
  Life.stats.tornadoSeen = true;
  const g = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const cone = mesh(new THREE.ConeGeometry(3.2, 13, 9, 1, true), fm, 0, 6.5, 0, false);
  cone.rotation.x = Math.PI; // wide top, narrow foot
  g.add(cone);
  scene.add(g);
  const c = homeSpot(HOME.lat, HOME.lon, 0);
  const up = c.clone().normalize();
  const u = V3(-up.z, 0, up.x).normalize();
  const dirA = u.clone().applyAxisAngle(up, rand(Math.PI * 2));
  tornadoEnt = { mesh: g, cone, t: 0, dur: 26, from: c.clone().addScaledVector(dirA, 15), to: c.clone().addScaledVector(dirA, -15) };
  toast('🌪️ TORNADO! Shelter: E at home (cellar needs Big Farmhouse) or risk it!');
  chime(120);
}
tickers.push((t, dt) => {
  const tw = tornadoEnt;
  if (!tw) return;
  tw.t += dt;
  const k = Math.min(1, tw.t / tw.dur);
  const p = tw.from.clone().lerp(tw.to, k);
  const n = p.clone().normalize();
  tw.mesh.position.copy(n).multiplyScalar(R + heightFor(n));
  tw.cone.rotation.y += dt * 9;
  if (Math.random() < dt * 6) burst(tw.mesh.position.clone(), 0x8a7a6a, 6, 3);
  if (k >= 1) {
    scene.remove(tw.mesh);
    tornadoEnt = null;
    // damage roll: 40% per building (scan blessing wards: 20%)
    const chance = Life.bless?.scan ? 0.2 : 0.4;
    const hit = [];
    for (const id of ['house', 'barn', 'cabin', 'stall', 'well']) {
      if ((id === 'house' && !Home.house) || (id === 'barn' && !Home.barn) || (id === 'cabin' && !Home.cabin) || (id === 'stall' && !Home.stall) || (id === 'well' && !Home.well)) continue;
      if (Math.random() < chance) { Home.dmg[id] = true; hit.push(id); }
    }
    rebuildHomestead();
    if (!Life.sheltered) {
      const nearHome = player.position.distanceTo(homeSpot(HOME.lat, HOME.lon, 1)) < 12;
      if (nearHome && Math.random() < 0.5) { damagePlayer(20, tw.mesh.position); toast('🌪️ The tornado threw you! (shelter in a cellar next time)'); }
      else if (nearHome) toast('🌪️ That was close! Shelter in a cellar (Big Farmhouse) next time.');
    } else toast('🌪️ You ride it out in the cellar. Safe.');
    Life.sheltered = false;
    if (hit.length) toast(`🌪️ Storm damage: ${hit.join(', ')} — repair at the board (H).`);
    else toast('🌪️ The homestead held! Barely a shingle lost.');
    saveCheckpoint('storm', true);
    renderStats();
  }
});

// --- eras, retirement into heirs, wonder blessings ---
const BLESS_TEXT = {
  flame: 'Eternal Hearth — winter crops grow, cold bites 20% less.',
  harvest: 'Bountiful Soil — crops grow twice as fast.',
  oasis: 'Deep Springs — drought can’t stop your crops.',
  bell: 'Merry Bell — the homestead is cheerful (+morale).',
  light: 'Bright Beacon — lanterns ward further, fewer wolves.',
  scan: 'Storm-Warded — tornado damage halved.',
  aurora: 'Sky Blessing — +1🍎 each dawn, herd thrives in winter.',
};
function hearthEra() {
  const s = Life.stats;
  if (Home.house < 1 || Life.nights < 3 || s.maxFood < 10 || Life.clothes < 1)
    return {
      name: 'Era 1 · Survive', blurb: 'Roof, supper, clothes. The planet provides — take it.',
      goals: [
        { text: () => `Sleep ${Math.min(3, Life.nights)}/3 nights`, done: () => Life.nights >= 3 },
        { text: () => `Stockpile ${Math.min(10, s.maxFood)}/10 food at once`, done: () => s.maxFood >= 10 },
        { text: () => 'Build a Mud Hut (below)', done: () => Home.house >= 1 },
        { text: () => 'Sew a Tunic (below, 3🐑)', done: () => Life.clothes >= 1 },
      ],
    };
  if (Home.house < 2 || !Home.well || s.harvests < 1 || s.meals < 5)
    return {
      name: 'Era 2 · Settle', blurb: 'Roots and rows. A farm is a promise you water daily.',
      goals: [
        { text: () => 'Raise a Farmhouse (below)', done: () => Home.house >= 2 },
        { text: () => 'Dig the Stone Well (below)', done: () => Home.well },
        { text: () => `Harvest crops ${Math.min(1, s.harvests)}/1`, done: () => s.harvests >= 1 },
        { text: () => `Cook & eat ${Math.min(5, s.meals)}/5 hearty meals`, done: () => s.meals >= 5 },
      ],
    };
  if (!Life.spouse || Home.barn < 1 || !Life.workers.length || s.goldEarned < 50)
    return {
      name: 'Era 3 · Prosper', blurb: 'More hands, more mouths, more gold. Grow or stagnate.',
      goals: [
        { text: () => 'Marry (4❤️ + sunstone ring)', done: () => !!Life.spouse },
        { text: () => 'Raise a Barn (below)', done: () => Home.barn >= 1 },
        { text: () => 'Hire a farmhand (below)', done: () => Life.workers.length >= 1 },
        { text: () => `Earn ${Math.min(50, s.goldEarned)}/50🪙 total`, done: () => s.goldEarned >= 50 },
      ],
    };
  return {
    name: 'Era 4 · Legacy', blurb: 'Build something that outlives you — then hand it over.',
    goals: [
      { text: () => 'Big Farmhouse + cellar (below)', done: () => Home.house >= 3 },
      { text: () => 'Raise a child to teen', done: () => Life.kids.some((k) => k.stage >= 2) },
      { text: () => 'Survive a tornado', done: () => !!s.tornadoSeen },
      { text: () => `Earn ${Math.min(100, s.goldEarned)}/100🪙 total`, done: () => s.goldEarned >= 100 },
    ],
  };
}
function hearthRetireReady() {
  if (Home.house < 3) return { ok: false };
  if (!Life.kids.some((k) => k.stage >= 2)) return { ok: false };
  if (!Life.stats.tornadoSeen) return { ok: false };
  if (Life.stats.goldEarned < 100) return { ok: false };
  return { ok: true, why: `Gen ${Life.gen} complete: big house, grown heir, storm weathered, 100🪙 earned. Begin anew — harder seasons, kept homestead.` };
}
function retireToHeir() {
  const r = hearthRetireReady();
  if (!r.ok || playerDead) return;
  Life.gen++;
  Life.chronicle.push(`Gen ${Life.gen - 1} retired in comfort 🌅 (${Life.stats.goldEarned}🪙 earned, Day ${Life.day})`);
  inv.wood = 0; inv.stone = 0; inv.gold = 2; inv.food = 4; inv.wool = 0; inv.remedy = 1;
  inv.egg = 0; inv.milk = 0; inv.meal = 1;
  meters.energy = 100; meters.health = 100; meters.cold = 0; meters.hunger = 90; meters.warmth = 100; meters.morale = 90;
  Home.dmg = {};
  for (let i = wolves.length - 1; i >= 0; i--) {
    scene.remove(wolves[i].mesh);
    if (wolves[i].interact) { const jx = interactables.indexOf(wolves[i].interact); if (jx >= 0) interactables.splice(jx, 1); }
  }
  wolves.length = 0;
  rebuildHomestead();
  burst(player.position.clone(), 0xffd97a, 30, 3);
  chime(880);
  toast(`🌅 Generation ${Life.gen} takes the axe! Harder seasons ahead. The saga continues.`);
  closeBuild(); renderStats();
  saveCheckpoint('heir', true);
}
tickers.push(() => { // completed wonders become homestead blessings (once each)
  Life.bless = Life.bless || {};
  const map = { flame: 'flame', harvest: 'harvest', oasis: 'oasis', bell: 'bell', light: 'light', scan: 'scan', aurora: 'aurora' };
  for (const wid of Object.keys(map)) {
    const key = map[wid];
    if (!Life.bless[key] && byId(wid)?.done) {
      Life.bless[key] = true;
      toast(`🏡 Homestead blessing — ${BLESS_TEXT[key]}`);
      chime(880);
      saveCheckpoint('wonder', true);
    }
  }
});

// ==================== GRAPHICS 3x pass ====================
// --- denser ground detail: tall grass + meadow flowers ---
scatterInstanced(new THREE.ConeGeometry(0.05, 0.9, 4), mat(0xffffff, { roughness: 1 }), 600,
  ['farm', 'forest', 'cove'], 0.8, 1.8, [0x5cc46a, 0x7ddf6a, 0x3fae4e, 0x9df0a8], { lift: 0.3 });
scatterInstanced(new THREE.IcosahedronGeometry(0.09, 0), mat(0xffffff, { roughness: 0.6 }), 220,
  ['farm', 'forest', 'cove', 'oasis'], 0.8, 1.4, [0xff6b9d, 0xffd23d, 0xffffff, 0xff8c5a, 0xc49df0], { lift: 0.42 });
// --- sun + moon glow sprites that track the sky ---
function glowTexture(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.35, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,200,1)', 'rgba(255,180,80,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sunSpr.scale.setScalar(26); scene.add(sunSpr);
const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(220,235,255,1)', 'rgba(150,180,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
moonSpr.scale.setScalar(13); scene.add(moonSpr);
// --- drifting clouds ---
const clouds = [];
{
  const cm = mat(0xffffff, { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const puffs = 3 + ((Math.random() * 2) | 0);
    for (let k = 0; k < puffs; k++)
      c.add(mesh(new THREE.IcosahedronGeometry(rand(1.2, 2.2), 1), cm, k * rand(1.4, 2.0), rand(-0.3, 0.5), rand(-0.8, 0.8), false));
    const a = rand(Math.PI * 2), rr = R + rand(13, 19);
    c.position.set(Math.cos(a) * rr, rand(6, 26), Math.sin(a) * rr);
    c.userData = { a, rr, sp: rand(0.008, 0.02), y: c.position.y };
    scene.add(c); clouds.push(c);
  }
}
// --- butterflies by day ---
const butterflies = [];
{
  const wingCols = [0xff8fb3, 0xffd23d, 0x9df0a8, 0x7ad9ff];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const wm = mat(wingCols[i % 4], { side: THREE.DoubleSide });
    const wl = mesh(new THREE.PlaneGeometry(0.28, 0.22), wm, -0.14, 0, 0, false);
    const wr = mesh(new THREE.PlaneGeometry(0.28, 0.22), wm, 0.14, 0, 0, false);
    g.add(wl, wr); scene.add(g);
    const home = [ [8, 48], [14, 160], [4, 44], [12, 282] ][i % 4];
    butterflies.push({ g, wl, wr, lat: home[0], lon: home[1], ph: rand(6), r: rand(1.5, 3) });
  }
}
// --- fireflies by night (single Points cloud around home + forest) ---
let fireflyPts = null; const fireflyBase = [];
{
  const spots = [homeSpot(HOME.lat, HOME.lon, 1.5), anchor(14, 158, 1.5), anchor(8, 52, 1.5)];
  const pos = new Float32Array(48 * 3);
  for (let i = 0; i < 48; i++) {
    const s = spots[i % 3].clone().add(V3(rand(-3, 3), rand(0, 2), rand(-3, 3)));
    fireflyBase.push(s);
    pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fireflyPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8f79a, size: 0.32, transparent: true, opacity: 0.9 }));
  fireflyPts.frustumCulled = false;
  scene.add(fireflyPts);
}
// --- seabirds circling reef + cove ---
const seabirds = [];
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group();
  const wm = mat(0xf4f7fa, { side: THREE.DoubleSide });
  const wl = mesh(new THREE.PlaneGeometry(0.9, 0.3), wm, -0.45, 0, 0, false);
  const wr = mesh(new THREE.PlaneGeometry(0.9, 0.3), wm, 0.45, 0, 0, false);
  g.add(wl, wr); scene.add(g);
  seabirds.push({ g, wl, wr, cx: i < 2 ? 2 : 8, cz: i < 2 ? 228 : 285, r: rand(4, 7), h: rand(6, 9), sp: rand(0.25, 0.45) * (i % 2 ? 1 : -1), ph: rand(6) });
}
// --- shoreline foam rings (breathe in and out) ---
const foamRings = [];
for (const [la, lo, r] of [[2, 230, 4.6], [2, 230, 5.6], [-8, 288, 4.2], [6, 286, 3.4]]) {
  const b = latLonToVec3(la, lo, 0).normalize();
  const ring = mesh(new THREE.TorusGeometry(r, 0.09, 6, 40).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), 0, 0, 0, false);
  orientOnSphere(ring, b.clone().multiplyScalar(R + 0.18), 0);
  scene.add(ring);
  foamRings.push({ m: ring, ph: rand(6), base: r });
}
// --- lily pads on still ponds ---
for (const [la, lo] of [[4, 112], [4.6, 112.6], [3.4, 111.4], [16, 170], [16.6, 170.5]]) {
  const b = latLonToVec3(la, lo, 0).normalize();
  const pad = mesh(new THREE.CircleGeometry(rand(0.25, 0.45), 9).rotateX(-Math.PI / 2), mat(0x2f9e5f), 0, 0, 0, false);
  orientOnSphere(pad, b.clone().multiplyScalar(R + heightFor(b) + 0.28), rand(3));
  scene.add(pad);
}
{
  const b = latLonToVec3(4.3, 112.3, 0).normalize();
  const bloom = mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(0xff8fb3), 0, 0, 0, false);
  orientOnSphere(bloom, b.clone().multiplyScalar(R + heightFor(b) + 0.4), 0);
  scene.add(bloom);
}
// --- glow mushrooms ringing the forest camp (pulse at night) ---
const shroomCapM = new THREE.MeshStandardMaterial({ color: 0xe04a5a, emissive: 0xa01030, emissiveIntensity: 0.4, flatShading: true, roughness: 0.6 });
for (let i = 0; i < 10; i++) {
  const la = 12 + rand(-4, 4), lo = 158 + rand(-4, 4);
  if (Math.hypot(la - 12, lo - 158) < 1.6) continue;
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.4, 6), mat(0xf3e9dc), 0, 0.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), shroomCapM, 0, 0.38, 0, false));
  const b = latLonToVec3(la, lo, 0);
  orientOnSphere(g, latLonToVec3(la, lo, heightFor(b.normalize()) + 0.02), rand(3));
  scene.add(g);
}
// --- pale birch grove between farm and forest ---
function makeBirch(h = 3) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, h, 6), mat(0xf1ede2), 0, h / 2, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(1.1, 1), mat(0x8fd06a), 0, h + 0.5, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.7, 1), mat(0xa8e08a), 0.6, h + 0.1, 0.3, false));
  return g;
}
{
  const grove = new THREE.Group(); scene.add(grove);
  const put = (obj, la, lo, yaw = 0) => {
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(obj, latLonToVec3(la, lo, heightFor(b.normalize()) + 0.05), yaw);
    grove.add(obj); return obj;
  };
  for (let i = 0; i < 10; i++) put(makeBirch(rand(2.4, 3.6)), rand(19, 27), rand(148, 168), rand(3));
}
// --- one graphics ticker to rule the ambience ---
let emberT = 0;
tickers.push((t, dt) => {
  const night = isNight();
  // sun/moon sprites ride the sky
  sunSpr.position.copy(sun.position).normalize().multiplyScalar(190);
  sunSpr.material.opacity = 0.35 + (sun.intensity / 2.3) * 0.65;
  moonSpr.position.copy(sun.position).normalize().multiplyScalar(-185);
  moonSpr.material.opacity = night ? 0.9 : 0.0;
  // clouds sail on
  for (const c of clouds) {
    c.userData.a += dt * c.userData.sp;
    c.position.set(Math.cos(c.userData.a) * c.userData.rr, c.userData.y + Math.sin(t * 0.4 + c.userData.rr) * 0.6, Math.sin(c.userData.a) * c.userData.rr);
  }
  // butterflies flutter by day, fireflies dance by night
  for (const b of butterflies) {
    b.g.visible = !night;
    if (!b.g.visible) continue;
    const base = latLonToVec3(b.lat, b.lon, 0).normalize().multiplyScalar(R + heightFor(latLonToVec3(b.lat, b.lon, 0).normalize()) + 1.2);
    b.g.position.set(
      base.x + Math.sin(t * 0.9 + b.ph) * b.r,
      base.y + Math.sin(t * 2.1 + b.ph) * 0.5 + 0.4,
      base.z + Math.cos(t * 0.7 + b.ph) * b.r);
    b.g.rotation.y = t * 0.9 + b.ph;
    const flap = Math.sin(t * 18 + b.ph) * 0.9;
    b.wl.rotation.y = flap; b.wr.rotation.y = -flap;
  }
  if (fireflyPts) {
    fireflyPts.visible = night;
    if (night) {
      const arr = fireflyPts.geometry.attributes.position;
      for (let i = 0; i < fireflyBase.length; i++) {
        const s = fireflyBase[i];
        arr.array[i * 3] = s.x + Math.sin(t * 0.8 + i * 1.7) * 0.8;
        arr.array[i * 3 + 1] = s.y + Math.sin(t * 1.3 + i * 2.3) * 0.5;
        arr.array[i * 3 + 2] = s.z + Math.cos(t * 0.6 + i) * 0.8;
      }
      arr.needsUpdate = true;
      fireflyPts.material.opacity = 0.6 + Math.sin(t * 3) * 0.25;
    }
  }
  // gulls flap around the coasts
  for (const s of seabirds) {
    const a = t * s.sp + s.ph;
    const b = latLonToVec3(s.cx + Math.cos(a) * 6, s.cz + Math.sin(a) * 10, 0).normalize();
    s.g.position.copy(b).multiplyScalar(R + s.h + Math.sin(t * 1.5 + s.ph) * 0.5);
    s.g.rotation.y = -a;
    const flap = Math.sin(t * 10 + s.ph) * 0.6;
    s.wl.rotation.y = flap * 0.4; s.wr.rotation.y = -flap * 0.4;
    s.wl.rotation.z = flap; s.wr.rotation.z = -flap;
  }
  // foam breathes, windows glow after dark, mushrooms pulse
  for (const f of foamRings) {
    const k = 1 + Math.sin(t * 1.4 + f.ph) * 0.05;
    f.m.scale.set(k, 1, k);
    f.m.material.opacity = 0.35 + Math.sin(t * 1.4 + f.ph) * 0.12;
  }
  windowGlowM.emissiveIntensity = night ? 1.6 : 0.4;
  shroomCapM.emissiveIntensity = night ? 1.4 + Math.sin(t * 2.5) * 0.4 : 0.4;
  // embers rise from the two hearths
  emberT -= dt;
  if (emberT <= 0) {
    emberT = 0.4;
    if (window.__fire) burst(window.__fire.position.clone().add(V3(0, 1.2, 0)), 0xff9a3d, 2, 0.8);
    if (homeFirePos) burst(homeFirePos.clone(), 0xff9a3d, 2, 0.8);
  }
});

// ---------- checkpoints: stone cairns that remember your journey ----------
const SAVE_KEY = 'little-planet-save-v1';
// Glowing remedy herbs grow on bushes: pick (E), keep in the pack, press R.
function makeHerbBush() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(0.7, 1), mat(0x2f7e5f), 0, 0.5, 0));
  const glow = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x50ffaa, emissive: 0x1a8a5a, emissiveIntensity: 0.8, flatShading: true });
  for (let k = 0; k < 6; k++)
    glow.add(mesh(new THREE.SphereGeometry(0.13, 6, 5), gm, rand(-0.5, 0.5), rand(0.3, 0.95), rand(-0.5, 0.5), false));
  g.add(glow);
  tickers.push((t) => { gm.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.3; });
  return { g, glow };
}
function plantHerbBush(la, lon, parent) {
  const { g: bush, glow } = makeHerbBush();
  const b = latLonToVec3(la, lon, 0);
  orientOnSphere(bush, latLonToVec3(la, lon, heightFor(b.normalize()) + 0.05), rand(Math.PI * 2));
  parent.add(bush);
  addNode({
    type: 'remedy', item: 'remedy', name: 'Remedy Herbs', verb: 'Gather', icon: '🌿', color: 0x50ffaa, chime: 700,
    lat: la, lon, kind: 'REMEDY', tool: null, stock: 2, respawn: 75,
    onDeplete: () => (glow.visible = false), onRegrow: () => (glow.visible = true),
  });
}
const CHECKPOINTS = [
  { id: 'clover', lat: 2, lon: 50, name: 'Clover Fields' },
  { id: 'fernwood', lat: 14, lon: 156, name: 'Fernwood Camp' },
  { id: 'oasis', lat: 8, lon: 106, name: 'Sunstone Oasis' },
  { id: 'cove', lat: 13, lon: 277, name: 'Shell Cove' },
  { id: 'reef', lat: -1, lon: 224, name: 'Tideglass Reef' },
  { id: 'ember', lat: 5, lon: 323, name: 'Ember Heights' },
  { id: 'north', lat: 58, lon: 136, name: 'Northlight' },
];
const checkpointObjs = [];
function buildCheckpoints() {
  for (const c of CHECKPOINTS) {
    const g = new THREE.Group();
    // cairn: stacked stones + a little amber lantern
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 7), mat(0x8fa3b8), 0, 0.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.45, 7), mat(0x9fb4c8), 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.4, 6), mat(0xb9c9d8), 0, 1.1, 0));
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffc93d, emissive: 0xa86a00, emissiveIntensity: 0.6, flatShading: true });
    const lamp = mesh(new THREE.OctahedronGeometry(0.28, 0), lampM, 0, 1.65, 0, false);
    g.add(lamp);
    c.lampM = lampM;
    const base = latLonToVec3(c.lat, c.lon, 0);
    orientOnSphere(g, latLonToVec3(c.lat, c.lon, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    scene.add(g);
    c.obj = g;
    checkpointObjs.push(c);
    tickers.push((t) => {
      lamp.rotation.y += 0.01;
      lamp.position.y = 1.65 + Math.sin(t * 2 + c.lat) * 0.08;
      lampM.emissiveIntensity = (lastCheckpointId === c.id ? 1.6 : 0.6) + Math.sin(t * 2.4) * 0.15;
    });
  }
}
buildCheckpoints();
// Remedy herb bushes: two on the ice near the bears, two in kinder climates.
{
  const herbParent = new THREE.Group();
  scene.add(herbParent);
  plantHerbBush(59, 128, herbParent);
  plantHerbBush(61, 145, herbParent);
  plantHerbBush(15, 164, herbParent);
  plantHerbBush(6, 44, herbParent);
}
function snapshot() {
  return {
    v: 1, at: Date.now(), checkpoint: lastCheckpointId,
    pos: playerPos.toArray(), facing: facing.toArray(), heading: moveDirSmooth.toArray(),
    inv: { ...inv }, meters: { ...meters },
    tools: { ...tools },
    life: saveLife(),
    npcs: NPCS.map((n) => ({ id: n.id, counts: n.trades.map((t) => t.count), met: n.met, lineIdx: n.lineIdx })),
    wonders: wonders.map((w) => ({ id: w.id, done: w.done, stage: w.stage || 0 })),
    bridges: bridges.map((b) => b.fixed),
    bears: bears.map((b) => ({ hp: b.hp, dead: b.dead, pos: b.pos.toArray() })),
    fishStage,
  };
}
function saveCheckpoint(id, quiet) {
  if (id && id !== 'bear') lastCheckpointId = id;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); } catch { /* private mode */ }
  if (!quiet) {
    const c = CHECKPOINTS.find((x) => x.id === id);
    toast(`📍 Checkpoint — ${c ? c.name : 'progress'} saved.`);
    const flag = document.getElementById('checkpoint-flag');
    if (flag) {
      flag.textContent = `📍 Checkpoint saved — ${c ? c.name : ''}`;
      flag.classList.remove('hidden');
      setTimeout(() => flag.classList.add('hidden'), 2200);
    }
    chime(660);
  }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function applySave(s, respawn) {
  if (!s) return false;
  Object.assign(inv, s.inv);
  Object.assign(meters, s.meters);
  if (meters.hunger === undefined) meters.hunger = 100;
  if (meters.warmth === undefined) meters.warmth = 100;
  if (meters.morale === undefined) meters.morale = 80;
  for (const k of ['egg', 'milk', 'meal']) if (inv[k] === undefined) inv[k] = 0;
  if (s.life) restoreLife(s.life);
  if (s.tools) Object.assign(tools, s.tools);
  for (const sn of s.npcs || []) {
    const n = NPCS.find((x) => x.id === sn.id);
    if (!n) continue;
    (sn.counts || []).forEach((c, i) => { if (n.trades[i]) n.trades[i].count = c; });
    n.met = !!sn.met;
    n.lineIdx = sn.lineIdx || 0;
  }
  if (respawn) {
    meters.health = Math.max(meters.health, 60);
    meters.hunger = Math.max(meters.hunger ?? 0, 40);
    meters.morale = Math.max(meters.morale ?? 0, 40);
  } // wake up patched, not pristine
  for (const sw of s.wonders || []) {
    const w = wonders.find((x) => x.id === sw.id);
    if (w) { w.done = sw.done; w.stage = sw.stage || 0; }
  }
  // re-apply wonder visuals so a restored save looks right
  if (byId('light').done) { reefLampM.emissiveIntensity = 2.4; reefBeamM.opacity = 0.4; reefLight.intensity = 40; }
  if (byId('aurora').done) aurora.target = 1;
  if (byId('harvest').stage >= 1) window.__crops?.forEach((c) => c.mesh.scale.setScalar(0.7));
  if (byId('harvest').stage >= 2) window.__crops?.forEach((c) => { c.mesh.scale.setScalar(1.15); c.mesh.material = c.mats.pumpkinM; });
  (s.bridges || []).forEach((f, i) => { if (f && bridges[i]) bridges[i].fixed = true; });
  (s.bears || []).forEach((sb, i) => {
    const b = bears[i];
    if (!b) return;
    b.hp = sb.hp; b.dead = !!sb.dead;
    if (Array.isArray(sb.pos)) b.pos.fromArray(sb.pos);
    if (b.dead && b.interact) b.interact.kind = '🏆 BEAR BESTED';
  });
  if (typeof s.fishStage === 'number') fishStage = s.fishStage;
  if (Array.isArray(s.pos)) {
    playerPos.fromArray(s.pos);
    const n0 = playerPos.clone().normalize();
    playerPos.copy(n0).multiplyScalar(R + heightFor(n0) + 0.1);
  }
  if (Array.isArray(s.facing)) facing.fromArray(s.facing);
  if (Array.isArray(s.heading)) moveDirSmooth.fromArray(s.heading);
  lastCheckpointId = s.checkpoint || lastCheckpointId;
  renderCollection(); renderJournal(); renderStats();
  return true;
}
function updateCheckpoints() {
  for (const c of CHECKPOINTS) {
    if (!c.obj) continue;
    if (player.position.distanceTo(c.obj.position) < 4.5 && lastCheckpointId !== c.id) {
      saveCheckpoint(c.id, false);
    }
  }
}
tickers.push(() => updateCheckpoints());
// Restore the last session quietly so a refresh keeps the journey.
try {
  const prev = loadSave();
  if (prev && prev.v === 1) {
    // defer one frame: wonders/bridges/reef visuals all exist by now
    setTimeout(() => { if (applySave(prev, false)) toast('🧭 Welcome back — last checkpoint restored.'); }, 50);
  }
} catch { /* fresh start */ }
Object.assign(window.__lp, {
  bears, meters, useRemedy, attackBear, saveCheckpoint, loadSave, applySave,
  npcs: NPCS, openTrade, closeTrade, doTrade,
  get playerDead() { return playerDead; },
});

 // ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM', 'KeyF', 'KeyR', 'KeyH', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) moveTargetN = null; // manual steering cancels click-to-move
  if (e.code === 'KeyE' && currentTarget && !playerDead && !npcOpen && !buildOpen) (currentTarget.onUse || onUse)(currentTarget);
  if (e.code === 'KeyF' && !playerDead) eatFood();
  if (e.code === 'KeyR' && !playerDead) useRemedy();
  if (e.code === 'KeyH' && !playerDead && !npcOpen) { buildOpen ? closeBuild() : openBuild(); }
  if (e.code === 'KeyM') toggleGlobe();
  if (e.code === 'KeyJ') toggleJournal();
  if (e.code === 'Escape') { closeTrade(); closeBuild(); toggleJournal(false); document.getElementById('help-overlay').classList.add('hidden'); }
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
  hold('btn-act', () => { if (!npcOpen && !buildOpen && currentTarget) (currentTarget.onUse || onUse)(currentTarget); });
  hold('btn-hop', () => (keys.Space = true), () => (keys.Space = false));
  hold('btn-eat', () => eatFood());
  hold('btn-heal', () => useRemedy());
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
document.getElementById('btn-close-npc').onclick = () => closeTrade();
document.getElementById('btn-npc-leave').onclick = () => closeTrade();
document.getElementById('btn-close-build').onclick = () => closeBuild();
document.getElementById('btn-build-leave').onclick = () => closeBuild();
document.getElementById('build-overlay').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'build-overlay') closeBuild();
});
document.getElementById('npc-overlay').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'npc-overlay') closeTrade(); // click the backdrop to say farewell
});
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
  if (playerDead) {
    // fallen: stay where death found you while the game-over card shows
    const nn0 = playerPos.clone().normalize();
    player.position.copy(nn0).multiplyScalar(R + heightFor(nn0) + 0.1);
    player.rotation.z += dt * 0.4; // crumple gently
    return nn0;
  }
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
  let speed = (inWater ? 3.2 : 6.2) * running * moraleSpeed() * (meters.hunger <= 0 ? 0.8 : 1);
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
  coldTick(dt, nn); // warmth buffer + seasonal cold (life-sim)
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
  // chopping / combat mode: axe appears near a choppable tree, near a bear, or mid-swing
  const axe = player.userData.axe;
  if (axe) axe.visible = chopT > 0 || !!(best && ((best.node && best.node.tool === 'axe') || best.bear));
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
  combatNow = t;
  updateHealth(dt);
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
