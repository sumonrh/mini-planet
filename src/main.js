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
function biomeAt(n) {
  if (n.y > 0.52) return 'arctic';
  if (n.y < -0.32) return 'lagoon';
  let lon = Math.atan2(n.z, n.x);
  if (lon < 0) lon += Math.PI * 2;
  if (lon < (Math.PI * 2) / 3) return 'farm';
  if (lon < ((Math.PI * 2) * 2) / 3) return 'forest';
  return 'beach';
}
const BIOME_META = {
  farm: { code: 'FARM · 02', name: 'Greenacre', desc: 'Red barns, patient rows, and one wondrous harvest.' },
  forest: { code: 'FOREST · 01', name: 'Fernwood', desc: 'Every great adventure starts with a small step.' },
  arctic: { code: 'ARCRE · 01', name: 'The Arctic', desc: 'Blue crystal, white silence, and old migrating routes.' },
  beach: { code: 'LIEGAGH · 04', name: 'Shell Cove', desc: 'Pale sand, warm shallows, and a lagoon gone quiet.' },
  lagoon: { code: 'LIEGAGH · 04', name: 'Shell Cove', desc: 'Pale sand, warm shallows, and a lagoon gone quiet.' },
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
  if (b === 'forest') return 0.6;
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
  const sector = lon < 2.094 ? 'farm' : lon < 4.188 ? 'forest' : 'beach';
  if (sector === 'farm') {
    out.setHex(0x7cc25e);
    if (Math.sin(lon * 9 + lat) > 0.4) out.setHex(0x8fd06a);
    if (lat < 2 && lat > -12) out.setHex(0xe6c47c); // dirt belt
  } else if (sector === 'forest') {
    out.setHex(0x4da855);
    if (wob > 0.2) out.setHex(0x3f9a4c);
    if (wob < -0.5) out.setHex(0x63bd63);
  } else {
    out.setHex(0xf2dd9e);
    if (lat > 22) out.setHex(0x8cc86a);
    if (wob > 0.6) out.setHex(0xead18e);
  }
  out.offsetHSL(0, 0, rand(-0.015, 0.015));
  return out;
}
const planetGroup = new THREE.Group();
scene.add(planetGroup);
{
  const geo = new THREE.IcosahedronGeometry(R, 24); // already non-indexed
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
}
// ocean shell
const ocean = mesh(new THREE.SphereGeometry(R + 0.12, 48, 32), new THREE.MeshStandardMaterial({ color: 0x2ec4d8, transparent: true, opacity: 0.88, roughness: 0.35, flatShading: true }), 0, 0, 0, false);
ocean.receiveShadow = true;
scene.add(ocean);

// ---------- animated registries ----------
const tickers = []; // fn(t, dt)
const interactables = [];
const occluders = []; // tall structures the follow camera must not clip through
const camRay = new THREE.Raycaster();
function addInteract(def) { interactables.push({ radius: 3.6, ...def }); }

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
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x3a3330), 1.0, 0.8, 0));
  for (const [lx, lz] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]])
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5), mat(0x3a3330), lx, 0.25, lz));
  return g;
}
function makeBear(scale = 1, cub = false) {
  const g = new THREE.Group();
  const fur = mat(cub ? 0xffffff : 0xf2f7fa);
  const body = mesh(new THREE.SphereGeometry(1, 7, 6), fur, 0, 0.9, 0);
  body.scale.set(1.5, 0.9, 0.9); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.55, 7, 6), fur, 1.5, 1.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), mat(0x222222), 1.95, 1.15, 0.15, false));
  for (const [lx, lz] of [[-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4]])
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.8, 6), fur, lx, 0.3, lz));
  g.scale.setScalar(scale);
  return g;
}
function makeSeal() {
  const g = new THREE.Group();
  const m = mat(0x7d8b96);
  const b = mesh(new THREE.SphereGeometry(0.7, 7, 6), m, 0, 0.4, 0);
  b.scale.set(1.5, 0.7, 0.8); g.add(b);
  g.add(mesh(new THREE.SphereGeometry(0.35, 6, 5), m, 1.0, 0.55, 0));
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
  // sheep
  const sheepAnchor = latLonToVec3(penLA, penLO, heightFor(latLonToVec3(penLA, penLO, 0).normalize()) + 0.1);
  for (let i = 0; i < 4; i++) {
    const s = makeSheep();
    const p = sheepAnchor.clone().add(V3(rand(-2, 2), rand(0, 0.5), rand(-2, 2)));
    // re-project onto sphere
    const n = p.clone().normalize();
    orientOnSphere(s, n.clone().multiplyScalar(R + heightFor(n) + 0.1), rand(6));
    farmGroup.add(s);
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
  scatterOnSphere(g, latC + 4, lonC, 14, 46, () => makeTree(rand(2.4, 4.4)));
  scatterOnSphere(g, latC - 8, lonC + 6, 8, 12, () => makeTree(rand(1.8, 3)));
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
  // lighthouse / outpost
  const lh = new THREE.Group();
  lh.add(mesh(new THREE.CylinderGeometry(1.0, 1.4, 5.5, 8), mat(0xf2ede2), 0, 2.75, 0));
  lh.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.0, 8), mat(0xc93a3a), 0, 3.4, 0));
  lh.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.0, 8), mat(0x33414e), 0, 6.0, 0));
  const lampM = new THREE.MeshStandardMaterial({ color: 0xffe9a3, emissive: 0xffc93d, emissiveIntensity: 1.4 });
  lh.add(mesh(new THREE.SphereGeometry(0.55, 8, 7), lampM, 0, 6.0, 0, false));
  occluders.push(put(lh, latC + 2, lonC + 16, 0, 0.4));
  tickers.push((t) => { lampM.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5; });
  // chapel bell frame
  bellGroup = new THREE.Group();
  const wood = mat(0x7a5230);
  bellGroup.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood, -1, 1.3, 0));
  bellGroup.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood, 1, 1.3, 0));
  bellGroup.add(mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), wood, 0, 2.6, 0));
  const bellMesh = mesh(new THREE.ConeGeometry(0.6, 1.0, 8), mat(0xe8c33d, { metalness: 0.5, roughness: 0.35 }), 0, 1.9, 0);
  bellMesh.name = 'bell'; bellGroup.add(bellMesh);
  put(bellGroup, latC + 6, lonC - 10, 0, 0.8);
  // cabin
  const cabin = new THREE.Group();
  cabin.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 2.8), mat(0x9a6b42), 0, 1.1, 0));
  cabin.add(mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x4a5d5a), 0, 2.9, 0));
  occluders.push(put(cabin, latC + 12, lonC - 4, 0, 0.5));
  // tent
  const tent = mesh(new THREE.ConeGeometry(1.6, 1.8, 4), mat(0xe08a3c), 0, 0.9, 0);
  put(tent, latC - 8, lonC - 6, 0, 0.7);
  // fox
  const fox = new THREE.Group();
  fox.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.5), mat(0xe07b2a), 0, 0.6, 0));
  fox.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat(0xe07b2a), 0.7, 0.9, 0));
  fox.add(mesh(new THREE.ConeGeometry(0.3, 0.7, 4), mat(0xf3e9dc), -0.7, 0.6, 0));
  put(fox, latC - 1, lonC - 8, 0.2, 1.5);
  const foxHome = fox.position.clone();
  tickers.push((t) => {
    fox.position.copy(foxHome).add(V3(Math.sin(t * 0.7) * 0.8, Math.abs(Math.sin(t * 4)) * 0.15, Math.cos(t * 0.5) * 0.8));
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
  scatterOnSphere(g, 14, 285, 12, 14, () => makePalm());
  // lifeguard tower
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    tower.add(mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), mat(0x8a6238), lx, 1.7, lz));
  tower.add(mesh(new THREE.BoxGeometry(2.8, 1.6, 2.4), mat(0xe0654a), 0, 4.2, 0));
  tower.add(mesh(new THREE.ConeGeometry(2.2, 1.0, 4), mat(0xf3e9dc), 0, 5.5, 0));
  occluders.push(put(tower, 12, 292, 0, 0.5));
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
  // crabs
  for (let i = 0; i < 3; i++) {
    const crab = new THREE.Group();
    crab.add(mesh(new THREE.SphereGeometry(0.35, 7, 6), mat(0xe04a3a), 0, 0.3, 0));
    put(crab, rand(-2, 6), rand(282, 292), 0.15, rand(3));
    const home = crab.position.clone();
    tickers.push((t) => { crab.position.copy(home).add(V3(Math.sin(t + i * 2) * 0.5, 0, 0)); });
  }
  lagoonCenter = latLonToVec3(-14, 288, 0.4);
  // swimmer NPC marker (player goes here for lagoon wonder)
  steppingStones([[10, 282], [8, 284], [6, 286], [4, 288], [0, 288], [-4, 288]], 0xffffff, 0.35);
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
  mkBridge(10, 100, 0.5, 'Farm–Forest link');
  mkBridge(30, 205, 1.2, 'Forest–Arctic pass');
  mkBridge(8, 250, -0.6, 'Cove–Farm trail');
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
  ['farm', 'forest', 'beach'], 0.7, 1.6, [0x4da855, 0x63bd63, 0x8fd06a, 0x2f9e5f]);
scatterInstanced(new THREE.IcosahedronGeometry(0.12, 0), mat(0xffffff, { roughness: 0.7 }), 130,
  ['farm', 'forest', 'beach'], 0.7, 1.3, [0xff8fb3, 0xffd23d, 0xffffff, 0xc49df0], { lift: 0.25 });
scatterInstanced(new THREE.DodecahedronGeometry(0.42, 0), mat(0xffffff, { roughness: 1 }), 90,
  ['farm', 'forest', 'beach', 'arctic'], 0.5, 1.4, [0x9aa0a6, 0x7d848c, 0xb9c2c9, 0xdce9f2], { shadow: true, lift: 0.1 });
scatterInstanced(new THREE.IcosahedronGeometry(0.7, 1), mat(0xffffff, { roughness: 1 }), 70,
  ['farm', 'forest'], 0.7, 1.5, [0x2f9e5f, 0x3fae4e, 0x26854a], { shadow: true, squash: 0.7, lift: 0.25 });
scatterInstanced(new THREE.OctahedronGeometry(0.5, 0),
  new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.2, emissive: 0x0b5f8a, emissiveIntensity: 0.45 }),
  46, ['arctic'], 0.6, 1.6, [0x9fe4ff, 0x5ecdf5, 0xd6f2ff], { lift: 0.35 });

// shoreline foam rings (animated)
{
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const foams = [];
  for (const [la, lo, r] of [[-1, 286, 4.5], [1, 291, 3.4], [-13, 288, 5.5]]) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 6, 28).rotateX(-Math.PI / 2), foamMat);
    g.add(ring);
    const b = latLonToVec3(la, lo, 0);
    orientOnSphere(g, latLonToVec3(la, lo, heightFor(b.normalize()) + 0.35), rand(3));
    scene.add(g);
    foams.push({ ring, off: rand(6) });
  }
  tickers.push((t) => {
    foamMat.opacity = 0.45 + Math.sin(t * 1.4) * 0.12;
    for (const f of foams) {
      const s = 1 + Math.sin(t * 1.4 + f.off) * 0.05;
      f.ring.scale.set(s, 1, s);
    }
  });
}

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
  // arms with hands (pivot at shoulder for walk swing)
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.5, 1.48, 0);
    arm.rotation.z = s * -0.1;
    arm.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 7), coat, 0, -0.24, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.14, 7, 6), skin, 0, -0.56, 0)); // hand
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
  let phase = 0;
  const last = new THREE.Vector3(1e9, 0, 0);
  tickers.push((t, dt) => {
    const sp = player.position.distanceTo(last) / Math.max(dt, 1e-4);
    last.copy(player.position);
    const moving = sp > 1.0;
    if (moving) phase += dt * (4 + sp * 0.9);
    const target = moving ? Math.sin(phase) * 0.6 : 0;
    const k = Math.min(1, 10 * dt);
    P.armL.rotation.x += (target - P.armL.rotation.x) * k;
    P.armR.rotation.x += (-target - P.armR.rotation.x) * k;
    P.legL.rotation.x += (-target * 0.8 - P.legL.rotation.x) * k;
    P.legR.rotation.x += (target * 0.8 - P.legR.rotation.x) * k;
  });
}
let playerPos = latLonToVec3(2, 50, 0); // open path south of the farmstead, clear of buildings
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
const wonders = [
  { id: 'harvest', icon: '🎃', name: 'Wondrous Harvest', done: false, stage: 0, hint: ['Plant the rows', 'Water the sprouts', 'Harvest!'] },
  { id: 'flame', icon: '🔥', name: 'Eternal Flame', done: false, stage: 0, hint: ['Tend the fire', 'Feed the flame', 'Nurture the blaze'] },
  { id: 'bell', icon: '🔔', name: 'Chapel Bell', done: false },
  { id: 'bear', icon: '🐻‍❄️', name: 'Polar Bear', done: false },
  { id: 'fish', icon: '🐟', name: 'Special Fish', done: false, stage: 0 },
  { id: 'shell', icon: '🐚', name: 'Exotic Shell', done: false, count: 0 },
  { id: 'lagoon', icon: '🏝️', name: 'Lost Lagoon', done: false },
];
function renderCollection() {
  // Collection panel removed — progress lives in the top-center tracker only.
  document.getElementById('wonder-count').textContent = `${wonders.filter((w) => w.done).length} / 7`;
}
renderCollection();
function completeWonder(id) {
  const w = wonders.find((x) => x.id === id);
  if (!w || w.done) return;
  w.done = true;
  renderCollection();
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
addInteract({ id: 'harvest', pos: anchor(8, 52), kind: 'FARMSTEAD', label: () => wonders[0].done ? 'Harvest complete' : wonders[0].hint[wonders[0].stage], onUse });
addInteract({ id: 'sheep', pos: anchor(10, 32), kind: 'FARMSTEAD', label: () => 'Feed the sheep', onUse });
addInteract({ id: 'flame', pos: anchor(12, 158), kind: 'A SMALL WONDER', label: () => wonders[1].done ? 'Flame eternal' : wonders[1].hint[Math.min(wonders[1].stage, 2)], onUse });
addInteract({ id: 'bell', pos: anchor(24, 150), kind: 'A SMALL WONDER', label: () => 'Ring the Bell', onUse });
addInteract({ id: 'plant', pos: anchor(28, 166), kind: 'FERNWOOD', label: () => 'Nurture the sprout', onUse });
addInteract({ id: 'bear', pos: anchor(56, 105), kind: 'A SMALL WONDER', label: () => 'Greet the polar bear', onUse });
addInteract({ id: 'fish', pos: anchor(57, 118), kind: 'ICE FISHING', label: () => (wonders[4].done ? 'Catch savored' : wonders[4].stage === 1 ? 'Pull! (E)' : 'Cast the line'), onUse });
addInteract({ id: 'shell', pos: anchor(4, 284), kind: 'SHELL COVE', label: () => `Collect shells (${wonders[5].count}/3)`, onUse });
addInteract({ id: 'shell2', pos: anchor(2, 287), kind: 'SHELL COVE', label: () => `Collect shells (${wonders[5].count}/3)`, onUse });
addInteract({ id: 'shell3', pos: anchor(8, 290), kind: 'SHELL COVE', label: () => `Collect shells (${wonders[5].count}/3)`, onUse });
addInteract({ id: 'lagoon', pos: latLonToVec3(-8, 288, 0.6), kind: 'A SMALL WONDER', label: () => 'Wade into water', onUse, radius: 4.5 });

function onUse(it) {
  const p = player.position.clone();
  if (it.id === 'harvest') {
    const w = wonders[0];
    if (w.done) return toast('The harvest glows. The barn is full.');
    if (w.stage === 0) {
      w.stage = 1;
      cropSpots.forEach((c) => c.mesh.scale.setScalar(0.7));
      burst(p, 0x7ddf6a, 16, 2); chime(520); toast('🌱 Planted! Now water the rows (E).');
    } else if (w.stage === 1) {
      w.stage = 2;
      cropSpots.forEach((c) => { c.mesh.scale.setScalar(1.15); c.mesh.material = c.mats.pumpkinM; });
      burst(p, 0x4fb8ff, 18, 2); chime(600); toast('💧 Watered! Return to harvest (E).');
    } else { completeWonder('harvest'); toast('🎃 Wondrous Harvest complete!'); }
  } else if (it.id === 'sheep') {
    burst(p, 0xffffff, 12, 1.6); chime(480); toast('🐑 The sheep nuzzle your hand. Wool +1 (cozy).');
  } else if (it.id === 'flame') {
    const w = wonders[1];
    if (w.done) { burst(p, 0xff9a3d, 10, 2); return toast('The flame dances for you.'); }
    w.stage++;
    fireCone.scale.multiplyScalar(1.25); fireLight.intensity += 5;
    burst(p, 0xff8c2e, 20, 2.5); chime(540 + w.stage * 60);
    if (w.stage >= 3) completeWonder('flame');
    else toast(`🔥 Tended (${w.stage}/3) — the path brightens.`);
  } else if (it.id === 'bell') {
    const bellMesh = bellGroup.getObjectByName('bell');
    if (bellMesh && !bellMesh.userData.ringing) {
      bellMesh.userData.ringing = true;
      bellMesh.userData.t0 = performance.now();
      setTimeout(() => { if (bellMesh) { bellMesh.userData.ringing = false; bellMesh.rotation.z = 0; } }, 2500);
    }
    burst(p, 0xffe9a3, 18, 2.4); chime(880); completeWonder('bell');
  } else if (it.id === 'plant') {
    const s = window.__sprout;
    if (s) { s.scale.multiplyScalar(1.15); }
    burst(p, 0x9df0a8, 16, 2); chime(560); toast('🌿 The ancient sprout unfurls a new leaf.');
  } else if (it.id === 'bear') {
    const b = window.__bear;
    if (b) b.scale.multiplyScalar(1.04);
    burst(p, 0xffffff, 20, 2.2); chime(500); completeWonder('bear');
  } else if (it.id === 'fish') {
    const w = wonders[4];
    if (w.done) return toast('The hole glimmers. Enough for today.');
    if (w.stage === 0) {
      w.stage = 1; chime(440); toast('🎣 Line cast… wait… then press E again!');
      setTimeout(() => { if (w.stage === 1) toast('❗ Nibble! Press E now!'); }, 2200);
    } else { w.stage = 0; burst(p, 0x7ad9ff, 22, 2.6); completeWonder('fish'); }
  } else if (it.id.startsWith('shell')) {
    const w = wonders[5];
    if (w.done) return toast('Your pockets jingle with shells.');
    w.count++;
    burst(p, 0xf7c8c8, 14, 2); chime(620 + w.count * 60);
    const sh = shellMeshes[w.count - 1]; if (sh) sh.visible = false;
    if (w.count >= 3) completeWonder('shell');
    else toast(`🐚 Shell ${w.count}/3 — the cove keeps count.`);
  } else if (it.id === 'lagoon') {
    burst(p, 0x54e0d0, 20, 2.5); chime(580); completeWonder('lagoon');
  }
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyE' && currentTarget) onUse(currentTarget);
  if (e.code === 'KeyM') toggleGlobe();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
let dragging = false, px = 0, py = 0, orbitYaw = 0, orbitPitch = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; ac(); });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw += (e.clientX - px) * 0.005; orbitPitch += (e.clientY - py) * 0.005;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch, -0.5, 0.7);
  px = e.clientX; py = e.clientY;
});
let globeMode = false;
function toggleGlobe() { globeMode = !globeMode; toast(globeMode ? '🌐 Globe view — the patchwork planet' : '🧭 Back to traveler view'); }
document.getElementById('btn-globe').onclick = toggleGlobe;
document.getElementById('btn-sound').onclick = (e) => {
  muted = !muted; e.target.textContent = muted ? '🔇' : '🔊';
  toast(muted ? 'Sound off' : 'Sound on — wind and bells');
};
document.getElementById('btn-help').onclick = () => document.getElementById('help-overlay').classList.remove('hidden');
document.getElementById('btn-close-help').onclick = () => document.getElementById('help-overlay').classList.add('hidden');
// Help opens only via the ⚙ button, so the 3D planet is visible from the first frame.

// ---------- HUD refs ----------
const interactBar = document.getElementById('interact-bar');
const interactLabel = document.getElementById('interact-label');
const interactKind = document.getElementById('interact-kind');
const biomeCode = document.getElementById('biome-code');
const biomeName = document.getElementById('biome-name');
const biomeDesc = document.getElementById('biome-desc');
const biomeTag = document.getElementById('biome-tag');
const intro = document.getElementById('intro');
let currentTarget = null, lastBiome = '';
setTimeout(() => { intro.classList.add('show'); setTimeout(() => intro.classList.remove('show'), 4200); }, 800);

// ---------- main loop ----------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0); // smoothed up: world-Y in globe view, surface normal when following
const lastBehind = new THREE.Vector3(0, 0, 1); // smoothed behind-the-back follow direction
const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpM = new THREE.Vector3(), axis = new THREE.Vector3();

function updatePlayer(dt) {
  const n = playerPos.clone().normalize();
  // camera-relative basis on tangent plane
  const camDir = V3(); camera.getWorldDirection(camDir);
  tmpF.copy(camDir).addScaledVector(n, -camDir.dot(n)).normalize();
  if (tmpF.lengthSq() < 0.01) tmpF.set(1, 0, 0);
  tmpR.crossVectors(tmpF, n).normalize();
  let ix = 0, iz = 0;
  if (keys.KeyW) iz += 1; if (keys.KeyS) iz -= 1;
  if (keys.KeyA) ix -= 1; if (keys.KeyD) ix += 1;
  const running = keys.KeyQ ? 1.7 : 1;
  const inWater = n.y < -0.12;
  const speed = (inWater ? 3.2 : 6.2) * running;
  if (ix || iz) {
    tmpM.set(0, 0, 0).addScaledVector(tmpF, iz).addScaledVector(tmpR, ix).normalize();
    axis.crossVectors(n, tmpM).normalize();
    playerPos.applyAxisAngle(axis, (speed * dt) / R);
    facing.copy(tmpM);
    moveDirSmooth.lerp(tmpM, 1 - Math.exp(-8 * dt));
  }
  // hop
  if (keys.Space && hopH <= 0.01 && playerVel <= 0) playerVel = 5.2;
  playerVel -= 14 * dt;
  hopH += playerVel * dt;
  if (hopH < 0) { hopH = 0; playerVel = 0; }
  const nn = playerPos.clone().normalize();
  const surfH = heightFor(nn) + 0.1 + hopH + (inWater ? -0.35 : 0);
  player.position.copy(nn).multiplyScalar(R + surfH);
  // orient (+Z faces travel direction; backpack stays behind at -Z)
  const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), facing.clone().negate(), nn);
  player.quaternion.setFromRotationMatrix(m);
  // bob
  player.position.addScaledVector(nn, Math.abs(Math.sin(performance.now() * 0.008)) * ((ix || iz) ? 0.12 : 0.03));
  // lagoon wonder auto-check
  const lagoonD = player.position.distanceTo(lagoonCenter);
  if (lagoonD < 5 && !wonders[6].done) {
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
  const showTag = b === 'arctic' || b === 'beach' || b === 'lagoon';
  biomeTag.classList.toggle('hidden', !showTag);
  if (showTag) {
    document.getElementById('biome-tag-code').textContent = meta.code;
    document.getElementById('biome-tag-name').textContent = meta.name;
  }
  intro.querySelector('.intro-code').textContent = meta.code;
  intro.querySelector('h1').textContent = meta.name;
  intro.querySelector('p').textContent = meta.desc;
  intro.classList.add('show');
  clearTimeout(updateBiomeLabel._t);
  updateBiomeLabel._t = setTimeout(() => intro.classList.remove('show'), 2600);
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
  moveDirSmooth.copy(latLonToVec3(12, 40, 0)).sub(playerPos); // face the farmstead vista
  moveDirSmooth.addScaledVector(n0, -moveDirSmooth.dot(n0)).normalize();
  lastBehind.copy(moveDirSmooth);
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
