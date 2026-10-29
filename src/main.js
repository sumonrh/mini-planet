import * as THREE from 'three';

/* ============================================================
   LITTLE PLANET — A Pocket Adventure (prototype)
   Single-file tiny-planet exploration game.
   WASD walk · Q run · Space hop · E interact · M globe
   ============================================================ */

const R = 60;
const S = R / 30; // sky, fog and shadow distances scale with the planet
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
scene.fog = new THREE.Fog(0x0d1d28, 70 * S, 160 * S);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 500 * S);
camera.position.set(0, 30 * S, 60 * S);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xd8f4ff, 0x2a3a2a, 1.05));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(40 * S, 55 * S, 25 * S);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45 * S; sun.shadow.camera.right = 45 * S;
sun.shadow.camera.top = 45 * S; sun.shadow.camera.bottom = -45 * S;
sun.shadow.camera.near = 10 * S; sun.shadow.camera.far = 140 * S;
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

// ---------- animal craft room: textures, one animator, shared bird parts ----------
// Small procedural canvas maps add fur/feather/wool detail without any asset files.
const _texCache = new Map();
const cssColor = (col) => (typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : col);
function noiseTex(key, base, tones, opt = {}) {
  if (_texCache.has(key)) return _texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const { n = 120, rMin = 1.2, rMax = 3.2, aMin = 0.12, aMax = 0.4 } = opt;
  c.fillStyle = cssColor(base); c.fillRect(0, 0, 64, 64);
  for (let i = 0; i < n; i++) {
    c.fillStyle = cssColor(tones[(Math.random() * tones.length) | 0]);
    c.globalAlpha = aMin + Math.random() * (aMax - aMin);
    const r = rMin + Math.random() * (rMax - rMin);
    c.beginPath(); c.arc(Math.random() * 64, Math.random() * 64, r, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _texCache.set(key, t);
  return t;
}
function furM(key, base, tones, opt) {
  return mat(0xffffff, { map: noiseTex(key, base, tones, opt), roughness: 0.95 });
}
// One animator drives every land animal. Builders stash joints in userData.anim:
// legs (hip pivots), head, tail, body, ears, wings + gait tunables.
// move01: 0 = standing, 1 = full trot. Models face +Z unless headAxis/legAxis say 'z'.
function animateAnimal(g, t, move01, dt) {
  const an = g.userData.anim;
  if (!an) return;
  const m = Math.min(1, Math.max(0, move01));
  if (an.ph === undefined) an.ph = rand(Math.PI * 2);
  an.phase = (an.phase || 0) + dt * (an.cadence || 7) * (0.35 + 0.65 * m);
  const s = Math.sin(an.phase), c = Math.cos(an.phase);
  const amp = (an.amp || 0.5) * (0.16 + 0.84 * m);
  if (an.legs) for (let i = 0; i < an.legs.length; i++) {
    const swing = (i === 0 || i === 3 ? 1 : -1) * s * amp; // diagonal pairs
    if (an.legAxis === 'z') an.legs[i].rotation.z = swing; else an.legs[i].rotation.x = swing;
  }
  if (an.body) {
    if (an.bodyY === undefined) an.bodyY = an.body.position.y;
    an.body.position.y = an.bodyY + Math.abs(c) * (an.bodyBob || 0.05) * m + Math.sin(t * 1.7 + an.ph) * 0.012;
  }
  if (an.head) {
    const nibble = Math.pow(Math.max(0, Math.sin(t * (an.grazeSpeed || 1.2) + an.ph)), 3);
    const graze01 = (1 - m) * (0.3 + 0.7 * nibble);
    const pitch = (an.graze || 0) * graze01 + 0.05 * Math.sin(t * 1.1 + an.ph) * (1 - m);
    if (an.headAxis === 'z') an.head.rotation.z = -pitch; else an.head.rotation.x = pitch;
    an.head.rotation.y = Math.sin(t * 0.7 + an.ph * 2) * 0.15 * (1 - 0.5 * m);
    if (an.headDrop) { // dip the whole neck down to the grass
      if (an.headY === undefined) an.headY = an.head.position.y;
      an.head.position.y = an.headY - an.headDrop * graze01;
    }
  }
  if (an.tail) {
    an.tail.rotation.y = Math.sin(t * (an.tailSpeed || 3) + an.ph) * (an.tailAmp || 0.4) * (0.45 + 0.55 * m);
    if (an.tailLift !== undefined) an.tail.rotation.z = an.tailLift + Math.sin(t * 2.1 + an.ph) * 0.08;
  }
  if (an.ears && an.earBase) for (let i = 0; i < an.ears.length; i++) {
    const flick = Math.max(0, Math.sin(t * 0.9 + an.ph * 3 + i * 1.7));
    an.ears[i].rotation.z = an.earBase[i] + flick * 0.22;
  }
  if (an.wings) for (const w of an.wings) {
    w.rotation.z = (w.userData.base || 0) + Math.sin(t * (an.flap || 11) + an.ph) * (an.flapAmp || 0.12) * (0.3 + 0.7 * m);
  }
}
// shared two-segment bird wing (extends along ±X, so a flap is rotation.z)
function birdWing(side, span, chord, wingM) {
  const shoulder = new THREE.Group();
  shoulder.add(mesh(new THREE.BoxGeometry(span * 0.52, 0.05, chord), wingM, side * span * 0.26, 0, 0, false));
  const elbow = new THREE.Group(); elbow.position.x = side * span * 0.52;
  const outer = mesh(new THREE.BoxGeometry(span * 0.48, 0.04, chord * 0.62), wingM, side * span * 0.24, 0, -chord * 0.14, false);
  outer.rotation.y = side * 0.16; // swept wingtip
  elbow.add(outer);
  shoulder.add(elbow);
  shoulder.userData.side = side;
  return shoulder;
}
function wingFlap(w, f) { w.rotation.z = w.userData.side * f; }
// shared bird body kit (gulls + seabirds): capsule torso, head, beak, fan tail, two wings
function makeBirdMesh(s, bodyCol, wingCol, tones) {
  const g = new THREE.Group();
  const bodyM = furM('bird' + bodyCol, bodyCol, tones, { n: 70, rMin: 1, rMax: 2.4, aMax: 0.28 });
  const wingM = mat(wingCol, { side: THREE.DoubleSide });
  const body = new THREE.Group(); g.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.12 * s, 0.34 * s, 4, 10), bodyM, 0, 0, -0.02 * s, false);
  torso.rotation.x = Math.PI / 2; body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), bodyM, 0, 0.05 * s, 0.23 * s, false));
  const beak = mesh(new THREE.ConeGeometry(0.045 * s, 0.16 * s, 6), mat(0xe8a33d), 0, 0.03 * s, 0.37 * s, false);
  beak.rotation.x = Math.PI / 2; body.add(beak);
  for (const sx of [-1, 1])
    body.add(mesh(new THREE.SphereGeometry(0.024 * s, 6, 5), mat(0x191512), sx * 0.06 * s, 0.08 * s, 0.3 * s, false));
  const tail = mesh(new THREE.ConeGeometry(0.1 * s, 0.3 * s, 5), wingM, 0, 0.01 * s, -0.3 * s, false);
  tail.rotation.x = -Math.PI / 2; body.add(tail);
  const wl = birdWing(1, 1.5 * s, 0.38 * s, wingM);
  const wr = birdWing(-1, 1.5 * s, 0.38 * s, wingM);
  body.add(wl, wr);
  return { g, body, wl, wr };
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

// ---------- animated registries (declared early: stars/farm blocks push during eval) ----------
const tickers = []; // fn(t, dt)
const nightLights = []; // {l, base} — lanterns/windows glow harder at night
const interactables = [];
const occluders = []; // tall structures the follow camera must not clip through
const camRay = new THREE.Raycaster();
function addInteract(def) { interactables.push({ radius: 3.6, ...def }); }

// ---------- stars (layered field + milky way + shooting stars) ----------
const starLayers = [];
function makeStarLayer(count, size, opacity, colors) {
  const g = new THREE.BufferGeometry();
  const pts = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const v = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(150, 230) * S);
    pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z;
    c.setHex(colors[(Math.random() * colors.length) | 0]);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    size, vertexColors: true, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
  }));
  p.frustumCulled = false;
  scene.add(p);
  starLayers.push({ pts: p, base: opacity, size, ph: rand(Math.PI * 2) });
  return p;
}
makeStarLayer(1000, 0.9 * S, 0.75, [0xbfd9e8, 0xffffff, 0x9fc4e8]); // far dust
makeStarLayer(450, 1.5 * S, 0.85, [0xffffff, 0xffe9c4, 0xc4d9ff]); // bright stars
makeStarLayer(90, 2.4 * S, 0.9, [0xffffff, 0xffd9a3]); // heroes
// milky way band along a tilted great circle
{
  const n = V3(0.4, 1, 0.25).normalize();
  const g = new THREE.BufferGeometry();
  const N = 750, pts = new Float32Array(N * 3), cols = new Float32Array(N * 3);
  const c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 20000) {
    const v = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    if (Math.abs(v.dot(n)) > 0.13 + Math.random() * 0.1) continue; // keep the band
    v.multiplyScalar(rand(160, 220) * S);
    pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z;
    c.setHex([0xaac4e8, 0xd9e6ff, 0x8fb0dd][(Math.random() * 3) | 0]);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    i++;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.6 * S, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
  }));
  p.frustumCulled = false;
  scene.add(p);
  starLayers.push({ pts: p, base: 0.38, size: 1.6 * S, ph: rand(Math.PI * 2), band: true });
}
// twinkle (size-based, so no fight with updateSky's opacity fade) + band fade + meteors
const meteors = [];
const meteorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
let meteorT = 5;
tickers.push((t, dt) => {
  const night = isNight();
  for (const L of starLayers) {
    const target = night ? L.base : 0;
    const m = L.pts.material;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 2);
    if (night) m.size = L.size * (1 + Math.sin(t * 2.2 + L.ph) * 0.14);
  }
  meteorT -= dt;
  if (meteorT <= 0) {
    meteorT = rand(6, 14);
    if (night) {
      const start = V3(rand(-1, 1), rand(0.35, 1), rand(-1, 1)).normalize().multiplyScalar(190 * S);
      const dir = V3(rand(-1, 1), rand(-0.5, -0.12), rand(-1, 1)).normalize();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.35 * S, 0.35 * S, 14 * S), meteorMat.clone());
      m.position.copy(start);
      m.quaternion.setFromUnitVectors(V3(0, 0, 1), dir.clone().negate());
      m.frustumCulled = false;
      scene.add(m);
      meteors.push({ m, dir, life: 0 });
    }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const mt = meteors[i];
    mt.life += dt;
    mt.m.position.addScaledVector(mt.dir, dt * 90 * S);
    mt.m.material.opacity = Math.max(0, 0.95 * (1 - mt.life / 0.9));
    if (mt.life >= 0.9 || !isNight()) {
      scene.remove(mt.m);
      mt.m.geometry.dispose(); mt.m.material.dispose();
      meteors.splice(i, 1);
    }
  }
});

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
  const micro = Math.sin(n.x * 31.3 + n.y * 19.7) * Math.cos(n.z * 27.1 - n.x * 14.2);
  if (n.y > 0.52) {
    const t = THREE.MathUtils.clamp((n.y - 0.52) * 4 + wob * 0.15, 0, 1);
    out.setHex(0xeef6fc).lerp(new THREE.Color(0xb8dcf0), t * 0.58);
    if (wob > 0.5) out.setHex(0x9ad0ee);
    else if (micro > 0.45) out.setHex(0xf7fbff);
    return out;
  }
  if (n.y < -0.32) { out.setHex(0x186e96); return out; }
  const b = biomeAt(n);
  if (b === 'farm') {
    out.setHex(0x74be56);
    if (Math.sin(lon * 9 + lat) > 0.35) out.setHex(0x8ad064);
    if (micro > 0.45) out.setHex(0x64ad4a);
    if (lat < 2 && lat > -12) out.setHex(micro > 0.2 ? 0xdec078 : 0xe8ca84); // dirt belt
  } else if (b === 'oasis') {
    out.setHex(0xe8c578); // golden dunes
    if (Math.sin(lon * 7 - lat * 0.7) > 0.3) out.setHex(0xf2d892);
    if (wob > 0.48) out.setHex(0xd6a95c);
    if (micro < -0.45) out.setHex(0xdfb86b);
    if (lat < -6) out.setHex(0xecdcac); // pale flats
  } else if (b === 'forest') {
    out.setHex(0x469e50);
    if (wob > 0.18) out.setHex(0x368844);
    if (wob < -0.45) out.setHex(0x5eb85e);
    if (micro > 0.5) out.setHex(0x2f773d);
  } else if (b === 'reef') {
    out.setHex(0x84d0c4); // shallow shelf under the water
    if (wob > 0.25) out.setHex(0x62b8a8);
    if (lat > 6) out.setHex(0xf0e1b0); // sandy rim
    let dLonI = Math.abs(lon / DEG - 230);
    if (dLonI > 180) dLonI = 360 - dLonI;
    if (Math.hypot(lat - 2, dLonI) < 8) out.setHex(0xf2e3b6); // lighthouse island sand
  } else if (b === 'volcano') {
    out.setHex(0x463c35); // dark basalt
    if (wob > 0.22) out.setHex(0x5b4837);
    if (wob < -0.4) out.setHex(0x322b26);
    if (Math.sin(lon * 13 + lat * 1.7) > 0.89 || micro > 0.72) out.setHex(0xc95c2e); // cooling lava flecks
  } else {
    out.setHex(0xf2dd9e); // cove sand
    if (lat > 22) out.setHex(0x88c666);
    if (wob > 0.5) out.setHex(0xe6cc86);
  }
  out.offsetHSL(0, 0, rand(-0.016, 0.016));
  return out;
}
let planetMesh = null; // raycast target for click-to-move
const planetGroup = new THREE.Group();
scene.add(planetGroup);
{
  const geo = new THREE.IcosahedronGeometry(R, 49); // 4x polys: faces 20*50^2=50k (was 20*25^2=12.5k)
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color(), shoreSand = new THREE.Color(0xe5cf96);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const h = heightFor(n);
    v.copy(n).multiplyScalar(R + h);
    pos.setXYZ(i, v.x, v.y, v.z);
    // per-face jitter: same for each triangle
    const jitter = (i % 3 === 0) ? rand(-0.02, 0.02) : 0;
    groundColor(n, c);
    // wet coastal sand transition near waterline (outside arctic/volcano)
    if (n.y < 0.48 && h > 0.02 && h < 0.26 && biomeAt(n) !== 'volcano') {
      c.lerp(shoreSand, THREE.MathUtils.clamp((0.26 - h) * 2.4, 0, 0.55));
    }
    c.offsetHSL(0, 0, jitter);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const planet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
  planet.receiveShadow = true;
  planetGroup.add(planet);
  planetMesh = planet;
}
// ocean shell: custom animated water shader with shoreline whitewater foam,
// shallow-to-deep color gradient, and sun specular sparkles.
const oceanUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
  uDeep: { value: new THREE.Color(0x176d96) },
  uMid: { value: new THREE.Color(0x28acc6) },
  uShallow: { value: new THREE.Color(0x5ae2d4) },
  uFoam: { value: new THREE.Color(0xf4fbff) },
};
const ocean = (() => {
  const oGeo = new THREE.SphereGeometry(R + 0.12, 160, 104);
  const oPos = oGeo.attributes.position;
  const shoreAttr = new Float32Array(oPos.count);
  const vn = new THREE.Vector3();
  for (let i = 0; i < oPos.count; i++) {
    vn.fromBufferAttribute(oPos, i).normalize();
    shoreAttr[i] = heightFor(vn) - 0.12; // < 0 in water, ~0 right at the beach/shoreline
  }
  oGeo.setAttribute('aShore', new THREE.BufferAttribute(shoreAttr, 1));
  const oMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
      attribute float aShore;
      uniform float uTime;
      varying float vShore;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      void main() {
        vShore = aShore;
        vec3 n = normalize(position);
        float wave = sin(position.x * 0.45 + uTime * 1.9) * cos(position.z * 0.42 - uTime * 1.5) * 0.045
                   + sin(position.y * 0.7 - uTime * 2.3) * 0.025;
        vec3 displaced = position + n * wave;
        vec4 wp = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * n);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir, uDeep, uMid, uShallow, uFoam;
      varying float vShore;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        // depth factor: 1 near shore/shallows, 0 in deep water
        float shallowF = smoothstep(-0.65, -0.02, vShore);
        vec3 waterCol = mix(uDeep, uMid, smoothstep(-1.1, -0.35, vShore));
        waterCol = mix(waterCol, uShallow, shallowF * 0.78);
        // animated wave ripple tint
        float ripple = sin(vWorldPos.x * 1.3 + uTime * 2.2) * cos(vWorldPos.z * 1.3 - uTime * 1.8) * 0.5 + 0.5;
        waterCol += vec3(0.04, 0.09, 0.11) * pow(ripple, 3.0) * (0.4 + 0.6 * shallowF);
        // shoreline foam bands where land meets sea
        float shoreProx = smoothstep(-0.32, 0.04, vShore) * (1.0 - smoothstep(0.05, 0.22, vShore));
        float waveBand = sin(vShore * 36.0 + uTime * 3.2 + ripple * 2.2) * 0.5 + 0.5;
        float foam = shoreProx * (smoothstep(0.42, 0.82, waveBand) * 0.75 + smoothstep(-0.08, 0.03, vShore) * 0.85);
        // sun lighting + glittering specular
        float ndl = max(0.22, dot(n, uSunDir) * 0.65 + 0.35);
        vec3 halfV = normalize(uSunDir + viewDir);
        vec3 pertN = normalize(n + vec3(sin(vWorldPos.x * 2.6 + uTime * 3.1), cos(vWorldPos.y * 2.4 - uTime * 2.5), sin(vWorldPos.z * 2.6 + uTime * 2.8)) * 0.055);
        float spec = pow(max(0.0, dot(pertN, halfV)), 48.0) * 0.65;
        vec3 col = waterCol * ndl + uFoam * (foam * 0.85 + spec);
        float alpha = mix(0.91, 0.82, shallowF) + foam * 0.12;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.98));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
  });
  const m = new THREE.Mesh(oGeo, oMat);
  m.receiveShadow = true;
  return m;
})();
scene.add(ocean);

// ---------- instanced ground clutter (lush meadow grass, wildflowers & pebbles in 3 draw calls) ----------
{
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  // 1) 1,600 grass tuft clusters across farm, forest, and oasis rim
  const grassGeo = new THREE.ConeGeometry(0.11, 0.46, 4);
  grassGeo.translate(0, 0.22, 0);
  const grassMat = mat(0xffffff, { roughness: 0.88 });
  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, 1600);
  grassInst.receiveShadow = true;
  let gi = 0;
  for (let i = 0; i < 2600 && gi < 1600; i++) {
    const la = rand(-22, 46), lo = rand(0, 360);
    const n = latLonToVec3(la, lo, 0).normalize();
    const b = biomeAt(n);
    if (b !== 'farm' && b !== 'forest' && !(b === 'cove' && la > 16)) continue;
    const h = heightFor(n);
    if (h < 0.2) continue;
    const p = n.clone().multiplyScalar(R + h + 0.02);
    orientOnSphere(dummy, p, rand(Math.PI * 2));
    dummy.scale.set(rand(0.8, 1.35), rand(0.75, 1.55), rand(0.8, 1.35));
    dummy.updateMatrix();
    grassInst.setMatrixAt(gi, dummy.matrix);
    c.setHex(b === 'forest' ? (i % 2 ? 0x3b9648 : 0x52b258) : (i % 2 ? 0x6ec052 : 0x88d464));
    c.offsetHSL(0, 0, rand(-0.03, 0.03));
    grassInst.setColorAt(gi, c);
    gi++;
  }
  grassInst.count = gi;
  grassInst.instanceMatrix.needsUpdate = true;
  if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
  scene.add(grassInst);

  // 2) 420 wildflower blooms (buttercups, pink clover, azure bells, lavender)
  const flowerGeo = new THREE.DodecahedronGeometry(0.11, 0);
  flowerGeo.translate(0, 0.16, 0);
  const flowerMat = mat(0xffffff, { roughness: 0.7 });
  const flowerInst = new THREE.InstancedMesh(flowerGeo, flowerMat, 420);
  const flowerPalette = [0xffd94a, 0xff8fb3, 0x74c8ff, 0xc792ff, 0xfff4d2];
  let fi = 0;
  for (let i = 0; i < 900 && fi < 420; i++) {
    const la = rand(-18, 42), lo = rand(0, 210);
    const n = latLonToVec3(la, lo, 0).normalize();
    const b = biomeAt(n);
    if (b !== 'farm' && b !== 'forest') continue;
    const h = heightFor(n);
    if (h < 0.24) continue;
    orientOnSphere(dummy, n.clone().multiplyScalar(R + h + 0.03), rand(Math.PI * 2));
    dummy.scale.setScalar(rand(0.8, 1.4));
    dummy.updateMatrix();
    flowerInst.setMatrixAt(fi, dummy.matrix);
    c.setHex(flowerPalette[i % flowerPalette.length]);
    flowerInst.setColorAt(fi, c);
    fi++;
  }
  flowerInst.count = fi;
  flowerInst.instanceMatrix.needsUpdate = true;
  if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
  scene.add(flowerInst);

  // 3) 360 natural pebbles & coastal/desert stones
  const pebGeo = new THREE.DodecahedronGeometry(0.16, 0);
  pebGeo.scale(1.2, 0.55, 1.0);
  const pebMat = mat(0xffffff, { roughness: 0.92 });
  const pebInst = new THREE.InstancedMesh(pebGeo, pebMat, 360);
  let pi = 0;
  for (let i = 0; i < 650 && pi < 360; i++) {
    const la = rand(-24, 58), lo = rand(0, 360);
    const n = latLonToVec3(la, lo, 0).normalize();
    const h = heightFor(n);
    if (h < 0.14) continue;
    orientOnSphere(dummy, n.clone().multiplyScalar(R + h + 0.03), rand(Math.PI * 2));
    dummy.scale.setScalar(rand(0.65, 1.55));
    dummy.updateMatrix();
    pebInst.setMatrixAt(pi, dummy.matrix);
    const b = biomeAt(n);
    c.setHex(b === 'volcano' ? 0x52453d : (b === 'oasis' ? 0xcfa768 : (b === 'arctic' ? 0xaec8dc : 0x9aa4ab)));
    c.offsetHSL(0, 0, rand(-0.04, 0.04));
    pebInst.setColorAt(pi, c);
    pi++;
  }
  pebInst.count = pi;
  pebInst.instanceMatrix.needsUpdate = true;
  if (pebInst.instanceColor) pebInst.instanceColor.needsUpdate = true;
  scene.add(pebInst);
}

// atmosphere: a taller shell integrated per-pixel along the view ray. Density
// falls off exponentially with altitude, so the haze is thick and hazy at the
// horizon, fades out gradually toward space, and stays thin everywhere else.
// BackSide + additive keeps it from ever hiding the planet it hugs.
const ATMO_R = R + 13;
const atmoUniforms = {
  uDay: { value: new THREE.Color(0x5aa6e8) },
  uNight: { value: new THREE.Color(0x1e3a5e) },
  uDusk: { value: new THREE.Color(0xff9c5a) },
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uDensity: { value: 0.0085 },
  uHeight: { value: 3.4 }, // scale height: density halves roughly every 2.4 units
  uPlanetR: { value: R },
  uAtmoR: { value: ATMO_R },
};
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(ATMO_R, 64, 40),
  new THREE.ShaderMaterial({
    uniforms: atmoUniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uDay, uNight, uDusk, uSunDir;
      uniform float uDensity, uHeight, uPlanetR, uAtmoR;
      varying vec3 vWorldPos;
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vWorldPos - ro);
        // where this view ray enters and leaves the atmosphere
        float b = dot(ro, rd);
        float disc = b * b - (dot(ro, ro) - uAtmoR * uAtmoR);
        if (disc <= 0.0) discard;
        float sq = sqrt(disc);
        float tEnter = max(0.0, -b - sq);
        float tExit = -b + sq;
        // stop at the planet so the haze only lives in the air
        float dp = b * b - (dot(ro, ro) - uPlanetR * uPlanetR);
        if (dp > 0.0) {
          float tp = -b - sqrt(dp);
          if (tp > 0.0) tExit = min(tExit, tp);
        }
        float span = tExit - tEnter;
        if (span <= 0.0) discard;

        // integrate density along the ray: thick near the ground, thinning out
        const int STEPS = 16;
        float stepLen = span / float(STEPS);
        float depth = 0.0;
        for (int i = 0; i < STEPS; i++) {
          vec3 p = ro + rd * (tEnter + (float(i) + 0.5) * stepLen);
          float h = max(0.0, length(p) - uPlanetR);
          float fall = smoothstep(uAtmoR, uPlanetR, length(p));
          depth += exp(-h / uHeight) * fall * stepLen;
        }
        float opacity = 1.0 - exp(-depth * uDensity);

        // tint by the sun at the densest point of the ray
        float tMid = clamp(-b, tEnter, tExit);
        vec3 up = normalize(ro + rd * tMid);
        float sun = dot(up, uSunDir);
        float day = smoothstep(-0.22, 0.3, sun);
        vec3 col = mix(uNight, uDay, day);
        float dusk = (1.0 - smoothstep(0.0, 0.3, abs(sun))) * (0.25 + day * 0.75);
        col = mix(col, uDusk, dusk * 0.6);
        gl_FragColor = vec4(col * opacity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
);
atmo.frustumCulled = false;
atmo.renderOrder = 2;
scene.add(atmo);

// ---------- animated registries (declared up top, before the stars block) ----------

// ---------- gather nodes (step 2: wood/stone/food/wool + tools) ----------
// Declared early: biome blocks call addNode() while the module evaluates.
const nodes = [];
const tools = { axe: 1, pick: 1 }; // speed multiplier per tool; research raises these
let onGainXp = null, onPopup = null;
function addNode(opt) {
  const nd = { prog: 0, need: 3, depleted: false, respawnT: 0, fall: 0, fallTarget: 0, shake: 0, trunkStock: 0, stock: opt.stock || 2, ...opt };
  nd.maxStock = nd.stock;
  nd.maxTrunk = nd.trunkStock;
  nodes.push(nd);
  const it = {
    id: 'node' + nodes.length, pos: anchor(opt.lat, opt.lon, 1), node: nd,
    kind: 'GATHER', label: () => nodeLabel(nd), onUse: () => gatherHit(nd),
  };
  nd.interact = it;
  if (nd.shakeRoot) nd.shakeRoot.userData.interact = it;
  addInteract(it);
  return nd;
}
// Any pine, palm, or orchard tree can be chopped. Register it at its base so the
// same gather/shake/fell/regrow path drives every tree on the planet.
function addChoppableTree(tree, lat, lon, name = 'Pine', color = 0x8fd06a) {
  return addNode({
    type: 'wood', item: 'wood', name, verb: 'Chop', icon: '🪵', color, chime: 420,
    lat, lon, kind: 'GATHER', tool: 'axe', stock: 3, respawn: 90, trunkStock: 2,
    shakeRoot: tree, fallRoot: tree,
  });
}
function nodeLabel(nd) {
  if (nd.depleted) {
    if (nd.fallRoot && nd.trunkStock > 0) return `Split Trunk ${Math.min(Math.floor(nd.prog), 2)}/2`;
    return 'Regrowing…';
  }
  const p = Math.min(Math.floor(nd.prog), nd.need);
  return `${nd.verb} ${nd.name}` + (p > 0 ? ` ${p}/${nd.need}` : '');
}
function gatherHit(nd) {
  const splitting = nd.depleted && nd.fallRoot && nd.trunkStock > 0;
  if (nd.depleted && !splitting) return toast('🌱 Regrowing… give it a moment.');
  if (meters.energy < 1) return toast('😮‍💨 Too tired to work — eat (F) or rest.');
  meters.energy = Math.max(0, meters.energy - 0.85);
  if (nd.shakeRoot) {
    if (!nd.home) nd.home = nd.shakeRoot.position.clone();
    nd.shake = 1; // vibrate
  }
  startChop(); // swing tool / hands
  const power = (nd.tool ? (tools[nd.tool] || 1) : 1) * (window.__rpgChopMult || 1);
  nd.prog += power;
  // juice: hits escalate — bigger shake, higher chime, brighter burst
  const th = splitting ? 2 : nd.need;
  const heat = Math.min(1, nd.prog / th);
  if (nd.shakeRoot) nd.shake = 0.6 + heat * 0.9;
  const fxPos = nd.shakeRoot ? nd.shakeRoot.position.clone() : player.position.clone();
  burst(fxPos, nd.color, Math.round(6 + heat * 10), 1.2 + heat * 1.2);
  flyChunk(player.position.clone().add(V3(0, 1.2, 0)), nd.color === 0xffffff ? 0xcfd8dc : 0x7a5230);
  chime(nd.chime + Math.round(heat * 160));
  if (nd.prog >= th) {
    if (!addItem(nd.item, 1)) { nd.prog = th; return; } // pack full: keep it ready
    nd.prog = 0;
    toast(`+1 ${nd.icon} ${nd.item}`);
    if (onPopup) onPopup(fxPos, `+1 ${nd.icon}`, '#ffe596');
    if (onGainXp) onGainXp(splitting ? 6 : 8, fxPos);
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
const _pineBarkM = furM('pine-bark', 0x6b4628, ['#4e311a', '#825634', '#5c3b20'], { n: 140, rMin: 1, rMax: 2.8 });
const _pineGreens = [
  furM('pine-g0', 0x1d6e35, ['#145226', '#288443', '#23753b'], { n: 120, rMin: 1.2, rMax: 3 }),
  furM('pine-g1', 0x268544, ['#1c6934', '#359c54', '#2d8e4b'], { n: 120, rMin: 1.2, rMax: 3 }),
  furM('pine-g2', 0x329c52, ['#257a3e', '#46b565', '#38a658'], { n: 120, rMin: 1.2, rMax: 3 }),
  mat(0x45b864),
];
const _aoDiscGeo = new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2);
const _aoDiscMat = new THREE.MeshBasicMaterial({ color: 0x0d1f14, transparent: true, opacity: 0.22, depthWrite: false });
function makeTree(h = 3) {
  const g = new THREE.Group();
  // soft ground contact shadow disc + flared roots + tapered bark trunk
  const ao = mesh(_aoDiscGeo, _aoDiscMat, 0, 0.03, 0, false);
  g.add(ao);
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.44, 0.42, 7), _pineBarkM, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.28, 1.45, 7), _pineBarkM, 0, 0.85, 0));
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI * 2 + 0.4;
    const root = mesh(new THREE.BoxGeometry(0.14, 0.16, 0.48), _pineBarkM, Math.cos(a) * 0.26, 0.1, Math.sin(a) * 0.26, false);
    root.rotation.y = -a;
    g.add(root);
  }
  // 5 layered bough tiers with subtle rotation + side bough tufts
  const tiers = [
    { r: 1.62, ch: 1.35, y: 1.45, m: 0 },
    { r: 1.38, ch: 1.28, y: 2.15, m: 1 },
    { r: 1.12, ch: 1.18, y: 2.82, m: 1 },
    { r: 0.84, ch: 1.05, y: 3.42, m: 2 },
    { r: 0.52, ch: 0.88, y: 3.95, m: 3 },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const cone = mesh(new THREE.ConeGeometry(t.r, t.ch, 8), _pineGreens[t.m], 0, t.y, 0);
    cone.rotation.y = i * 0.42;
    cone.rotation.z = (i % 2 ? 1 : -1) * 0.025;
    g.add(cone);
    if (i < 3) {
      const a = i * 2.1 + 0.5;
      const side = mesh(new THREE.ConeGeometry(t.r * 0.46, t.ch * 0.62, 6), _pineGreens[(t.m + 1) % 3],
        Math.cos(a) * (t.r * 0.48), t.y - 0.18, Math.sin(a) * (t.r * 0.48), false);
      side.rotation.z = -Math.cos(a) * 0.25;
      side.rotation.x = Math.sin(a) * 0.25;
      g.add(side);
    }
  }
  g.scale.setScalar(h / 3);
  return g;
}
function makePine(x, z, s) { const t = makeTree(s); t.position.set(x, z, 0); return t; }
function scatterOnSphere(group, latC, lonC, spread, count, factory, onPlace) {
  for (let i = 0; i < count; i++) {
    const la = latC + rand(-spread, spread), lo = lonC + rand(-spread, spread);
    const base = latLonToVec3(la, lo, 0);
    const p = latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05);
    const o = factory(i);
    orientOnSphere(o, p, rand(Math.PI * 2));
    group.add(o);
    if (onPlace) onPlace(o, la, lo);
  }
}
function makeSheep(scale = 1) {
  const g = new THREE.Group();
  const woolM = furM('wool', 0xf5f2ea, ['#e7e0d2', '#ffffff', '#efe8da'], { n: 160, rMin: 1.2, rMax: 3 });
  const skinM = mat(0x3a3330); // dark Suffolk-style face + legs
  // fleece: one group so shearing can scale it (children sit at its centre)
  const wool = new THREE.Group();
  wool.position.set(0, 0.92, 0);
  wool.scale.set(1.2, 0.9, 0.9);
  g.add(wool);
  wool.add(mesh(new THREE.IcosahedronGeometry(0.78, 2), woolM, 0, 0, 0));
  wool.add(mesh(new THREE.IcosahedronGeometry(0.52, 2), woolM, 0, -0.12, 0.5, false)); // chest puff
  wool.add(mesh(new THREE.IcosahedronGeometry(0.5, 2), woolM, 0, 0.06, -0.52, false)); // rump puff
  wool.add(mesh(new THREE.IcosahedronGeometry(0.44, 2), woolM, 0, 0.34, -0.18, false)); // top tuft
  // head: dark face, wool cap, droopy ears, dark muzzle
  const head = new THREE.Group(); head.position.set(0, 1.04, 0.72); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), skinM, 0, 0, 0.05));
  head.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), woolM, 0, 0.13, -0.07, false));
  head.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0x2a2320), 0, -0.07, 0.26, false));
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.11, 0.3, 6), skinM, sx * 0.28, 0.02, 0.02, false);
    ear.rotation.z = -sx * (Math.PI / 2 + 0.2); // flopped out and down
    head.add(ear); ears.push(ear);
  }
  for (const sx of [-1, 1])
    head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(0x14100e), sx * 0.15, 0.07, 0.25, false));
  // legs + hooves (FL, FR, BL, BR)
  const legs = [];
  for (const [lx, lz] of [[0.32, 0.42], [-0.32, 0.42], [0.32, -0.42], [-0.32, -0.42]]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 0.62, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.62, 7), skinM, 0, -0.27, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.18), mat(0x1e1a18), 0, -0.56, 0.02, false));
    g.add(hip); legs.push(hip);
  }
  // woolly tail
  const tail = new THREE.Group(); tail.position.set(0, 1.0, -0.84);
  tail.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), woolM, 0, 0, -0.06, false));
  g.add(tail);
  g.scale.setScalar(scale);
  g.userData.wool = wool;
  g.userData.anim = {
    legs, head, tail, body: wool, ears, earBase: ears.map((e) => e.rotation.z),
    bodyBob: 0.03, cadence: 6, amp: 0.5, graze: 0.85, grazeSpeed: 0.5, headDrop: 0.16, tailAmp: 0.5, tailSpeed: 3.4,
  };
  return g;
}
function makeBear(scale = 1, cub = false) {
  const g = new THREE.Group();
  const fur = furM(cub ? 'cubfur' : 'bearfur', 0xffffff,
    cub ? ['#ffffff', '#f4faff'] : ['#ffffff', '#f4faff', '#e9f3fb'], { n: 190, rMin: 1.4, rMax: 3.4 });
  const darkM = mat(0x222222);
  const body = mesh(new THREE.SphereGeometry(1, 14, 10), fur, 0, 0.9, 0);
  body.scale.set(1.5, 0.9, 0.9); g.add(body);
  // shoulder hump + neck ruff (separate so the body can breathe/bob)
  g.add(mesh(new THREE.SphereGeometry(0.5, 12, 9), fur, 0.45, 1.32, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.42, 12, 9), fur, 1.02, 1.12, 0, false));
  const headPivot = new THREE.Group();
  headPivot.position.set(1.4, 1.2, 0);
  g.add(headPivot);
  const head = mesh(new THREE.SphereGeometry(0.55, 14, 10), fur, 0.1, 0, 0);
  headPivot.add(head);
  // snout + nose
  headPivot.add(mesh(new THREE.SphereGeometry(0.28, 12, 9), mat(0xf7fbff), 0.5, -0.12, 0, false));
  headPivot.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), darkM, 0.72, -0.06, 0, false));
  // eyes
  const eyeL = mesh(new THREE.SphereGeometry(0.09, 8, 6), darkM, 0.35, 0.16, 0.28, false);
  const eyeR = mesh(new THREE.SphereGeometry(0.09, 8, 6), darkM, 0.35, 0.16, -0.28, false);
  headPivot.add(eyeL, eyeR);
  // rounded ears with dark inner shell
  const earL = mesh(new THREE.SphereGeometry(0.18, 10, 8), fur, -0.1, 0.5, 0.32, false);
  const earR = mesh(new THREE.SphereGeometry(0.18, 10, 8), fur, -0.1, 0.5, -0.32, false);
  const inL = mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xdfe9f1), -0.02, 0.48, 0.34, false);
  const inR = mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xdfe9f1), -0.02, 0.48, -0.34, false);
  headPivot.add(earL, earR, inL, inR);
  // stub tail
  const tail = mesh(new THREE.SphereGeometry(0.2, 10, 8), fur, -1.4, 0.9, 0, false);
  g.add(tail);
  const legs = [];
  for (const [lx, lz] of [[-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.6, lz);
    const leg = mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.8, 8), fur, 0, -0.3, 0);
    pivot.add(leg);
    // dark paws + claws
    const paw = mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xf0f7fd), 0, -0.68, 0.05, false);
    paw.scale.y = 0.8; pivot.add(paw);
    for (let k = -1; k <= 1; k++) {
      const claw = mesh(new THREE.ConeGeometry(0.035, 0.14, 5), darkM, 0.1, -0.72, 0.05 + k * 0.1, false);
      claw.rotation.z = -Math.PI / 2; // point forward
      pivot.add(claw);
    }
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
  const m = furM('seal', 0x7d8b96, ['#5f6d78', '#9fadb8', '#eef4f8'], { n: 140, rMin: 1.2, rMax: 3 });
  const darkM = mat(0x3c454d);
  const body = new THREE.Group(); g.add(body);
  const trunk = mesh(new THREE.CapsuleGeometry(0.32, 0.72, 5, 12), m, 0, 0.36, 0);
  trunk.rotation.z = Math.PI / 2; // lie along +X
  body.add(trunk);
  // head: whiskers, nose, eyes — periscopes up out of the water
  const head = new THREE.Group(); head.position.set(0.52, 0.46, 0); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.28, 12, 9), m, 0.06, 0, 0));
  head.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), m, 0.24, -0.06, 0, false));
  head.add(mesh(new THREE.SphereGeometry(0.05, 7, 6), darkM, 0.36, -0.05, 0, false));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.045, 7, 6), mat(0x1a1512), 0.16, 0.1, sx * 0.17, false));
    for (let k = 0; k < 3; k++) {
      const wk = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), mat(0xe8eef2), 0.28, -0.09 + k * 0.05, sx * 0.12, false);
      wk.rotation.y = sx * (0.3 - k * 0.3);
      head.add(wk);
    }
  }
  // front flippers (flutter) + hind flippers + tail
  const flippers = [];
  for (const sx of [-1, 1]) {
    const fl = mesh(new THREE.SphereGeometry(0.16, 8, 6), m, 0.34, 0.1, sx * 0.3, false);
    fl.scale.set(1.5, 0.25, 0.8);
    fl.rotation.y = sx * 0.4;
    body.add(fl); flippers.push(fl);
  }
  const tail = new THREE.Group(); tail.position.set(-0.62, 0.32, 0); g.add(tail);
  for (const sx of [-1, 1]) {
    const hf = mesh(new THREE.ConeGeometry(0.12, 0.42, 5), m, -0.18, 0, sx * 0.1, false);
    hf.rotation.z = Math.PI / 2 + 0.3;
    hf.rotation.y = sx * 0.45;
    tail.add(hf);
  }
  const ph = rand(Math.PI * 2);
  const flipBase = flippers.map((f) => f.rotation.y);
  tickers.push((t) => {
    const breath = Math.sin(t * 2.2 + ph);
    body.position.y = breath * 0.03;
    body.scale.y = 1 + breath * 0.04;
    const look = Math.max(0, Math.sin(t * 0.8 + ph));
    head.position.y = 0.46 + look * 0.22; // periscope
    head.rotation.z = look * 0.28;
    head.rotation.y = Math.sin(t * 0.35 + ph) * 0.3;
    tail.rotation.y = Math.sin(t * 3 + ph) * 0.4;
    flippers.forEach((f, i) => (f.rotation.y = flipBase[i] + Math.sin(t * 2.4 + ph + i) * 0.18));
  });
  return g;
}
// shared palm assets (one geometry/material set for every palm on the planet)
const _palmTrunkGeo = new THREE.CylinderGeometry(1, 1.18, 1, 7);
const _palmBladeGeo = new THREE.BoxGeometry(1, 0.07, 1);
const _palmBallGeo = new THREE.SphereGeometry(1, 7, 6);
const _palmSpearGeo = new THREE.ConeGeometry(1, 1, 6);
const _palmBark = mat(0x8a6238), _palmBarkDark = mat(0x6e4e2c), _palmNutM = mat(0x6b4a2f);
const _palmFronds = [mat(0x2f9e5f), mat(0x37b567), mat(0x26854a)];
function makePalm(h = rand(3.6, 4.8), lean = rand(0.05, 0.11)) {
  const g = new THREE.Group();
  // trunk: 4 stacked tapering segments, progressive lean, alternating ring shades
  const segs = 4, segH = h / segs;
  let cx = 0, cy = 0;
  for (let s = 0; s < segs; s++) {
    const r = 0.36 - 0.15 * (s / (segs - 1));
    const seg = mesh(_palmTrunkGeo, s % 2 ? _palmBarkDark : _palmBark, cx, cy + segH / 2, 0);
    seg.scale.set(r, segH + 0.07, r);
    seg.rotation.z = -lean * s;
    g.add(seg);
    cx += Math.sin(lean * s) * segH;
    cy += Math.cos(lean * s) * segH * 0.99;
  }
  const flare = mesh(_palmTrunkGeo, _palmBarkDark, 0, 0.22, 0, false); // root flare
  flare.scale.set(0.55, 0.45, 0.55);
  g.add(flare);
  // crown: bud + coconuts + two-tier fronds + young spear leaf
  const crown = new THREE.Group();
  crown.position.set(cx, cy + 0.05, 0);
  g.add(crown);
  const bud = mesh(_palmBallGeo, _palmBark, 0, 0.12, 0);
  bud.scale.setScalar(0.3);
  crown.add(bud);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rand(0.6);
    const nut = mesh(_palmBallGeo, _palmNutM, Math.cos(a) * 0.3, -0.2, Math.sin(a) * 0.3, false);
    nut.scale.setScalar(0.19);
    crown.add(nut);
  }
  for (let i = 0; i < 8; i++) {
    const lower = i < 5; // lower ring droops, upper ring lifts
    const len = rand(2.3, 2.9), l1 = len * 0.55, l2 = len * 0.45;
    const p1 = lower ? rand(-0.3, -0.1) : rand(0.3, 0.55);
    const p2 = lower ? rand(-0.9, -0.6) : rand(-0.25, 0.0);
    const w = rand(0.3, 0.38);
    const holder = new THREE.Group();
    holder.position.set(0, 0.28, 0);
    holder.rotation.y = (i / 8) * Math.PI * 2 + rand(0.35);
    const j1 = new THREE.Group();
    j1.rotation.z = p1;
    const b1 = mesh(_palmBladeGeo, _palmFronds[i % 3], l1 / 2, 0, 0, false);
    b1.scale.set(l1, 1, w);
    j1.add(b1);
    const j2 = new THREE.Group(); // chained at the tip of segment 1, bent to total pitch p2
    j2.position.set(l1, 0, 0);
    j2.rotation.z = p2 - p1;
    const b2 = mesh(_palmBladeGeo, _palmFronds[(i + 1) % 3], l2 / 2, 0, 0, false);
    b2.scale.set(l2, 1, w * 0.55);
    j2.add(b2);
    j1.add(j2);
    holder.add(j1);
    crown.add(holder);
  }
  const spear = mesh(_palmSpearGeo, _palmFronds[2], 0, 0.75, 0, false);
  spear.scale.set(0.16, 1.1, 0.16);
  crown.add(spear);
  const ph = rand(Math.PI * 2); // lagoon breeze sway
  tickers.push((t) => {
    crown.rotation.z = Math.sin(t * 1.1 + ph) * 0.045;
    crown.rotation.x = Math.cos(t * 0.85 + ph) * 0.035;
  });
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

function makeOrchardTree(fruitColor = 0xe8c96a) {
  const g = new THREE.Group();
  const bark = _pineBarkM;
  const leafDark = furM('orch-d', 0x358c42, ['#287033', '#46a352', '#2f7d3b'], { n: 110, rMin: 1.2, rMax: 3 });
  const leafMid = furM('orch-m', 0x48a854, ['#389143', '#5ec268', '#429c4d'], { n: 110, rMin: 1.2, rMax: 3 });
  const leafLight = mat(0x66c96c);
  g.add(mesh(_aoDiscGeo, _aoDiscMat, 0, 0.03, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.38, 0.4, 7), bark, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.55, 7), bark, 0, 0.85, 0));
  // 3 forked wooden boughs
  for (let b = 0; b < 3; b++) {
    const ba = (b / 3) * Math.PI * 2 + 0.3;
    const limb = mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.95, 6), bark, Math.cos(ba) * 0.28, 1.65, Math.sin(ba) * 0.28);
    limb.rotation.z = -Math.cos(ba) * 0.52;
    limb.rotation.x = Math.sin(ba) * 0.52;
    g.add(limb);
  }
  // multi-puff billowy canopy
  g.add(mesh(new THREE.IcosahedronGeometry(1.18, 2), leafDark, 0, 2.28, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.82, 2), leafMid, 0.68, 1.95, 0.32, false));
  g.add(mesh(new THREE.IcosahedronGeometry(0.78, 2), leafMid, -0.62, 2.02, -0.35, false));
  g.add(mesh(new THREE.IcosahedronGeometry(0.72, 2), leafMid, -0.18, 2.08, 0.68, false));
  g.add(mesh(new THREE.IcosahedronGeometry(0.66, 1), leafLight, 0.12, 2.88, -0.08, false));
  const fruitM = mat(fruitColor, { roughness: 0.45 });
  const blossomM = mat(0xfff0f5);
  for (let a = 0; a < 9; a++) {
    const aa = (a / 9) * Math.PI * 2;
    const r = 0.88 + (a % 2) * 0.22;
    g.add(mesh(new THREE.SphereGeometry(0.13, 7, 6), fruitM,
      Math.cos(aa) * r, 1.85 + (a % 3) * 0.28, Math.sin(aa) * r, false));
    if (a % 3 === 0) {
      g.add(mesh(new THREE.DodecahedronGeometry(0.08, 0), blossomM,
        Math.cos(aa + 0.3) * 0.95, 2.45 + (a % 2) * 0.2, Math.sin(aa + 0.3) * 0.95, false));
    }
  }
  return g;
}
function makeAcacia(h = 3.2) {
  const g = new THREE.Group();
  const bark = furM('acacia-bark', 0x7d5630, ['#634222', '#966b40', '#52351a'], { n: 110, rMin: 1.2, rMax: 2.8 });
  const leafM = furM('acacia-leaf', 0x76a444, ['#5e8832', '#8ebb56', '#6b963c'], { n: 110, rMin: 1.2, rMax: 3 });
  const leafL = mat(0x98c25c);
  g.add(mesh(_aoDiscGeo, _aoDiscMat, 0, 0.03, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.38, 0.45, 7), bark, 0, 0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 7), bark, 0, h / 2, 0));
  for (let i = 0; i < 4; i++) {
    const ba = (i / 4) * Math.PI * 2 + 0.4;
    const branch = mesh(new THREE.CylinderGeometry(0.055, 0.11, h * 0.62, 6), bark, Math.cos(ba) * 0.24, h * 0.78, Math.sin(ba) * 0.24);
    branch.rotation.z = -Math.cos(ba) * 0.52; branch.rotation.x = Math.sin(ba) * 0.52;
    g.add(branch);
  }
  const pads = [
    [0, h + 0.36, 0, 1.48, 0.32, 1.32, false],
    [-0.85, h + 0.16, 0.35, 1.05, 0.28, 0.95, true],
    [0.85, h + 0.18, -0.32, 1.08, 0.28, 0.98, true],
    [0.15, h + 0.54, 0.1, 0.92, 0.24, 0.85, true],
  ];
  for (const [px, py, pz, sx, sy, sz, lt] of pads) {
    const crown = mesh(new THREE.IcosahedronGeometry(1, 2), lt ? leafL : leafM, px, py, pz, false);
    crown.scale.set(sx, sy, sz);
    g.add(crown);
  }
  return g;
}
function makeEmberTree(h = 3.4) {
  const g = new THREE.Group();
  const bark = mat(0x32241d), emberBark = mat(0x523122, { emissive: 0x3d1204, emissiveIntensity: 0.25 });
  const leafM = mat(0x8c3b20, { emissive: 0x6e2008, emissiveIntensity: 0.42 });
  const leafGold = mat(0xd96b27, { emissive: 0x9c3806, emissiveIntensity: 0.55 });
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.4, 0.42, 7), bark, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.27, h, 7), emberBark, 0, h / 2, 0));
  for (let i = 0; i < 4; i++) {
    const aa = (i / 4) * Math.PI * 2 + 0.3;
    const branch = mesh(new THREE.CylinderGeometry(0.045, 0.09, 1.25, 6), bark,
      Math.cos(aa) * 0.36, h * 0.78, Math.sin(aa) * 0.36);
    branch.rotation.z = -Math.cos(aa) * 0.56; branch.rotation.x = Math.sin(aa) * 0.56;
    g.add(branch);
    const crown = mesh(new THREE.IcosahedronGeometry(0.68, 1), i % 2 ? leafGold : leafM,
      Math.cos(aa) * 0.68, h * 0.96 + 0.22, Math.sin(aa) * 0.68, false);
    crown.scale.set(1.1, 0.72, 1.1);
    g.add(crown);
  }
  const topCrown = mesh(new THREE.IcosahedronGeometry(0.76, 1), leafGold, 0, h + 0.42, 0, false);
  topCrown.scale.set(1.15, 0.68, 1.15);
  g.add(topCrown);
  return g;
}
function makeSkiff() {
  const g = new THREE.Group();
  const hullM = mat(0xf3e9dc), trimM = mat(0x2e8b8b), woodM = mat(0x9a6b42);
  const darkM = mat(0x4a3320), sailM = mat(0xffb35a, { side: THREE.DoubleSide });
  // pointed low-poly hull, bow toward +Z
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, -1.7); shape.lineTo(0.9, -1.7); shape.lineTo(0.9, 0.95);
  shape.lineTo(0, 1.9); shape.lineTo(-0.9, 0.95); shape.closePath();
  const hull = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false }), hullM);
  hull.rotation.x = Math.PI / 2; hull.position.y = 0.55;
  g.add(hull);
  g.add(mesh(new THREE.BoxGeometry(1.82, 0.08, 2.7), trimM, 0, 0.17, -0.2, false)); // waterline stripe
  for (const sx of [-1, 1])
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 2.6), trimM, sx * 0.86, 0.62, -0.2, false));
  g.add(mesh(new THREE.BoxGeometry(1.65, 0.12, 0.5), woodM, 0, 0.62, -0.75, false)); // stern bench
  g.add(mesh(new THREE.BoxGeometry(1.45, 0.1, 0.35), woodM, 0, 0.58, 0.25, false)); // rowing bench
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.55), woodM, 0.55, 0.78, -1.1, false)); // fish crate
  for (const sx of [-1, 1]) {
    const oar = mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.2, 5), woodM, sx * 1.05, 0.65, -0.25);
    oar.rotation.z = sx * 0.25; oar.rotation.x = 0.12;
    g.add(oar);
    oar.add(mesh(new THREE.BoxGeometry(0.18, 0.04, 0.3), trimM, 0, -1.05, 0, false));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.07, 3.4, 6), woodM, 0, 2.15, -0.1)); // mast
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 2.05), woodM, 0, 1.5, 0.7, false)); // boom
  const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 2.1), new THREE.Vector2(1.45, 0)]);
  const sail = mesh(new THREE.ShapeGeometry(sailShape), sailM, -0.72, 1.55, 0, false);
  g.add(sail);
  const flag = mesh(new THREE.BoxGeometry(0.5, 0.22, 0.02), mat(0xe0654a, { side: THREE.DoubleSide }), 0.25, 3.85, 0, false);
  g.add(flag);
  // stern lantern
  const lantern = new THREE.Group(); lantern.position.set(-0.6, 0.85, -1.45); g.add(lantern);
  lantern.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 5), darkM, 0, 0, 0, false));
  lantern.add(mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), mat(0xffe9a3, { emissive: 0xffb35a, emissiveIntensity: 1.2 }), 0, 0.32, 0, false));
  // fishing rod + line, shown while the line is cast
  const rig = new THREE.Group(); rig.visible = false; g.add(rig);
  const rodBase = V3(0.55, 0.72, -1.15), rodTip = V3(1.5, 2.45, -1.75);
  const rod = mesh(new THREE.CylinderGeometry(0.025, 0.045, 1.9, 5), woodM);
  rod.position.copy(rodBase).lerp(rodTip, 0.5);
  rod.quaternion.setFromUnitVectors(UP, rodTip.clone().sub(rodBase).normalize());
  rig.add(rod);
  const bobberHome = V3(1.55, 0.12, -3.15);
  const bobber = new THREE.Group(); bobber.position.copy(bobberHome); rig.add(bobber);
  bobber.add(mesh(new THREE.SphereGeometry(0.11, 7, 6), mat(0xe04a3a), 0, 0, 0, false));
  bobber.add(mesh(new THREE.SphereGeometry(0.11, 7, 6), mat(0xf3e9dc), 0, 0.09, 0, false));
  const line = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), mat(0xffffff, { transparent: true, opacity: 0.8 }), 0, 0, 0, false);
  rig.add(line);
  g.userData = { sail, flag, rig, bobber, bobberHome, rodTip, line };
  return g;
}

function makeBush() {
  const g = new THREE.Group();
  const leafDark = furM('bush-d', 0x26854c, ['#1c693a', '#359c5c', '#207542'], { n: 100, rMin: 1.2, rMax: 3 });
  const leafLight = mat(0x3cb568);
  g.add(mesh(new THREE.IcosahedronGeometry(0.68, 2), leafDark, 0, 0.48, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.5, 2), leafLight, 0.38, 0.4, 0.25, false));
  g.add(mesh(new THREE.IcosahedronGeometry(0.46, 2), leafDark, -0.35, 0.38, -0.22, false));
  const berries = new THREE.Group();
  const bm = mat(0xe63e52, { roughness: 0.35 });
  const flM = mat(0xfff4f8);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = 0.46 + (k % 2) * 0.14;
    berries.add(mesh(new THREE.SphereGeometry(0.11, 7, 6), bm, Math.cos(a) * r, 0.36 + (k % 3) * 0.18, Math.sin(a) * r, false));
    if (k % 3 === 0) berries.add(mesh(new THREE.DodecahedronGeometry(0.06, 0), flM, Math.cos(a + 0.4) * 0.55, 0.68, Math.sin(a + 0.4) * 0.55, false));
  }
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
  // barn — gambrel roof, timber trim, braced doors, lean-to, weather vane
  const barn = new THREE.Group();
  const barnRed = mat(0xc93a3a), barnTrim = mat(0xf3e9dc), roofM = mat(0x2f4f4a), darkM = mat(0x3a2a1c);
  barn.add(mesh(new THREE.BoxGeometry(4.8, 0.5, 5.6), mat(0x8d8d94), 0, 0.25, 0)); // stone foundation
  barn.add(mesh(new THREE.BoxGeometry(4.4, 2.6, 5.2), barnRed, 0, 1.8, 0)); // walls
  for (const [cx, cz] of [[-2.2, -2.6], [2.2, -2.6], [-2.2, 2.6], [2.2, 2.6]])
    barn.add(mesh(new THREE.BoxGeometry(0.28, 2.6, 0.28), barnTrim, cx, 1.8, cz, false)); // corner boards
  barn.add(mesh(new THREE.BoxGeometry(4.6, 0.22, 5.4), mat(0x7a5230), 0, 3.15, 0, false)); // wall plate
  // gambrel roof: steep lower pair + shallow upper pair, ridge along z
  const panel = (x0, y0, x1, y1, side) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const p = mesh(new THREE.BoxGeometry(len, 0.16, 5.9), roofM, (x0 + x1) / 2, (y0 + y1) / 2, 0);
    p.rotation.z = side * Math.atan2(Math.abs(x1 - x0), Math.abs(y1 - y0));
    barn.add(p);
  };
  panel(-2.55, 2.9, -1.35, 4.15, 1); panel(2.55, 2.9, 1.35, 4.15, -1);
  panel(-1.35, 4.15, 0, 4.95, 1); panel(1.35, 4.15, 0, 4.95, -1);
  barn.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 6.0), mat(0x7a5230), 0, 5.0, 0, false)); // ridge cap
  barn.add(mesh(new THREE.BoxGeometry(0.15, 1.8, 2.6), darkM, -2.2, 4.0, 0, false)); // shadowed gables
  barn.add(mesh(new THREE.BoxGeometry(0.15, 1.8, 2.6), darkM, 2.2, 4.0, 0, false));
  // round hayloft window above the doors
  barn.add(mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 12), barnTrim, 0, 4.1, 2.62, false));
  barn.add(mesh(new THREE.CircleGeometry(0.4, 12), darkM, 0, 4.1, 2.6, false));
  // double doors with X braces + stone step
  barn.add(mesh(new THREE.BoxGeometry(1.7, 2.2, 0.12), mat(0x7a5230), 0, 1.5, 2.62, false));
  for (const dx of [-0.42, 0.42]) {
    barn.add(mesh(new THREE.BoxGeometry(0.8, 2.0, 0.08), mat(0x9a3a2e), dx, 1.45, 2.68, false));
    for (const s of [0.45, -0.45]) {
      const brace = mesh(new THREE.BoxGeometry(0.12, 2.0, 0.05), mat(0x7a5230), dx, 1.45, 2.73, false);
      brace.rotation.z = s; barn.add(brace);
    }
  }
  barn.add(mesh(new THREE.BoxGeometry(1.8, 0.25, 0.6), mat(0x8d8d94), 0, 0.35, 3.0, false));
  // side lean-to with crates + barrel
  for (const pz of [-1.5, 0, 1.5])
    barn.add(mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), mat(0x7a5230), -3.3, 0.9, pz, false));
  const lean = mesh(new THREE.BoxGeometry(1.7, 0.12, 4.4), roofM, -3.0, 2.6, 0, false);
  lean.rotation.z = 0.35; barn.add(lean);
  barn.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(0x9a6b42), -3.0, 0.55, -1.2, false));
  barn.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x9a6b42), -2.9, 0.5, -0.4, false));
  barn.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.7, 9), mat(0x7a5230), -3.1, 0.6, 0.7, false));
  // weather vane (spins gently)
  barn.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), mat(0x3a3330), 0, 5.5, 0, false));
  const vane = new THREE.Group(); vane.position.set(0, 5.95, 0); barn.add(vane);
  vane.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), 0, 0, 0, false));
  vane.add(mesh(new THREE.ConeGeometry(0.09, 0.25, 6).rotateZ(-Math.PI / 2), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), 0.55, 0, 0, false));
  vane.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.22), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), -0.42, 0, 0, false));
  tickers.push((t) => { vane.rotation.y = Math.sin(t * 0.3) * 0.9 + t * 0.05; });
  occluders.push(put(barn, latC + 9, lonC - 6, 0, 0.6));
  // silo — banded tower, ladder, hatch, feed chute to the barn
  const silo = new THREE.Group();
  silo.add(mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.4, 12), mat(0x8d8d94), 0, 0.2, 0));
  silo.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 12), mat(0xcfd8dc), 0, 2.1, 0));
  for (const by of [1.2, 2.4, 3.6])
    silo.add(mesh(new THREE.TorusGeometry(1.12, 0.05, 5, 14).rotateX(Math.PI / 2), mat(0x7d848c), 0, by, 0, false));
  silo.add(mesh(new THREE.ConeGeometry(1.2, 1.2, 12), mat(0x90a4ae), 0, 4.8, 0));
  silo.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 8), mat(0x7d848c), 0, 5.5, 0, false)); // top hatch
  silo.add(mesh(new THREE.BoxGeometry(0.7, 1.0, 0.14), mat(0x7a5230), 0, 0.9, 1.12, false)); // base door
  for (const lx of [-0.2, 0.2]) // ladder rails
    silo.add(mesh(new THREE.BoxGeometry(0.06, 3.6, 0.06), mat(0x7a5230), lx, 2.4, 1.14, false));
  for (let k = 0; k < 6; k++)
    silo.add(mesh(new THREE.BoxGeometry(0.46, 0.06, 0.06), mat(0x7a5230), 0, 0.9 + k * 0.6, 1.14, false)); // rungs
  const chute = mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 8), mat(0x90a4ae), -1.4, 3.4, 0, false);
  chute.rotation.z = 0.9; silo.add(chute); // feed chute leaning barn-ward
  silo.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), mat(0x7a5230), -2.9, 1.3, 0, false)); // chute leg
  occluders.push(put(silo, latC + 9, lonC + 2, 0, 0));
  // windmill (animated Dutch-style mill)
  const mill = new THREE.Group();
  const stoneM = mat(0x9aa0a6), plasterM = mat(0xe8e2d4), timberM = mat(0x7a5230);
  const trimM = mat(0xc9573a), canvasM = mat(0xf5efdd, { side: THREE.DoubleSide });
  // stepped stone foundation + round stone base with arched door
  mill.add(mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.35, 12), stoneM, 0, 0.17, 0));
  mill.add(mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.3, 12), stoneM, 0, 0.95, 0));
  mill.add(mesh(new THREE.BoxGeometry(0.85, 1.0, 0.18), timberM, 0, 0.85, 1.58));
  mill.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10, 1, false, 0, Math.PI), timberM, 0, 1.35, 1.58, false));
  // tapered plaster tower with timber bands
  mill.add(mesh(new THREE.CylinderGeometry(0.85, 1.35, 5.2, 12), plasterM, 0, 4.1, 0));
  for (const [ry, rr] of [[2.2, 1.28], [3.9, 1.08], [5.4, 0.9]]) {
    const band = mesh(new THREE.TorusGeometry(rr, 0.06, 6, 14).rotateX(Math.PI / 2), timberM, 0, ry, 0, false);
    mill.add(band);
  }
  // little windows with cross frames up the tower
  for (const [wy, wr, wa] of [[3.0, 1.16, 0.5], [4.5, 0.99, 2.4], [5.8, 0.86, 4.2]]) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.55, 0.1), timberM, 0, 0, 0, false));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.42, 0.12), mat(0x2a3a4a), 0, 0, 0.01, false));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.13), timberM, 0, 0, 0.02, false));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 0.13), timberM, 0, 0, 0.02, false));
    g.position.set(Math.cos(wa) * wr, wy, Math.sin(wa) * wr);
    g.rotation.y = -wa + Math.PI / 2;
    mill.add(g);
  }
  // gallery deck with railing
  mill.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.14, 12), timberM, 0, 6.0, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mill.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 5), timberM, Math.cos(a) * 1.15, 6.32, Math.sin(a) * 1.15, false));
  }
  mill.add(mesh(new THREE.TorusGeometry(1.15, 0.045, 5, 14).rotateX(Math.PI / 2), timberM, 0, 6.6, 0, false));
  // yawing cap group: dome cap + rotor + tail beam turn together
  const capYaw = new THREE.Group(); capYaw.position.set(0, 6.75, 0); mill.add(capYaw);
  const dome = mesh(new THREE.SphereGeometry(1.05, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), trimM, 0, 0, 0);
  dome.scale.set(1, 0.85, 1); capYaw.add(dome);
  capYaw.add(mesh(new THREE.SphereGeometry(0.16, 7, 6), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), 0, 1.0, 0, false));
  // rotor: hub + 4 lattice sails with pitched canvas
  const rotor = new THREE.Group(); rotor.position.set(0, 0.25, 1.2); capYaw.add(rotor);
  const hub = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8).rotateX(Math.PI / 2), timberM, 0, 0, 0);
  rotor.add(hub);
  rotor.add(mesh(new THREE.ConeGeometry(0.28, 0.45, 8).rotateX(Math.PI / 2), trimM, 0, 0, 0.45, false));
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group(); holder.rotation.z = (i / 4) * Math.PI * 2; rotor.add(holder);
    holder.add(mesh(new THREE.BoxGeometry(0.16, 4.6, 0.16), timberM, 0, 2.1, 0)); // stock
    const sail = new THREE.Group(); sail.position.set(0.62, 2.6, 0); sail.rotation.y = 0.28; holder.add(sail); // pitched twist
    sail.add(mesh(new THREE.BoxGeometry(0.09, 3.1, 0.09), timberM, -0.55, 0, 0, false)); // outer frame bar
    for (let k = -1; k <= 1; k++)
      sail.add(mesh(new THREE.BoxGeometry(1.15, 0.09, 0.09), timberM, 0, k * 1.0, 0, false)); // lattice slats
    sail.add(mesh(new THREE.PlaneGeometry(1.15, 3.0), canvasM, 0, 0, -0.03, false)); // canvas sheet
  }
  // tail beam + ladder down the back
  const tail = mesh(new THREE.BoxGeometry(0.14, 0.14, 3.4), timberM, 0, -0.9, -2.2, false);
  tail.rotation.x = 0.5; capYaw.add(tail);
  // grain sacks + barrel by the door
  for (const [sx, sz, s] of [[-1.5, 1.9, 1], [-2.0, 1.4, 0.8]]) {
    const sack = mesh(new THREE.SphereGeometry(0.42, 7, 6), mat(0xe8c96a), sx, 0.32, sz, false);
    sack.scale.set(s, s * 0.75, s); mill.add(sack);
  }
  const barrel = mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 9), timberM, 1.7, 0.4, 1.6);
  mill.add(barrel);
  mill.add(mesh(new THREE.TorusGeometry(0.33, 0.03, 5, 10).rotateX(Math.PI / 2), mat(0x3a3330), 1.7, 0.62, 1.6, false));
  tickers.push((t, dt) => {
    rotor.rotation.z += dt * 0.9;
    capYaw.rotation.y = Math.sin(t * 0.12) * 0.35; // cap hunts the wind
  });
  occluders.push(put(mill, latC + 12, lonC + 9, 0, -0.5));
  // farmhouse — porch, chimney, shuttered glowing windows, flower bed
  const house = new THREE.Group();
  const houseWall = mat(0xf3e4c8), houseTrim = mat(0xf3e9dc);
  house.add(mesh(new THREE.BoxGeometry(3, 2.2, 3.4), houseWall, 0, 1.1, 0));
  house.add(mesh(new THREE.ConeGeometry(2.7, 1.6, 4), mat(0x7a8b6f), 0, 3.0, 0));
  house.add(mesh(new THREE.BoxGeometry(3.1, 0.18, 3.5), mat(0x8d8d94), 0, 0.09, 0, false)); // foundation skirt
  // porch: slab + posts + awning
  house.add(mesh(new THREE.BoxGeometry(3.2, 0.2, 1.2), mat(0x9a6b42), 0, 0.15, 2.2, false));
  for (const px of [-1.4, 1.4])
    house.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.1, 6), mat(0x7a5230), px, 1.2, 2.7, false));
  const awn = mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), mat(0xc9573a), 0, 2.35, 2.3, false);
  awn.rotation.x = -0.22; house.add(awn);
  house.add(mesh(new THREE.BoxGeometry(1.2, 0.18, 0.7), mat(0x8d8d94), 0, 0.3, 2.2, false)); // step
  // door + knob
  house.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), mat(0x7a5230), 0, 1.0, 1.72, false));
  house.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), 0.3, 1.0, 1.8, false));
  // shuttered windows with warm panes
  const paneM = mat(0xffe9a3, { emissive: 0xffb35a, emissiveIntensity: 0.85 });
  for (const wx of [-1.0, 1.0]) {
    house.add(mesh(new THREE.BoxGeometry(0.62, 0.72, 0.1), mat(0x7a5230), wx, 1.35, 1.71, false));
    house.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.12), paneM, wx, 1.35, 1.72, false));
    house.add(mesh(new THREE.BoxGeometry(0.3, 0.7, 0.08), mat(0x2f9e5f), wx - 0.48, 1.35, 1.7, false));
    house.add(mesh(new THREE.BoxGeometry(0.3, 0.7, 0.08), mat(0x2f9e5f), wx + 0.48, 1.35, 1.7, false));
  }
  // stone chimney + cap
  house.add(mesh(new THREE.BoxGeometry(0.5, 1.9, 0.5), mat(0x8d8d94), 0.9, 3.3, -0.8));
  house.add(mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), mat(0x6b7280), 0.9, 4.3, -0.8, false));
  // flower bed with blooms
  house.add(mesh(new THREE.BoxGeometry(2.0, 0.25, 0.6), mat(0x6b4423), 2.4, 0.15, 1.6, false));
  const bloomCols = [0xff8fb3, 0xffd23d, 0xffffff];
  for (let k = 0; k < 5; k++)
    house.add(mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(bloomCols[k % 3]), 1.7 + k * 0.35, 0.36, 1.6, false));
  occluders.push(put(house, latC - 9, lonC - 12, 0, 2.2));
  // tractor — hood, grille + headlights, exhaust, cab, fenders, hitch
  const tractor = new THREE.Group();
  const tractorGreen = mat(0x2fa05a), tractorDark = mat(0x26854a);
  tractor.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.1), tractorDark, 0, 0.72, 0)); // chassis
  tractor.add(mesh(new THREE.BoxGeometry(0.9, 0.62, 0.9), tractorGreen, -0.65, 1.15, 0)); // hood
  tractor.add(mesh(new THREE.BoxGeometry(0.12, 0.55, 0.85), mat(0x222222), -1.12, 1.1, 0, false)); // grille
  const lampM = mat(0xfff2c4, { emissive: 0xffd97a, emissiveIntensity: 0.7 });
  for (const lz of [-0.3, 0.3])
    tractor.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), lampM, -1.14, 1.32, lz, false)); // headlights
  tractor.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), mat(0x3a3330), -0.5, 1.75, 0.25, false)); // exhaust
  tractor.add(mesh(new THREE.ConeGeometry(0.09, 0.12, 6), mat(0x3a3330), -0.5, 2.22, 0.25, false)); // rain cap
  const steer = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), mat(0x3a3330), 0.1, 1.6, 0, false);
  steer.rotation.z = -0.5; tractor.add(steer); // steering column
  const wheel = mesh(new THREE.TorusGeometry(0.2, 0.045, 5, 10), mat(0x3a3330), -0.08, 1.85, 0, false);
  wheel.rotation.z = -0.5; wheel.rotation.y = Math.PI / 2; tractor.add(wheel);
  tractor.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), mat(0x4a3320), 0.55, 1.32, 0, false)); // seat
  tractor.add(mesh(new THREE.BoxGeometry(0.14, 0.5, 0.5), mat(0x4a3320), 0.8, 1.55, 0, false)); // backrest
  tractor.add(mesh(new THREE.BoxGeometry(1.1, 0.9, 1.05), tractorGreen, 0.55, 1.75, 0)); // cab shell
  tractor.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 1.07), mat(0x9fd4e8), 0.55, 1.95, 0, false)); // cab glass
  for (const fz of [-0.75, 0.75]) { // rear fenders
    const fender = mesh(new THREE.BoxGeometry(1.0, 0.1, 0.5), tractorDark, 0.8, 1.42, fz, false);
    fender.rotation.z = 0.12; tractor.add(fender);
  }
  tractor.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), mat(0x7a5230), 1.25, 0.6, 0, false)); // hitch bar
  const wg = new THREE.CylinderGeometry(0.65, 0.65, 0.42, 12); wg.rotateX(Math.PI / 2);
  const wm = mat(0x222222);
  for (const wz of [-0.75, 0.75]) {
    tractor.add(mesh(wg, wm, 0.8, 0.65, wz));
    tractor.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.44, 8).rotateX(Math.PI / 2), mat(0xe8c33d), 0.8, 0.65, wz, false)); // hubs
  }
  const wg2 = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 10); wg2.rotateX(Math.PI / 2);
  for (const wz of [-0.7, 0.7]) {
    tractor.add(mesh(wg2, wm, -0.8, 0.42, wz));
    tractor.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.38, 8).rotateX(Math.PI / 2), mat(0xe8c33d), -0.8, 0.42, wz, false));
  }
  put(tractor, latC + 5, lonC + 5, 0.1, 1.2);
  tickers.push((t) => { tractor.position.y += Math.sin(t * 20) * 0.0006; });
  // hay bales + haystack + loaded hay cart
  for (let i = 0; i < 4; i++) {
    const hay = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 9), mat(0xe8c96a));
    hay.rotation.z = Math.PI / 2;
    put(hay, latC + 6 + rand(-2, 2), lonC - 3 + rand(-2, 2), 0.7, rand(3));
  }
  {
    const stack = mesh(new THREE.ConeGeometry(1.15, 1.9, 9), mat(0xd9b95e), 0, 0, 0);
    put(stack, latC + 8, lonC - 5, 0.9, 0.4);
    put(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), mat(0x7a5230), 0, 0, 0, false), latC + 8, lonC - 5, 1.1, 0.2);
  }
  {
    // two-wheeled cart piled with hay
    const cart = new THREE.Group();
    const cartWood = mat(0x9a6b42);
    cart.add(mesh(new THREE.BoxGeometry(2.4, 0.22, 1.3), cartWood, 0, 0.95, 0));
    for (const [bx, bz] of [[-1.0, -0.55], [1.0, -0.55], [-1.0, 0.55], [1.0, 0.55]])
      cart.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), cartWood, bx, 1.3, bz, false));
    for (const wz of [-0.78, 0.78]) {
      cart.add(mesh(new THREE.TorusGeometry(0.68, 0.09, 6, 14), cartWood, 0, 0.68, wz, false)); // wheel discs face outward, axle along z
      cart.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8).rotateX(Math.PI / 2), mat(0x7a5230), 0, 0.68, wz, false));
      for (let s = 0; s < 3; s++) {
        const spoke = mesh(new THREE.BoxGeometry(0.07, 1.24, 0.07), mat(0x7a5230), 0, 0.68, wz, false);
        spoke.rotation.z = (s / 3) * Math.PI; cart.add(spoke);
      }
    }
    for (const hz of [-0.4, 0.4]) {
      const handle = mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), cartWood, -1.9, 0.7, hz, false);
      handle.rotation.z = -0.25; cart.add(handle);
    }
    for (const [hx, hy] of [[-0.5, 1.35], [0.4, 1.5], [-0.1, 1.7]]) {
      const blob = mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0xe8c96a), hx, hy, 0, false);
      blob.scale.set(1.2, 0.7, 0.9); cart.add(blob);
    }
    put(cart, latC + 7, lonC - 5.5, 0, 2.0);
  }
  // fences: railed sheep pen rectangle with a swinging gate
  const fenceM = mat(0xf1e8d5);
  const penLA = latC - 2, penLO = lonC - 8;
  {
    const pen = new THREE.Group();
    const HX = 2.5, HZ = 2.1; // half-extents in world units (~matches the old post layout)
    const post = (x, z, h = 1.1) => pen.add(mesh(new THREE.BoxGeometry(0.18, h, 0.18), fenceM, x, h / 2, z));
    const railX = (z, y) => pen.add(mesh(new THREE.BoxGeometry(HX * 2, 0.1, 0.08), fenceM, 0, y, z, false));
    const railZ = (x, y) => pen.add(mesh(new THREE.BoxGeometry(0.08, 0.1, HZ * 2), fenceM, x, y, 0, false));
    for (let x = -HX; x <= HX + 0.01; x += 1.0) { post(x, -HZ); post(x, HZ); }
    for (let z = -HZ + 1.0; z <= HZ - 1.0 + 0.01; z += 1.0) { post(-HX, z); post(HX, z); }
    for (const y of [0.45, 0.85]) { railX(-HZ, y); railX(HZ, y); railZ(-HX, y); railZ(HX, y); }
    // gate: taller posts + an open door on the +z side
    post(-0.7, HZ, 1.4); post(0.7, HZ, 1.4);
    const gate = mesh(new THREE.BoxGeometry(1.3, 0.85, 0.08), fenceM, 0, 0, 0, false);
    const gatePivot = new THREE.Group(); gatePivot.position.set(-0.7, 0, HZ);
    gate.position.set(0.65, 0.55, 0); gatePivot.add(gate);
    gatePivot.rotation.y = 0.7; pen.add(gatePivot);
    put(pen, penLA, penLO, 0.05, 0.3);
  }
  // sheep (shearable wool node — step 2; befriending comes in step 3)
  const sheepBodies = [];
  const sheepAnchor = latLonToVec3(penLA, penLO, heightFor(latLonToVec3(penLA, penLO, 0).normalize()) + 0.1);
  for (let i = 0; i < 4; i++) {
    const s = makeSheep();
    const p = sheepAnchor.clone().add(V3(rand(-2, 2), rand(0, 0.5), rand(-2, 2)));
    // re-project onto sphere
    const n = p.clone().normalize();
    orientOnSphere(s, n.clone().multiplyScalar(R + heightFor(n) + 0.02), rand(6));
    farmGroup.add(s);
    sheepBodies.push(s.userData.wool); // fleece group; scaled down while shorn
    const baseY = s.position.y;
    tickers.push((t, dt) => { s.position.y = baseY + Math.sin(t * 3 + i * 2) * 0.02; animateAnimal(s, t, 0.05, dt); });
  }
  // crop rows (interactive wonder)
  const cropGroup = new THREE.Group(); farmGroup.add(cropGroup);
  const soilM = mat(0x8a5a33), sproutM = mat(0x3fae4e), pumpkinM = mat(0xe07b2a);
  for (let r = 0; r < 4; r++) {
    const soil = mesh(new THREE.BoxGeometry(1.6, 0.25, 7), mat(0x6b4423), 0, 0, 0);
    for (const rx of [-0.5, 0, 0.5]) // raised ridges the rows grow on
      soil.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 6.8), soilM, rx, 0.2, 0, false));
    for (const ex of [-0.8, 0.8]) // bed edge boards
      soil.add(mesh(new THREE.BoxGeometry(0.1, 0.32, 7), mat(0x7a5230), ex, 0.05, 0, false));
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
  // scarecrow watching the rows (sways in the breeze)
  {
    const sc = new THREE.Group();
    const strawM = mat(0xe8c96a), patchM = mat(0x2f9e5f);
    sc.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4, 6), mat(0x7a5230), 0, 1.2, 0));
    sc.add(mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), mat(0x7a5230), 0, 1.75, 0, false));
    sc.add(mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), patchM, 0, 1.35, 0, false));
    sc.add(mesh(new THREE.BoxGeometry(0.72, 0.3, 0.42), mat(0xc9573a), 0, 1.15, 0, false)); // patch
    sc.add(mesh(new THREE.SphereGeometry(0.3, 8, 7), mat(0xe8c98a), 0, 2.15, 0, false)); // burlap head
    sc.add(mesh(new THREE.ConeGeometry(0.42, 0.35, 8), strawM, 0, 2.5, 0, false)); // straw hat
    for (const hx of [-0.85, 0.85])
      sc.add(mesh(new THREE.ConeGeometry(0.12, 0.35, 5), strawM, hx, 1.75, 0, false)); // straw hands
    put(sc, latC - 5.5, lonC + 5, 0, 0.7);
    tickers.push((t) => { sc.rotation.z = Math.sin(t * 1.3) * 0.05; });
  }
  // water trough by the pen
  {
    const tr = new THREE.Group();
    tr.add(mesh(new THREE.BoxGeometry(1.8, 0.45, 0.7), mat(0x7a5230), 0, 0.45, 0));
    for (const [lx, lz] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]])
      tr.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat(0x5a3d22), lx, 0.17, lz, false));
    tr.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), mat(0x4fc3d8, { roughness: 0.2 }), 0, 0.62, 0, false));
    put(tr, penLA + 5.5, penLO + 2.5, 0, 0.4);
  }
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
      lat: 5, lon: 38, kind: 'GATHER', tool: null, stock: 2, respawn: 60, shakeRoot: bush,
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
  // painted farm sign by the path
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#8a6238'; cx.fillRect(0, 0, 256, 128);
    cx.strokeStyle = '#5a3d22'; cx.lineWidth = 10; cx.strokeRect(6, 6, 244, 116);
    cx.fillStyle = '#f3e9dc'; cx.font = 'bold 40px Georgia, serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('CLOVER', 128, 42); cx.fillText('FIELDS', 128, 86);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Group();
    for (const px of [-0.9, 0.9])
      sign.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.8, 6), mat(0x7a5230), px, 0.9, 0));
    sign.add(mesh(new THREE.BoxGeometry(2.3, 1.15, 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 2.0, 0, false));
    sign.add(mesh(new THREE.ConeGeometry(1.35, 0.35, 4), mat(0x7a8b6f), 0, 2.75, 0, false));
    put(sign, latC + 5, lonC - 10, 0, 0.9);
  }
  // porch-style lamp glowing over the farmyard at night
  {
    const lamp = new THREE.Group();
    lamp.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.7, 6), mat(0x4a3320), 0, 1.35, 0));
    lamp.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), mat(0x4a3320), 0, 2.7, 0, false));
    lamp.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34),
      mat(0xffe9a3, { emissive: 0xffb35a, emissiveIntensity: 1.4 }), 0, 2.4, 0, false));
    lamp.add(mesh(new THREE.ConeGeometry(0.32, 0.25, 6), mat(0x4a3320), 0, 2.72, 0, false));
    const li = new THREE.PointLight(0xffc93d, 6, 13);
    li.position.set(0, 2.4, 0); lamp.add(li);
    nightLights.push({ l: li, base: 6 });
    put(lamp, latC + 3.5, lonC - 7.5, 0, 0);
  }
  // little orchard south of the farmhouse
  for (const [ola, olo] of [[-4, -13], [-2, -15], [-4, -14]]) {
    const tree = makeOrchardTree(0xe04a3a);
    const placed = put(tree, latC + ola, lonC + olo, 0, rand(3));
    addChoppableTree(placed, latC + ola, lonC + olo, 'Apple Tree');
  }
  // pear and plum rows continue the orchard toward the south pasture
  for (const [ola, olo, fruit] of [
    [-6, -10, 0xe8c96a], [-7, -12, 0xe8c96a], [-2, -9, 0xd97a9a],
    [-3, -11, 0xd97a9a], [-8, -7, 0xe8c96a], [-6, -5, 0xd97a9a],
  ]) {
    const tree = makeOrchardTree(fruit);
    const placed = put(tree, latC + ola, lonC + olo, 0, rand(3));
    addChoppableTree(placed, latC + ola, lonC + olo, fruit === 0xe8c96a ? 'Pear Tree' : 'Plum Tree');
  }
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
    addChoppableTree(o, la, lo);
  }
  for (let i = 0; i < 12; i++) {
    const la = latC - 8 + rand(-8, 8), lo = lonC + 6 + rand(-8, 8);
    if (nearFire(la, lo)) continue;
    const base = latLonToVec3(la, lo, 0);
    const o = makeTree(rand(1.8, 3));
    orientOnSphere(o, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    g.add(o);
    addChoppableTree(o, la, lo);
  }
  // camp-clearing pines (shake per hit, keel over when felled)
  for (const [la, lo] of [[16, 152], [10, 153], [17, 161], [9, 162]]) {
    const tree = makeTree(3);
    put(tree, la, lo, 0, rand(3));
    addChoppableTree(tree, la, lo);
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
  // fox (trots a wander loop, sniffs, flicks its brush)
  const fox = new THREE.Group();
  {
    const foxM = furM('fox', 0xe07b2a, ['#c85f14', '#f0a04e', '#ffffff'], { n: 150, rMin: 1.2, rMax: 2.8 });
    const whiteM = mat(0xf3e9dc), darkM = mat(0x33291f);
    const body = new THREE.Group(); body.position.set(0, 0.62, 0); fox.add(body);
    const torso = mesh(new THREE.SphereGeometry(0.3, 12, 9), foxM, 0, 0, 0);
    torso.scale.set(1.65, 0.85, 0.95); body.add(torso);
    body.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), whiteM, 0.3, -0.12, 0, false)); // white bib
    const head = new THREE.Group(); head.position.set(0.62, 0.12, 0); body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.24, 12, 9), foxM, 0, 0.05, 0));
    const snout = mesh(new THREE.ConeGeometry(0.13, 0.36, 7), foxM, 0.24, -0.02, 0, false);
    snout.rotation.z = -Math.PI / 2; head.add(snout);
    head.add(mesh(new THREE.SphereGeometry(0.055, 7, 6), darkM, 0.42, -0.03, 0, false));
    for (const sx of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), foxM, -0.04, 0.28, sx * 0.13, false);
      ear.rotation.z = -0.18; ear.rotation.x = -sx * 0.24; head.add(ear);
      const inner = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), darkM, -0.02, 0.25, sx * 0.13, false);
      inner.rotation.z = -0.18; inner.rotation.x = -sx * 0.24; head.add(inner);
      head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(0x1a1512), 0.15, 0.07, sx * 0.11, false));
    }
    const tail = new THREE.Group(); tail.position.set(-0.52, -0.05, 0); body.add(tail);
    const t1 = mesh(new THREE.ConeGeometry(0.16, 0.42, 7), foxM, -0.16, 0, 0, false);
    t1.rotation.z = Math.PI / 2; tail.add(t1);
    const tip = mesh(new THREE.ConeGeometry(0.12, 0.36, 7), whiteM, -0.46, 0.03, 0, false);
    tip.rotation.z = Math.PI / 2; tail.add(tip);
    const legs = [];
    for (const [lx, lz] of [[0.3, -0.16], [0.3, 0.16], [-0.3, -0.16], [-0.3, 0.16]]) {
      const hip = new THREE.Group(); hip.position.set(lx, 0.46, lz);
      hip.add(mesh(new THREE.BoxGeometry(0.1, 0.36, 0.1), foxM, 0, -0.18, 0, false));
      hip.add(mesh(new THREE.BoxGeometry(0.11, 0.09, 0.14), darkM, 0, -0.34, 0.02, false)); // black sock
      fox.add(hip); legs.push(hip);
    }
    fox.userData.anim = {
      legs, head, tail, body, legAxis: 'z', headAxis: 'z',
      bodyBob: 0.03, cadence: 10, amp: 0.55, graze: 0.3, grazeSpeed: 1.1, headDrop: 0.05, tailAmp: 0.45, tailSpeed: 3,
    };
  }
  put(fox, latC - 1, lonC - 8, 0.2, 1.5);
  const foxHome = fox.position.clone();
  tickers.push((t, dt) => {
    // wander loop: figure-eight drift with a little bounce, nose into the turn
    fox.position.copy(foxHome).add(V3(Math.sin(t * 0.7) * 0.8, Math.abs(Math.sin(t * 4)) * 0.15, Math.cos(t * 0.5) * 0.8));
    const vx = Math.cos(t * 0.7) * 0.56, vz = -Math.sin(t * 0.5) * 0.4;
    fox.rotation.y = Math.atan2(-vz, vx);
    animateAnimal(fox, t, 1, dt);
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
// Turn the bear's heading toward a target at a capped angular speed (rad/s).
// Lerping unit vectors straight to a new target snapped ~180° turns at up to
// 10 rad/s, which read as jitter; a capped pivot looks like a real heavy bear.
function bearTurnToward(b, dir, dt, maxRate) {
  const n = b.pos.clone().normalize();
  const cur = b.facing.clone().addScaledVector(n, -b.facing.dot(n));
  const tgt = dir.clone().addScaledVector(n, -dir.dot(n));
  if (cur.lengthSq() < 1e-6 || tgt.lengthSq() < 1e-6) return;
  cur.normalize(); tgt.normalize();
  const sin = new THREE.Vector3().crossVectors(cur, tgt).dot(n);
  const cos = THREE.MathUtils.clamp(cur.dot(tgt), -1, 1);
  let ang = Math.atan2(sin, cos);
  const cap = maxRate * dt;
  if (ang > cap) ang = cap; else if (ang < -cap) ang = -cap;
  b.facing.copy(cur).applyAxisAngle(n, ang);
  b.facing.addScaledVector(n, -b.facing.dot(n));
  if (b.facing.lengthSq() > 1e-6) b.facing.normalize();
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
    const sBaseY = s.position.y;
    tickers.push((t) => { s.position.y = sBaseY + Math.sin(t * 2 + i * 3) * 0.03; });
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
  scatterOnSphere(g, 46, 135, 6, 22, () => makeTree(rand(2, 3.4)), addChoppableTree);
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
  for (let i = 0, placed = 0; i < 70 && placed < 20; i++) {
    const la = 14 + rand(-12, 12), lo = 285 + rand(-12, 12);
    if (Math.hypot(la - 14, lo - 279) < 6 || Math.hypot(la - 13, lo - 277) < 4) continue;
    const base = latLonToVec3(la, lo, 0);
    const o = makePalm();
    orientOnSphere(o, latLonToVec3(la, lo, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    g.add(o); placed++;
    addChoppableTree(o, la, lo, 'Palm', 0x2f9e5f);
  }
  // camp-clearing palms (shake per hit, keel over when felled)
  for (const [la, lo] of [[11, 281], [16, 283], [9, 276]]) {
    const palm = makePalm();
    put(palm, la, lo, 0, rand(3));
    addChoppableTree(palm, la, lo, 'Palm', 0x2f9e5f);
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
  // crabs (scuttle sideways, snap pincers, wiggle eye stalks)
  for (let i = 0; i < 3; i++) {
    const crab = new THREE.Group();
    const crabM = furM('crab', 0xe04a3a, ['#c23a2c', '#f06a52'], { n: 130, rMin: 1, rMax: 2.6 });
    const crabDark = mat(0xa83226);
    const shell = mesh(new THREE.SphereGeometry(0.34, 12, 9), crabM, 0, 0.24, 0);
    shell.scale.set(1.15, 0.62, 1.0); crab.add(shell);
    const belly = mesh(new THREE.SphereGeometry(0.24, 10, 8), crabDark, 0, 0.18, 0.26);
    belly.scale.set(0.9, 0.5, 1.3); crab.add(belly);
    const stalks = [];
    for (const sx of [-1, 1]) {
      const st = new THREE.Group(); st.position.set(sx * 0.12, 0.34, 0.22);
      st.rotation.z = -sx * 0.25;
      st.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), crabM, 0, 0.08, 0, false));
      st.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0x241d1a), 0, 0.17, 0, false));
      crab.add(st); stalks.push({ st, sx });
    }
    // four jointed legs per side
    const legs = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.16, 0.2, 0.18 - k * 0.13);
      hip.rotation.z = -sx * 0.9;
      hip.add(mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), crabM, sx * 0.13, 0, 0, false));
      const knee = new THREE.Group(); knee.position.x = sx * 0.26; knee.rotation.z = -sx * 0.85; hip.add(knee);
      knee.add(mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), crabM, sx * 0.11, 0, 0, false));
      knee.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 5), crabDark, sx * 0.26, -0.02, 0, false));
      crab.add(hip); legs.push({ hip, sx, ph: k * 1.4 });
    }
    // two hinged pincers up front
    const claws = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 0.2, 0.2, 0.34);
      arm.rotation.z = -sx * 0.5; arm.rotation.y = -sx * 0.5;
      arm.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), crabM, sx * 0.1, 0, 0, false));
      const pincer = new THREE.Group(); pincer.position.x = sx * 0.2; arm.add(pincer);
      const tg = new THREE.Group(); tg.position.set(sx * 0.02, 0.03, 0);
      tg.add(mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), crabM, sx * 0.09, 0, 0, false));
      const bg = new THREE.Group(); bg.position.set(sx * 0.02, -0.03, 0);
      bg.add(mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), crabDark, sx * 0.09, 0, 0, false));
      pincer.add(tg, bg);
      crab.add(arm); claws.push({ tg, bg, pincer, sx });
    }
    put(crab, rand(-2, 6), rand(282, 292), 0.15, rand(3));
    const home = crab.position.clone();
    const legsFixed = legs.map((L) => ({ ...L, z: L.hip.rotation.z }));
    tickers.push((t) => {
      crab.position.copy(home).add(V3(Math.sin(t + i * 2) * 0.5, Math.abs(Math.sin(t * 6 + i)) * 0.06, 0));
      for (const L of legsFixed) { // sideways gait ripple
        L.hip.rotation.y = Math.sin(t * 9 + L.ph + i * 2) * 0.3;
        L.hip.rotation.z = L.z - L.sx * Math.abs(Math.cos(t * 9 + L.ph + i * 2)) * 0.1;
      }
      const snap = Math.pow(Math.max(0, Math.sin(t * 1.6 + i * 3)), 10);
      for (const c of claws) {
        c.tg.rotation.z = c.sx * snap * 0.45;
        c.bg.rotation.z = -c.sx * snap * 0.45;
        c.pincer.rotation.y = Math.sin(t * 1.6 + i) * 0.2;
      }
      for (const s of stalks) s.st.rotation.x = Math.sin(t * 3 + i * 2 + s.sx) * 0.18;
    });
  }
  lagoonCenter = latLonToVec3(-14, 288, 0.4);
  // trail from the beach to the southern shore where the sea skiff is moored
  steppingStones([[10, 282], [8, 284], [6, 286], [4, 288], [0, 288], [-4, 288], [-8, 288], [-12, 288], [-16, 288]], 0xffffff, 0.35);
}

// ---------- SEA SKIFF: a usable boat on the southern shore ----------
const SKIFF_SPAWN = { lat: -20.2, lon: 290 };
const SKIFF_SPAWN_N = latLonToVec3(SKIFF_SPAWN.lat, SKIFF_SPAWN.lon, 0).normalize();
const SKIFF_SPAWN_HEADING = latLonToVec3(-23, SKIFF_SPAWN.lon, 0)
  .sub(latLonToVec3(SKIFF_SPAWN.lat, SKIFF_SPAWN.lon, 0));
SKIFF_SPAWN_HEADING.addScaledVector(SKIFF_SPAWN_N, -SKIFF_SPAWN_HEADING.dot(SKIFF_SPAWN_N)).normalize();
let boatN = SKIFF_SPAWN_N.clone();
let boatHeading = SKIFF_SPAWN_HEADING.clone();
let inBoat = false;
const boatGroup = makeSkiff();
boatGroup.name = 'sea-skiff';
scene.add(boatGroup);
{
  // wooden pier + sign guiding the player off the beach and onto the water
  const dock = new THREE.Group();
  const dockM = mat(0x9a6b42), dockDark = mat(0x6e4e2c);
  for (let i = 0; i < 5; i++)
    dock.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 0.62), dockM, 0, 0, i * 0.68));
  for (const sx of [-0.58, 0.58]) for (let i = 0; i < 5; i += 2)
    dock.add(mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), dockDark, sx, -0.42, i * 0.68 + 0.15, false));
  const dockN = latLonToVec3(-18.4, 288, 0).normalize();
  const dockPos = dockN.clone().multiplyScalar(R + 0.34);
  const dockDir = latLonToVec3(-22, 288, 0).sub(latLonToVec3(-18.4, 288, 0));
  faceAlong(dock, dockPos, dockDir.normalize());
  dock.position.copy(dockPos);
  scene.add(dock);

  const sign = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 112;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#6e4e2c'; cx.fillRect(0, 0, 256, 112);
  cx.strokeStyle = '#3d2a18'; cx.lineWidth = 10; cx.strokeRect(5, 5, 246, 102);
  cx.fillStyle = '#f3e9dc'; cx.font = 'bold 31px Georgia, serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('SEA SKIFF', 128, 42); cx.font = 'bold 22px Inter, sans-serif'; cx.fillText('SOUTH SHORE', 128, 80);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  sign.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.7, 6), dockDark, 0, 0.85, 0));
  sign.add(mesh(new THREE.BoxGeometry(2.1, 0.95, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 1.65, 0, false));
  const signN = latLonToVec3(-15.2, 288, 0).normalize();
  const signPos = signN.clone().multiplyScalar(R + heightFor(signN) + 0.08);
  const signDir = latLonToVec3(-14, 288, 0).sub(latLonToVec3(-15.2, 288, 0));
  faceAlong(sign, signPos, signDir.normalize());
  sign.position.copy(signPos);
  scene.add(sign);
}

function nearestLand(posN, reach = 6.5) {
  const n = posN.clone().normalize();
  const east = V3(-n.z, 0, n.x);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(n, east).normalize();
  let best = null, bestD = reach / R;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const dir = east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
    const p = n.clone().addScaledVector(dir, reach / R).normalize();
    if (heightFor(p) >= 0.12) {
      const d = n.angleTo(p);
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  if (!best) return null;
  return best.multiplyScalar(R + heightFor(best) + 0.1);
}
function boatBob(t) {
  return Math.sin(t * 1.3) * 0.045 + Math.sin(t * 0.7 + 1) * 0.02;
}
function updateBoatVisual(t) {
  const bob = boatBob(t);
  const pos = boatN.clone().multiplyScalar(R + 0.02 + bob);
  boatGroup.position.copy(pos);
  faceAlong(boatGroup, pos, boatHeading);
  boatGroup.rotateZ(Math.sin(t * 1.1) * 0.025);
  boatGroup.rotateX(Math.sin(t * 0.9 + 1) * 0.012);
  const u = boatGroup.userData;
  const fishing = inBoat && fishStage === 1;
  if (u.rig) {
    u.rig.visible = fishing;
    if (fishing) {
      const bobber = u.bobberHome.clone();
      bobber.y += Math.sin(t * 5) * 0.04 - 0.02;
      u.bobber.position.copy(bobber);
      const a = u.rodTip, b = bobber;
      u.line.position.copy(a).lerp(b, 0.5);
      u.line.scale.y = Math.max(0.01, a.distanceTo(b));
      u.line.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    }
  }
  if (u.sail) u.sail.scale.x = 1 + Math.sin(t * 2.2) * 0.03;
  if (u.flag) u.flag.rotation.y = Math.sin(t * 3.2) * 0.16;
  boatInteract.pos.copy(pos);
}
function boardBoat() {
  if (inBoat || playerDead) return;
  inBoat = true;
  fishStage = 0;
  player.visible = false;
  player.position.copy(boatN).multiplyScalar(R + 0.64 + boatBob(clock.elapsedTime));
  playerPos.copy(player.position);
  facing.copy(boatHeading);
  moveDirSmooth.copy(boatHeading);
  lastBehind.copy(boatHeading);
  moveTargetN = null;
  playerVel = 0; hopH = 0;
  burst(player.position.clone(), 0x9fdcff, 12, 1.5);
  chime(520);
  toast('⛵ Aboard the skiff — WASD to sail, Q to trim, E to fish or dock.');
}
function leaveBoat() {
  if (!inBoat) return;
  const land = nearestLand(boatN);
  if (!land) return toast('🌊 Too deep — sail closer to shore to step off.');
  inBoat = false;
  fishStage = 0;
  player.visible = true;
  const n = land.clone().normalize();
  playerPos.copy(n).multiplyScalar(R + heightFor(n) + 0.1);
  player.position.copy(playerPos);
  const dir = land.clone().sub(boatGroup.position);
  dir.addScaledVector(n, -dir.dot(n));
  if (dir.lengthSq() > 1e-6) { facing.copy(dir.normalize()); moveDirSmooth.copy(facing); lastBehind.copy(facing); }
  moveTargetN = null;
  burst(player.position.clone(), 0x9fdcff, 10, 1.2);
  chime(500);
  toast('⛵ Tied up. The skiff waits by the shore.');
}
function boatUse() {
  if (playerDead) return;
  if (!inBoat) return boardBoat();
  if (fishStage === 1) return fishFrom('sea');
  if (nearestLand(boatN)) return leaveBoat();
  fishFrom('sea');
}
function restoreBoatState(b) {
  boatN.copy(SKIFF_SPAWN_N);
  boatHeading.copy(SKIFF_SPAWN_HEADING);
  if (b && Array.isArray(b.pos)) {
    const n = V3().fromArray(b.pos);
    if (Number.isFinite(n.x) && n.lengthSq() > 0.5) {
      n.normalize();
      if (heightFor(n) < 0.12) boatN.copy(n);
    }
  }
  if (b && Array.isArray(b.heading)) {
    const h = V3().fromArray(b.heading);
    h.addScaledVector(boatN, -h.dot(boatN));
    if (h.lengthSq() > 1e-6) boatHeading.copy(h.normalize());
  }
  inBoat = !!(b && b.inBoat);
  if (b && b.fishSource) fishSource = b.fishSource;
  player.visible = !inBoat;
  if (inBoat) {
    player.position.copy(boatN).multiplyScalar(R + 0.64 + boatBob(clock.elapsedTime));
    playerPos.copy(player.position);
    facing.copy(boatHeading); moveDirSmooth.copy(boatHeading); lastBehind.copy(boatHeading);
  }
}
const boatInteract = {
  id: 'skiff', pos: boatGroup.position.clone(), radius: 5.2, kind: '⛵ SEA SKIFF',
  label: () => {
    if (!inBoat) return 'Board the sea skiff';
    if (fishStage === 1) return 'Reel in the line';
    return nearestLand(boatN) ? 'Step ashore' : 'Cast a line';
  },
  onUse: boatUse,
};
addInteract(boatInteract);

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
  // heat-hardy acacias around the green secret
  for (const [la, lo] of [[16, 100], [13, 121], [7, 98], [5, 122], [17, 112], [2, 103]]) {
    const tree = makeAcacia(rand(2.8, 4.0));
    put(tree, la, lo, 0, rand(3));
    addChoppableTree(tree, la, lo, 'Acacia', 0xd9b166);
  }
  // red tent
  put(mesh(new THREE.ConeGeometry(1.7, 2.0, 4), mat(0xc9573a), 0, 1.0, 0), latC + 2, lonC + 7, 0, 0.4);
  // camel (living amble: loops the oasis, sways its neck, flicks ears and tail)
  const camel = new THREE.Group();
  camel.name = 'camel';
  const camelM = furM('camel', 0xd9a95e, ['#d9a95e', '#e8c68c', '#c9974f'], { n: 180, rMin: 1.2, rMax: 3.2 });
  const camelPale = furM('camelPale', 0xe8d2a8, ['#e8d2a8', '#f2e3c4', '#d8bd8f'], { n: 130, rMin: 1.2, rMax: 3 });
  const camelDark = mat(0x7d5730);
  const camelBlanket = mat(0xb7432f);
  const camelTrim = mat(0x2f8f7c);
  const camelTorso = new THREE.Group(); camel.add(camelTorso);
  // barrel body with chest, rump and a soft belly (replaces the old box)
  const camelBody = mesh(new THREE.SphereGeometry(1, 12, 9), camelM, 0, 1.42, 0);
  camelBody.scale.set(0.95, 0.5, 0.44);
  camelTorso.add(camelBody);
  const camelChest = mesh(new THREE.SphereGeometry(0.5, 10, 8), camelM, 0.68, 1.32, 0);
  camelChest.scale.set(0.9, 0.95, 0.85); camelTorso.add(camelChest);
  const camelRump = mesh(new THREE.SphereGeometry(0.47, 10, 8), camelM, -0.74, 1.38, 0);
  camelRump.scale.set(0.92, 0.9, 0.82); camelTorso.add(camelRump);
  camelTorso.add(mesh(new THREE.SphereGeometry(0.32, 9, 7), camelPale, 0.1, 1.12, 0, false)); // belly
  // dromedary hump under a draped saddle cloth with a woven girth band
  const camelHump = mesh(new THREE.SphereGeometry(0.52, 12, 9), camelM, -0.15, 2.0, 0);
  camelHump.scale.set(1.0, 1.05, 0.66); camelTorso.add(camelHump);
  const camelBlanketMesh = mesh(new THREE.SphereGeometry(0.53, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.2), camelBlanket, -0.15, 1.99, 0, false);
  camelBlanketMesh.scale.set(1.0, 1.04, 0.68); camelTorso.add(camelBlanketMesh);
  const camelGirth = mesh(new THREE.TorusGeometry(0.36, 0.03, 5, 14), camelTrim, -0.15, 1.94, 0, false);
  camelGirth.rotation.x = Math.PI / 2; camelGirth.scale.set(1.02, 0.66, 1); camelTorso.add(camelGirth);
  // two-segment neck, curving up and forward like the real animal
  const camelNeck = new THREE.Group();
  camelNeck.position.set(0.98, 1.72, 0);
  camelTorso.add(camelNeck);
  camelNeck.add(mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.78, 8), camelM, 0, 0.39, 0));
  camelNeck.add(mesh(new THREE.SphereGeometry(0.22, 9, 7), camelM, 0, 0.02, 0, false)); // shoulder ruff
  const shag = mesh(new THREE.ConeGeometry(0.13, 0.34, 6), camelPale, 0.02, 0.18, 0, false); // throat mane
  shag.rotation.z = Math.PI;
  camelNeck.add(shag);
  const camelNeckUp = new THREE.Group();
  camelNeckUp.position.set(0, 0.76, 0);
  camelNeckUp.rotation.z = -0.45;
  camelNeck.add(camelNeckUp);
  camelNeckUp.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.56, 8), camelM, 0, 0.28, 0));
  const camelHead = new THREE.Group();
  camelHead.position.set(0, 0.56, 0);
  camelHead.rotation.z = 0.75; // level the skull after the neck lean
  camelHead.scale.setScalar(1.12);
  camelNeckUp.add(camelHead);
  const camelSkull = mesh(new THREE.SphereGeometry(0.24, 10, 8), camelM, 0.02, 0.02, 0);
  camelSkull.scale.set(1.35, 1.05, 0.95); camelHead.add(camelSkull);
  camelHead.add(mesh(new THREE.BoxGeometry(0.4, 0.22, 0.24), camelM, 0.32, -0.04, 0)); // muzzle
  camelHead.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.22), camelPale, 0.35, -0.15, 0, false)); // lower lip
  camelHead.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), camelM, 0.5, -0.02, 0, false)); // soft nose
  camelHead.add(mesh(new THREE.BoxGeometry(0.05, 0.28, 0.28), camelTrim, 0.36, -0.02, 0, false)); // halter
  const camelEyes = [];
  const camelEars = [];
  for (const sz of [-1, 1]) {
    camelHead.add(mesh(new THREE.SphereGeometry(0.024, 6, 5), camelDark, 0.57, 0.0, sz * 0.11, false)); // nostril
    const eye = mesh(new THREE.SphereGeometry(0.05, 8, 6), camelDark, 0.12, 0.13, sz * 0.2, false);
    camelHead.add(eye); camelEyes.push(eye);
    camelHead.add(mesh(new THREE.SphereGeometry(0.065, 7, 5), camelM, 0.12, 0.19, sz * 0.2, false)); // brow
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.19, 6), camelM, -0.17, 0.26, sz * 0.16, false);
    ear.rotation.z = sz * 0.3; ear.rotation.x = sz * 0.35;
    camelHead.add(ear); camelEars.push(ear);
  }
  // jointed legs: thigh, knee callus, cannon, fetlock and a broad two-toed foot
  const camelLegs = [];
  for (const [lx, lz] of [[0.68, 0.27], [-0.68, 0.27], [0.68, -0.27], [-0.68, -0.27]]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.3, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.6, 7), camelM, 0, -0.3, 0));
    hip.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), camelM, 0, -0.03, 0, false)); // haunch
    const knee = new THREE.Group();
    knee.position.set(0, -0.6, 0);
    hip.add(knee);
    knee.add(mesh(new THREE.SphereGeometry(0.085, 7, 5), camelDark, 0, 0, 0, false)); // knee callus
    knee.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.58, 6), camelM, 0, -0.29, 0));
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.58, 0);
    knee.add(ankle);
    ankle.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), camelM, 0, 0, 0, false));
    for (const s of [-1, 1]) {
      ankle.add(mesh(new THREE.SphereGeometry(0.075, 7, 5), camelDark, 0.04, -0.06, s * 0.055, false));
    }
    camel.add(hip);
    hip.userData = { camelLeg: true, side: lz > 0 ? 0 : 1, knee, ankle };
    camelLegs.push({ hip, knee, ankle, side: lz > 0 ? 0 : 1 });
  }
  const camelTail = new THREE.Group();
  camelTail.position.set(-0.98, 1.6, 0);
  camelTorso.add(camelTail);
  camelTail.add(mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.62, 6), camelM, 0, -0.3, 0, false));
  camelTail.add(mesh(new THREE.SphereGeometry(0.075, 7, 5), camelDark, 0, -0.64, 0, false)); // tuft
  const camelBodyScale = camelBody.scale.clone();
  put(camel, latC - 2, lonC - 6, 0, 1.2);
  window.__camel = camel;
  // slow looping amble around the oasis
  const camelHome = camel.position.clone();
  const camelA = V3(1, 0, 0).applyQuaternion(camel.quaternion).normalize();
  const camelB = V3(0, 0, 1).applyQuaternion(camel.quaternion).normalize();
  const camelM4 = new THREE.Matrix4();
  const camelPh = rand(Math.PI * 2);
  const camelEyeBase = camelEyes.map((e) => e.scale.y);
  const camelEarBase = camelEars.map((e) => e.rotation.z);
  tickers.push((t) => {
    const a = t * 0.42;
    const sa = Math.sin(a), ca = Math.cos(a);
    const n = camelHome.clone()
      .addScaledVector(camelA, sa * 1.15)
      .addScaledVector(camelB, (1 - ca) * 1.15)
      .normalize();
    camel.position.copy(n).multiplyScalar(R + heightFor(n) + 0.05);
    const fwd = camelA.clone().multiplyScalar(ca).addScaledVector(camelB, sa);
    fwd.addScaledVector(n, -fwd.dot(n));
    if (fwd.lengthSq() > 1e-6) {
      fwd.normalize();
      const side = V3().crossVectors(fwd, n).normalize();
      camelM4.makeBasis(fwd, n, side);
      camel.quaternion.setFromRotationMatrix(camelM4);
    }
    const gait = a * 11;
    for (const L of camelLegs) {
      const ph = gait + (L.side ? Math.PI : 0);
      const stride = Math.sin(ph);
      const swing = Math.max(0, Math.cos(ph));
      // rotate about Z: the hoof strides forward along +X, never out sideways
      L.hip.rotation.z = stride * 0.34;
      L.knee.rotation.z = -swing * 0.55;
      L.ankle.rotation.z = swing * 0.3;
    }
    camelTorso.position.y = Math.abs(Math.sin(gait)) * 0.035;
    camelTorso.rotation.x = Math.sin(gait) * 0.022; // gentle roll with the pace
    camelBody.scale.set(camelBodyScale.x, camelBodyScale.y * (1 + Math.sin(t * 1.4 + camelPh) * 0.02), camelBodyScale.z);
    camelNeck.rotation.z = -0.5 + Math.sin(t * 0.9 + camelPh) * 0.05;
    camelNeck.rotation.y = Math.sin(t * 0.55 + camelPh) * 0.14;
    camelHead.rotation.y = Math.sin(t * 0.7 + camelPh * 1.7) * 0.2;
    camelHead.rotation.z = 0.75 + Math.sin(t * 2.2 + camelPh) * 0.03;
    const blink = ((t * 0.35 + camelPh) % 1) < 0.035 ? 0.12 : 1;
    camelEyes.forEach((e, i) => (e.scale.y = camelEyeBase[i] * blink));
    camelEars.forEach((e, i) => (e.rotation.z = camelEarBase[i] + Math.max(0, Math.sin(t * 1.7 + camelPh + i * 2)) * 0.2));
    camelTail.rotation.z = Math.sin(t * 2.1 + camelPh) * 0.4;
    camelTail.rotation.x = Math.sin(t * 1.3 + camelPh) * 0.16;
  });
  // oasis pond + palms (the pond grows as the oasis wakes)
  oasisPond = mesh(new THREE.CircleGeometry(2.6, 18).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4fc3d8, roughness: 0.25, flatShading: true }), 0, 0, 0, false);
  oasisPond.scale.setScalar(0.65);
  put(oasisPond, latC - 6, lonC + 2, 0.2, 0);
  for (const [dla, dlo] of [[-3.5, -1], [-8, 4], [-4, 5]]) {
    const p = makePalm();
    put(p, latC + dla, lonC + dlo, 0, rand(3));
    addChoppableTree(p, latC + dla, lonC + dlo, 'Palm', 0x2f9e5f);
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
  // salt-tolerant palms on the lighthouse island
  for (const [la, lo] of [[6, 226], [0, 236], [-3, 228], [5, 232]]) {
    const palm = makePalm();
    put(palm, la, lo, 0, rand(3));
    addChoppableTree(palm, la, lo, 'Palm', 0x2f9e5f);
  }
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
const lavaMats = []; // {m, base} — pulsed every frame for living lava
const lavaVeinM = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.6 });
const lavaPoolM = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff6a1a, emissiveIntensity: 1.4, roughness: 0.5 });
const lavaCoreM = new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffd23d, emissiveIntensity: 1.6, roughness: 0.4 });
lavaMats.push({ m: lavaVeinM, base: 1.6 }, { m: lavaPoolM, base: 1.4 }, { m: lavaCoreM, base: 1.6 });
const cone = new THREE.Group();
// stratified slopes: 3 stacked frustums, alternating basalt tints
const strata = [
  [3.4, 2.9, 1.9, 0x5a4a3c], [2.9, 2.35, 1.9, 0x4a3d32], [2.35, 1.8, 1.7, 0x5a4a3c],
];
strata.forEach(([r0, r1, hh, col], i) => {
  cone.add(mesh(new THREE.CylinderGeometry(r1, r0, hh, 9),
    mat(col, { emissive: 0x2a1408, emissiveIntensity: 0.4 }), 0, 0.95 + i * 1.85, 0));
});
cone.add(mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.8, 9), darkRock, 0, 5.6, 0)); // crater rim wall
const rim = mesh(new THREE.TorusGeometry(1.85, 0.22, 6, 14).rotateX(Math.PI / 2), darkRock, 0, 6.0, 0, false);
cone.add(rim);
for (let i = 0; i < 8; i++) { // jagged rim boulders
  const a = (i / 8) * Math.PI * 2 + rand(0.3);
  cone.add(mesh(new THREE.DodecahedronGeometry(rand(0.25, 0.45), 0), darkRock,
    Math.cos(a) * 1.85, 6.0 + rand(-0.1, 0.25), Math.sin(a) * 1.85, false));
}
cone.add(mesh(new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 0, 5.85, 0, false));
cone.add(mesh(new THREE.CircleGeometry(0.75, 10).rotateX(-Math.PI / 2), lavaCoreM, 0, 5.9, 0, false));
// glowing cracks running down the upper slopes (hug the surface via lookAt)
for (let k = 0; k < 4; k++) {
  const a = (k / 4) * Math.PI * 2 + 0.5;
  const holder = new THREE.Group();
  holder.position.set(Math.cos(a) * 2.45, 3.1, Math.sin(a) * 2.45);
  holder.lookAt(V3(Math.cos(a) * 12, 5.8, Math.sin(a) * 12));
  holder.add(mesh(new THREE.BoxGeometry(0.24, 3.0, 0.1), lavaVeinM, 0, 0, 0, false));
  cone.add(holder);
}
// short glowing cracks on the crater rim wall
for (let k = 0; k < 3; k++) {
  const a = (k / 3) * Math.PI * 2 + 1.2;
  cone.add(mesh(new THREE.BoxGeometry(0.16, 0.7, 0.08), lavaVeinM,
    Math.cos(a) * 1.92, 5.6, Math.sin(a) * 1.92, false));
}
const craterGlow = new THREE.PointLight(0xff7a2a, 30, 22);
craterGlow.position.set(0, 6.5, 0); cone.add(craterGlow);
occluders.push(put(cone, 27, 332, 0, 0.5));
const craterTop = cone.position.clone().add(cone.position.clone().normalize().multiplyScalar(6.4));
// parasitic cinder cone with its own faint glow
{
  const cin = new THREE.Group();
  cin.add(mesh(new THREE.CylinderGeometry(0.7, 1.6, 2.2, 8), darkRock, 0, 1.1, 0));
  cin.add(mesh(new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2), lavaPoolM, 0, 2.22, 0, false));
  cin.add(mesh(new THREE.TorusGeometry(0.62, 0.14, 5, 10).rotateX(Math.PI / 2), darkRock, 0, 2.15, 0, false));
  for (let i = 0; i < 3; i++)
    cin.add(mesh(new THREE.DodecahedronGeometry(rand(0.2, 0.35), 0), darkRock,
      rand(-1, 1), 0.2, rand(-1, 1), false));
  put(cin, 22.5, 336, 0, 1.1);
}
// smoke column (drifts downwind) + crater flicker + rising embers
const smokeM = new THREE.MeshBasicMaterial({ color: 0x8a8f96, transparent: true, opacity: 0.55 });
const puffs = [];
for (let i = 0; i < 8; i++) {
  const p = mesh(new THREE.DodecahedronGeometry(rand(0.7, 1.2), 0), smokeM, rand(-1, 1), 0, rand(-1, 1), false);
  cone.add(p);
  puffs.push({ m: p, off: i * 1.3, bx: p.position.x, bz: p.position.z });
}
let emberT = 2;
tickers.push((t, dt) => {
  for (const p of puffs) {
    const k = ((t * 0.9 + p.off) % 9) / 9;
    p.m.position.y = 6.2 + k * 7;
    p.m.position.x = p.bx + Math.sin(t * 0.6 + p.off) * (0.5 + k * 1.6); // wind drift grows aloft
    p.m.position.z = p.bz + Math.cos(t * 0.5 + p.off) * (0.5 + k * 1.2);
    p.m.scale.setScalar(0.7 + k * 1.8);
  }
  craterGlow.intensity = 28 + Math.sin(t * 7) * 4 + Math.sin(t * 13) * 2; // breathing glow
  lavaMats.forEach((e, i) => { e.m.emissiveIntensity = e.base + Math.sin(t * 3 + i * 1.7) * 0.3; });
  emberT -= dt;
  if (emberT <= 0) {
    emberT = 0.4;
    burst(Math.random() < 0.7 ? craterTop : lavaPoolTop, Math.random() < 0.5 ? 0xff7a2a : 0xffd23d, 2, 1.0);
  }
});
// gather nodes: mineable basalt clusters (rubble while regrowing) — clear of the scan tripod view
for (const [la, lo] of [[13, 324], [14, 320], [11, 318]]) {
  const rock = new THREE.Group();
  rock.add(mesh(new THREE.DodecahedronGeometry(rand(0.6, 0.9), 0), basalt, 0, 0.35, 0));
  rock.add(mesh(new THREE.ConeGeometry(0.3, rand(0.7, 1.1), 5), basalt, 0.55, 0.4, 0.2, false));
  rock.add(mesh(new THREE.ConeGeometry(0.22, rand(0.5, 0.8), 5), darkRock, -0.5, 0.3, -0.25, false));
  for (const [ex, ez] of [[0.3, 0.45], [-0.35, 0.3]]) // cooling ember dots in the cracks
    rock.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), lavaVeinM, ex, 0.12, ez, false));
  put(rock, la, lo, 0.2, rand(3));
    addNode({
      type: 'stone', item: 'stone', name: 'Basalt', verb: 'Mine', icon: '🪨', color: 0x9aa0a6, chime: 240,
      lat: la, lon: lo, kind: 'GATHER', tool: 'pick', stock: 2, respawn: 75,
      onDeplete: () => rock.scale.setScalar(0.45), onRegrow: () => rock.scale.setScalar(1),
    });
  }
  // lava flow field: glowing channel with cooled crust plates, ending in a pool
  const lavaFlowG = new THREE.Group(); scene.add(lavaFlowG);
  const flowW = (la, lo) => {
    const b = latLonToVec3(la, lo, 0).normalize();
    return b.clone().multiplyScalar(R + heightFor(b) + 0.28);
  };
  const flowPts = [[24, 331], [20, 330.5], [16.5, 331], [14.5, 332.5]];
  for (let i = 0; i < flowPts.length - 1; i++) {
    const p1 = flowW(flowPts[i][0], flowPts[i][1]);
    const p2 = flowW(flowPts[i + 1][0], flowPts[i + 1][1]);
    const len = p1.distanceTo(p2) + 0.7; // overlap the joints
    const seg = mesh(new THREE.BoxGeometry(1.25, 0.18, len), lavaPoolM, 0, 0, 0, false);
    seg.position.copy(p1).lerp(p2, 0.5);
    seg.lookAt(p2);
    lavaFlowG.add(seg);
    const crust = mesh(new THREE.BoxGeometry(0.85, 0.1, len * 0.45), darkRock, 0, 0, 0, false);
    crust.position.copy(p1).lerp(p2, 0.52);
    crust.position.y += 0.12;
    crust.lookAt(p2);
    lavaFlowG.add(crust);
  }
  const poolN = latLonToVec3(14.5, 332.5, 0).normalize();
  const poolP = poolN.clone().multiplyScalar(R + heightFor(poolN) + 0.3);
  const pool = mesh(new THREE.CircleGeometry(1.3, 14), lavaPoolM, 0, 0, 0, false);
  pool.position.copy(poolP);
  pool.lookAt(poolP.clone().add(poolN));
  lavaFlowG.add(pool);
  for (let i = 0; i < 6; i++) { // dark rim boulders around the pool
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const rp = poolP.clone().add(V3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6));
    const rn = rp.clone().normalize();
    const rk = mesh(new THREE.DodecahedronGeometry(rand(0.25, 0.45), 0), darkRock, 0, 0, 0, false);
    rk.position.copy(rn).multiplyScalar(R + heightFor(rn) + 0.2);
    lavaFlowG.add(rk);
  }
  const poolLight = new THREE.PointLight(0xff7a2a, 5, 9);
  poolLight.position.copy(poolP).addScaledVector(poolN, 1);
  lavaFlowG.add(poolLight);
  const lavaPoolTop = poolP.clone();
  // cooling rocks, columnar basalt organ-pipes, glassy obsidian shards
  for (let i = 0; i < 12; i++) {
    const glowing = i < 4;
    put(mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.8), 0),
      glowing ? lavaVeinM : darkRock, 0, 0.2, 0, false),
      rand(6, 22), rand(312, 348), 0.1, rand(3));
  }
  {
    const cg = new THREE.Group();
    for (const [ox, oz, hh] of [[0, 0, 2.0], [0.62, 0, 1.4], [-0.62, 0, 1.6], [0.31, 0.55, 1.1], [-0.31, 0.55, 1.8], [0.31, -0.55, 1.2], [-0.31, -0.55, 0.9]])
      cg.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, hh, 6), darkRock, ox, hh / 2, oz));
    put(cg, 10, 315, 0, 0.7);
  }
  const obsidianM = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.3, metalness: 0.6, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const sh = mesh(new THREE.ConeGeometry(0.18, rand(0.5, 1.0), 5), obsidianM, 0, 0, 0, false);
    put(sh, rand(6, 22), rand(312, 348), 0.25, rand(3));
    sh.rotateX(rand(-0.35, 0.35)); sh.rotateZ(rand(-0.35, 0.35)); // lean after grounding
  }
  // survey tripod viewpoint — braced legs, plumb line, glinting scope, field crate
  const tri = new THREE.Group();
  const triWood = mat(0x7a5230);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.09, 0.07, 2.0, 6), triWood, 0, 0, 0);
    leg.position.set(0.55, 0.85, 0);
    leg.rotation.z = 0.5; // splayed stance
    pivot.add(leg);
    tri.add(pivot);
  }
  for (let i = 0; i < 3; i++) { // spreader bars between legs
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const bar = mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), triWood, Math.cos(a) * 0.62, 0.55, Math.sin(a) * 0.62, false);
    bar.rotation.y = -a + Math.PI / 2;
    tri.add(bar);
  }
  tri.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 8), triWood, 0, 1.8, 0)); // head platform
  tri.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), mat(0x33414e), 0, 2.0, 0));
  const scope = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 7), mat(0xe8c33d, { metalness: 0.4, roughness: 0.4 }), 0, 2.32, 0);
  scope.rotation.x = -0.9; tri.add(scope);
  tri.add(mesh(new THREE.CircleGeometry(0.09, 8),
    mat(0xbfe9ff, { emissive: 0x7ec8ff, emissiveIntensity: 1.2 }), 0, 2.5, 0.28, false)); // lens glint
  tri.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), mat(0x3a3330), 0, 1.3, 0, false)); // plumb line
  const bob = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), mat(0xe8c33d, { metalness: 0.5, roughness: 0.4 }), 0, 0.82, 0, false);
  tri.add(bob);
  tri.add(mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat(0x9a6b42), 1.1, 0.28, 0.4, false)); // field crate
  put(tri, 8, 328, 0, -0.6);
  tickers.push((t) => { bob.rotation.z = Math.sin(t * 1.7) * 0.12; }); // plumb sway
  // ridge-tent camp: poled canvas, guy ropes, bedroll, crate
  {
    const camp = new THREE.Group();
    const canvasM = mat(0xd9c9a8);
    for (const s of [-1, 1]) {
      const sheet = mesh(new THREE.BoxGeometry(1.9, 0.08, 2.2), canvasM, 0, 0, 0);
      sheet.position.set(s * 0.48, 0.75, 0);
      sheet.rotation.z = s * -0.62;
      camp.add(sheet);
    }
    camp.add(mesh(new THREE.BoxGeometry(0.5, 1.5, 1.9), mat(0x2a2320), 0, 0.4, -0.15, false)); // dark interior
    for (const [px, pz] of [[0, 1.05], [0, -1.05]])
      camp.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), triWood, px, 0.8, pz, false)); // ridge poles
    const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.35, 4).rotateX(Math.PI / 2);
    for (const [rx, rz] of [[-1.5, 1.2], [1.5, 1.2], [-1.5, -1.2], [1.5, -1.2]]) { // guy ropes + stakes
      const rope = mesh(ropeGeo, mat(0x3a3330), (rx * 0.55 + rx) / 2, (1.15 + 0.15) / 2, (rz * 0.55 + rz) / 2, false);
      rope.lookAt(rx, 0.15, rz);
      camp.add(rope);
      camp.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), triWood, rx, 0.15, rz, false));
    }
    const roll = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 7), mat(0x2e8b8b), 1.6, 0.16, 0.3, false);
    roll.rotation.z = Math.PI / 2; camp.add(roll); // bedroll
    camp.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x9a6b42), -1.5, 0.25, -0.6, false)); // supply crate
    put(camp, 6, 320, 0, 0.9);
  }
  // charred ember trees cling to the volcano's lower slopes
  for (const [la, lo] of [[8, 318], [17, 312], [20, 344], [9, 345], [5, 325], [15, 306]]) {
    const tree = makeEmberTree(rand(2.8, 4.2));
    put(tree, la, lo, 0, rand(3));
    addChoppableTree(tree, la, lo, 'Ember Tree', 0xd96a2f);
  }
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
  for (let i = 0; i < 3; i++) {
    const { g: gull, body, wl, wr } = makeBirdMesh(1, 0xf4f7fa, 0xe9eff4, ['#dde5ea', '#ffffff']);
    scene.add(gull);
    const r = R + rand(9, 13), sp = rand(0.15, 0.3) * (i % 2 ? 1 : -1), ph = rand(Math.PI * 2);
    const loC = rand(210, 290);
    const posAt = (aa) => latLonToVec3(4 + Math.cos(aa * 0.7) * 6, loC + Math.sin(aa) * 18, 0).normalize();
    const hAt = (aa) => { // travel direction as a tangent-plane unit vector
      const p0 = posAt(aa), p1 = posAt(aa + 0.06 * Math.sign(sp));
      return p1.addScaledVector(p0, -p1.dot(p0)).normalize();
    };
    tickers.push((t) => {
      const a = ph + t * sp;
      const nrm = posAt(a);
      gull.position.copy(nrm).multiplyScalar(r + Math.sin(t * 2 + ph) * 0.5);
      const h0 = hAt(a), h1 = hAt(a + 0.06 * Math.sign(sp));
      const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), h0.clone().negate(), nrm);
      gull.quaternion.setFromRotationMatrix(m);
      // bank into the turn (signed turn rate about the bird's up)
      const turn = Math.atan2(new THREE.Vector3().crossVectors(h0, h1).dot(nrm), h0.dot(h1));
      gull.rotateZ(THREE.MathUtils.clamp(-turn * 4, -0.45, 0.45));
      const glide = 0.45 + 0.55 * Math.sin(t * 0.6 + ph); // long glides between flurries
      const flap = Math.sin(t * 9 + ph) * 0.75 * glide;
      wingFlap(wl, flap); wingFlap(wr, flap);
      body.position.y = Math.sin(t * 1.3 + ph) * 0.02;
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
      // trusty axe: always carried in the right hand; both hands close on it mid-swing
      const axe = new THREE.Group();
      axe.position.set(-0.08, -0.24, 0.1);
      axe.rotation.x = 0.5;
      axe.scale.setScalar(0.8);
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
    // two-handed axe grip only while swinging; otherwise it hangs in the right hand
    const wantGrip = chopT > 0 ? 1 : 0;
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
let fishStage = 0; // 0 = idle, 1 = line cast / waiting to reel
let fishSource = 'ice'; // 'ice' at the arctic hole, 'sea' from the skiff
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
const inv = { wood: 0, stone: 0, gold: 0, food: 2, fish: 0, wool: 0, remedy: 0, egg: 0, milk: 0, meal: 0 };
const meters = { energy: 100, cold: 0, health: 100, hunger: 100, warmth: 100, morale: 80 };
let playerDead = false; // game-over gate: input + bears ignore the fallen traveler
let combatNow = 0; // seconds, advanced in animate(); drives regen + cooldowns
let lastDamageT = -99; // last time the player took a hit (for slow recovery)
const PACK_BASE = 16;
let packBonus = 0;
function packSize() { return inv.wood + inv.stone + inv.gold + inv.food + (inv.fish || 0) + inv.wool + inv.remedy + (inv.egg || 0) + (inv.milk || 0) + (inv.meal || 0); }
function packCap() { return PACK_BASE + packBonus; } // Big Pack research adds room
function earnGold(n = 1) {
  if (n <= 0) return;
  inv.gold += n;
  Life.stats.goldEarned = (Life.stats.goldEarned || 0) + n;
  renderStats();
}
function addItem(id, n = 1) {
  if (packSize() + n > packCap()) { toast('🎒 Pack full! (capacity ' + packCap() + ')'); return false; }
  inv[id] += n;
  try { if (id === 'gold' && Life?.stats) Life.stats.goldEarned = (Life.stats.goldEarned || 0) + n; } catch { /* Life not ready */ }
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
    { k: 'fish', hunger: 26, energy: 10 },
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
  setText('inv-food', inv.food); setText('inv-fish', inv.fish || 0); setText('inv-wool', inv.wool); setText('inv-remedy', inv.remedy);
  setText('inv-egg', inv.egg || 0); setText('inv-milk', inv.milk || 0); setText('inv-meal', inv.meal || 0);
  setText('pack-count', packSize() + '/' + packCap());
  setText('home-tier', Home.build ? `Building ${HOUSE_BUILD_NAMES[Home.build.target] || 'home'}…` : (Home.house >= 2 ? `Farmhouse T${Home.house - 1}` : (Home.house === 1 ? 'Hut' : 'Tent')));
  setText('clothes-tier', CLOTHES[Life.clothes] || 'Rags');
  setText('upkeep', `👪 ${familyUpkeep()}🍎/day`);
  // RPG header: level, weapon tier, XP progress
  try {
    updateHeroGear();
    setText('rpg-lvl', `⚔️ Lv ${RPG.level}`);
    setText('rpg-weapon', rpgWeaponDef().name);
    setText('rpg-xp-text', `${Math.floor(RPG.xp)}/${RPG.xpNext} XP`);
    const xf = document.getElementById('xp-fill');
    if (xf) xf.style.width = `${Math.min(100, (RPG.xp / RPG.xpNext) * 100)}%`;
    // compact status conditions instead of full meter bars
    const badges = [];
    if ((meters.hunger ?? 100) <= 25) badges.push('🍽️ Hungry');
    if ((meters.cold ?? 0) >= 60) badges.push('🥶 Freezing');
    if ((meters.energy ?? 100) <= 15) badges.push('😮‍💨 Tired');
    if ((meters.morale ?? 80) >= 85) badges.push('✨ Inspired');
    if (critBuff > 0) badges.push('💥 Crit x2');
    const bb = document.getElementById('status-badges');
    if (bb) bb.innerHTML = badges.map((b) => `<span class="status-pill">${b}</span>`).join('');
  } catch { /* headless */ }
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
  boat: {
    get pos() { return boatGroup.position.toArray(); },
    get inBoat() { return inBoat; },
    board: boardBoat, leave: leaveBoat, use: boatUse, mesh: boatGroup,
  },
  hasTarget: () => !!moveTargetN || !!activeTask,
  task: () => (activeTask ? { kind: activeTask.interact?.kind, id: activeTask.interact?.id } : null),
  autoAct: (id) => {
    const it = interactables.find((x) => x.id === id) || currentTarget;
    return it ? setAutoTask(it) : false;
  },
  dash: () => tryDash(),
  get rpg() { try { return RPG; } catch { return null; } },
  goto(lat, lon, flat, flon) { // fast-travel hook (also used by globe clicks)
    playerPos = latLonToVec3(lat, lon, 0);
    const n0 = playerPos.clone().normalize();
    playerPos = n0.clone().multiplyScalar(R + heightFor(n0) + 0.1);
    moveDirSmooth.copy(latLonToVec3(flat, flon, 0)).sub(playerPos);
    moveDirSmooth.addScaledVector(n0, -moveDirSmooth.dot(n0)).normalize();
    facing.copy(moveDirSmooth);
    lastBehind.copy(moveDirSmooth);
    clearAutoTask();
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
  if (activeTask?.interact?.id === id) clearAutoTask();
  if (onGainXp) onGainXp(60, player.position.clone());
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

const FISH_TYPES = [
  { id: 'sunny-carp', name: 'Sunny Carp', icon: '🐟', w: 30, size: [0.4, 1.1] },
  { id: 'reef-flutter', name: 'Reef Flutter', icon: '🐠', w: 22, size: [0.3, 0.8] },
  { id: 'moon-eel', name: 'Moon Eel', icon: '🌙🐟', w: 12, size: [0.6, 1.4], night: true },
  { id: 'lantern-fish', name: 'Lantern Fish', icon: '🏮🐟', w: 10, size: [0.4, 0.9], night: true },
  { id: 'deep-king', name: 'Deep King', icon: '👑🐟', w: 5, size: [1.2, 2.0], sea: true },
  { id: 'ice-glimmer', name: 'Ice Glimmer', icon: '✨🐟', w: 14, size: [0.3, 0.7], ice: true },
  { id: 'golden-boot', name: 'Golden Boot', icon: '🥾✨', w: 1, size: [0.8, 0.8] },
];
function pickFish(sea) {
  const night = isNight();
  const pool = FISH_TYPES.filter((f) => {
    if (f.night && !night) return false;
    if (f.sea && !sea) return false;
    if (f.ice && sea) return false;
    return true;
  });
  const total = pool.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const f of pool) { r -= f.w; if (r <= 0) return f; }
  return pool[0];
}
function fishFrom(source) {
  if (playerDead) return;
  if (fishStage === 0) {
    fishSource = source;
    fishStage = 1;
    chime(440);
    const first = (Life.stats.fishCaught || 0) < 2;
    toast(source === 'sea' ? '🎣 Line cast into the blue — wait, then press E.' : '🎣 Line cast… wait… then press E again!');
    setTimeout(() => {
      if (fishStage === 1 && fishSource === source) {
        burst(player.position.clone(), 0x7ad9ff, 14, 2);
        chime(880);
        toast('❗ Nibble! Press E now!');
      }
    }, first ? 1200 : 2200);
  } else {
    const sea = fishSource === 'sea';
    fishStage = 0;
    const spec = pickFish(sea);
    const sz = (spec.size[0] + Math.random() * (spec.size[1] - spec.size[0])).toFixed(1);
    Life.stats.fishCaught = (Life.stats.fishCaught || 0) + 1;
    Life.fishBook = Life.fishBook || {};
    const prev = Life.fishBook[spec.id];
    const isRecord = !prev || Number(sz) > prev.best;
    Life.fishBook[spec.id] = { n: (prev?.n || 0) + 1, best: isRecord ? Number(sz) : prev.best, name: spec.name };
    if (sea) {
      if (!addItem('fish', 1)) return;
      burst(player.position.clone(), 0x7ad9ff, 30, 3);
      chime(660); setTimeout(() => chime(880), 120);
      toast(`🐟 ${spec.name} ${sz}kg! (+1 fish${isRecord ? ' — NEW RECORD!' : ''})`);
      if (onGainXp) onGainXp(isRecord ? 25 : 14, player.position.clone());
    } else {
      if (!addItem('food', 1)) return;
      burst(player.position.clone(), 0x7ad9ff, 30, 3);
      chime(660); setTimeout(() => chime(880), 120);
      toast(`🐟 ${spec.name} ${sz}kg! (+1 food${isRecord ? ' — NEW!' : ''})`);
      if (onGainXp) onGainXp(isRecord ? 22 : 12, player.position.clone());
    }
  }
}
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
    fishFrom('ice');
  } else if (it.id.startsWith('shell')) {
    const idx = { shell: 0, shell2: 1, shell3: 2 }[it.id];
    const sh = shellMeshes[idx];
    if (sh && sh.visible) { sh.visible = false; burst(p, 0xf7c8c8, 14, 2); chime(620); toast('🐚 Pocketed! The cove has more.'); }
    else toast('Your pockets jingle with shells.');
  } else if (it.id === 'lagoon') {
    burst(p, 0x54e0d0, 20, 2.5); chime(580); toast('Warm shallows. Somewhere east, a bell waits to ring.');
  }
}

// ---------- polar-bear combat + health ----------
// Adults (scale >= 0.9) guard their ground: wander home, chase inside 7u,
// telegraph a heavy swipe inside 3u (dodge with Shift!), swipe for 10–16 damage.
// Cubs never attack — they flee.
// One click/E locks the bear: the hero pursues and auto-swings until it falls.
// Health regens slowly out of combat; 🌿 remedy heals fast.
const BEAR_AGGRO = 7, BEAR_STRIKE = 3.1, BEAR_LEASH = 14;
let playerAttackCd = 0;
function bearLabel(b) {
  if (b.dead) return 'The bear is still… (victory)';
  if (b.cub) return `Cub ${Math.ceil(b.hp)}/${b.maxHp} — tap to shoo`;
  return `Bear ❤ ${Math.ceil(b.hp)}/${b.maxHp} — tap to fight`;
}
function flashDamage() {
  const f = document.getElementById('damage-flash');
  if (!f) return;
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 160);
}
function damagePlayer(amount, from) {
  if (playerDead || meters.health <= 0) return;
  // dash i-frames: a well-timed roll avoids the hit entirely and empowers the riposte
  if (dashIFrames > 0) {
    critBuff = 2;
    spawnPopup(player.position.clone(), 'Clean Dodge! 💨', '#9fdcff', true);
    chime(990);
    return;
  }
  meters.health = Math.max(0, meters.health - amount);
  lastDamageT = combatNow;
  flashDamage();
  spawnPopup(player.position.clone(), `-${amount}`, '#ff8787');
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
  playerAttackCd = Math.max(0.3, window.__rpgSwing || 0.55);
  startChop(); // axe swing
  // damage lands mid-swing so the hit matches the axe visually
  setTimeout(() => {
    if (b.dead || playerDead) return;
    if (player.position.distanceTo(b.mesh.position) > 5.2) return; // whiffed: bear moved away
    let dmg = Math.round((12 + Math.random() * 8) * (tools.axe || 1) * (window.__rpgDmgMult || 1));
    if (critBuff > 0) { dmg = Math.round(dmg * 1.8); critBuff--; toast('💥 Critical strike!'); }
    b.hp -= dmg;
    b.hitFlash = 1;
    burst(b.mesh.position.clone(), 0xffd97a, 14, 2.4);
    spawnPopup(b.mesh.position.clone(), `-${dmg}`, dmg >= 30 ? '#ffb35a' : '#ffffff');
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
  if (activeTask?.interact?.bear === b) clearAutoTask();
  if (b.cub) { toast('The cub yelps and plays dead… it will scamper off soon.'); if (onGainXp) onGainXp(10, b.mesh.position.clone()); }
  else {
    toast('🐻‍❄️ You bested the polar bear! Rest — health recovers slowly. (+2 food)');
    addItem('food', 2);
    if (onGainXp) onGainXp(45, b.mesh.position.clone());
    spawnPopup(b.mesh.position.clone(), '❄️ Frost Pelt +2🍎', '#9fdcff');
  }
  saveCheckpoint(); // a victory is worth remembering quietly
}
function killPlayer() {
  if (playerDead) return;
  playerDead = true;
  inBoat = false;
  fishStage = 0;
  player.visible = true;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  moveTargetN = null;
  clearAutoTask();
  burst(player.position.clone(), 0xe03131, 30, 3);
  chime(110);
  const g = document.getElementById('gameover');
  if (g) g.classList.remove('hidden');
  const sub = document.getElementById('gameover-sub');
  if (sub) sub.textContent = loadSave() ? 'Returning to your last save…' : 'Returning to the farmstead…';
  setTimeout(respawnAtSave, 2600);
}
function respawnAtSave() {
  // soft death: keep your best axe and your fish — only lose half your loose food
  const keepAxe = tools.axe || 1, keepFish = inv.fish || 0;
  const snap = loadSave();
  const g = document.getElementById('gameover');
  if (g) g.classList.add('hidden');
  if (snap) applySave(snap, true);
  else {
    // no save yet: restart fresh at the farmstead with full health
    meters.health = 100; meters.energy = 100; meters.cold = 0;
    playerPos = latLonToVec3(2, 50, 0);
    const n0 = playerPos.clone().normalize();
    playerPos = n0.clone().multiplyScalar(R + heightFor(n0) + 0.1);
  }
  if ((tools.axe || 1) < keepAxe) tools.axe = keepAxe;
  if ((inv.fish || 0) < keepFish) { inv.fish = keepFish; }
  inv.food = Math.ceil((inv.food || 0) / 2); // half your berries spill, the rest stays
  playerDead = false;
  lastDamageT = combatNow;
  renderStats();
  toast('🧭 Back on your feet. Axe and fish kept — only lost half your 🍎.');
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
        for (const leg of anim.legs) leg.rotation.z *= 0.9;
        anim.headPivot.rotation.z = -0.5 * b.tip;
        anim.body.position.y = 0.9;
      }
      continue;
    }
    const n = b.pos.clone().normalize();
    const toPlayer = player.position.clone().sub(b.mesh.position);
    const dist = toPlayer.length();
    let moveDir = null, speed = 0, engaged = false;
    if (!playerDead && b.adult) {
      const homeD = b.pos.distanceTo(b.home);
      if (dist < BEAR_STRIKE) {
        // strike range: plant the feet and fight. Facing is handled here alone
        // (one capped pivot per frame) — the wander below stands down while
        // engaged so the bear can't double-turn and snap.
        engaged = true;
        // strike range: face the traveler, telegraph the heavy swipe (red flash +
        // rear-up), then land it — dash (Shift) through the flash for a Clean Dodge.
        // Committed aim: track fast while open, barely track mid-windup so a
        // late dash actually dodges (and bears can't snap-turn mid-swing).
        const flat = toPlayer.addScaledVector(n, -toPlayer.dot(n));
        if (flat.lengthSq() > 1e-6) bearTurnToward(b, flat.normalize(), dt, b.windup > 0 ? 0.6 : 2.4);
        if (b.windup > 0) {
          b.windup -= dt;
          b.attackT = 0.65; // hold the rear-up through the telegraph
          if (b.windup <= 0) {
            b.attackCd = 1.35;
            b.attackT = 0.65;
            setTimeout(() => {
              if (!b.dead && !playerDead && player.position.distanceTo(b.mesh.position) < BEAR_STRIKE + 0.6) {
                damagePlayer(Math.round(10 + Math.random() * 6), b.mesh.position);
                toast('🐻‍❄️ The bear swipes you! Tap the bear to fight back — or dodge (Shift)!');
              }
            }, 140);
          }
        } else if (b.attackCd <= 0) {
          b.windup = 0.7;
          b.hitFlash = Math.max(b.hitFlash, 0.25);
          burst(b.mesh.position.clone().addScaledVector(n, 1.2), 0xe03131, 8, 1.6);
          spawnPopup(b.mesh.position.clone(), '❗', '#ff6b6b', true);
          chime(140);
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
    if (!moveDir && !engaged) {
      // idle wander: pick a new nearby heading every few seconds
      b.wanderT -= dt;
      if (b.wanderT <= 0 || !b.target) {
        b.wanderT = rand(2.5, 6);
        // amble along a corridor: deviate from the current heading instead of
        // spinning to a fully random tangent (that read as a twitchy bear)
        const base = b.facing.clone().addScaledVector(n, -b.facing.dot(n));
        if (base.lengthSq() < 1e-6) base.copy(lastBehind);
        else base.normalize();
        b.target = base.applyAxisAngle(n, rand(-1.1, 1.1));
        b.target.addScaledVector(n, -b.target.dot(n));
        if (b.target.lengthSq() < 1e-6) b.target = null;
        else b.target.normalize();
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
    if (moveDir && speed > 0 && !engaged) {
      bearTurnToward(b, moveDir, dt, b.cub ? 3.4 : 1.9);
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
      // model faces +X, so a forward stride swings legs around Z (around X they
      // splayed sideways like the splits)
      anim.legs[0].rotation.z = s * amp; anim.legs[3].rotation.z = s * amp;
      anim.legs[1].rotation.z = -s * amp; anim.legs[2].rotation.z = -s * amp;
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
const ITEM_ICON = { wood: '🪵', stone: '🪨', gold: '🪙', food: '🍎', fish: '🐟', wool: '🐑', remedy: '🌿', egg: '🥚', milk: '🥛', meal: '🍲' };
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
  saveCheckpoint(); // persist the barter quietly so progress survives death
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
  stats: { maxFood: 2, harvests: 0, meals: 0, goldEarned: 0, disasters: 0, tornadoSeen: false, fishCaught: 0 },
  rot: { food: 0, fish: 0, egg: 0, milk: 0, meal: 0 },
  chronicle: [],
  fishBook: {},
  recipes: {},
};
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
  sun.position.set(Math.cos(ang) * 60 * S, Math.sin(ang) * 60 * S + 8 * S, 25 * S);
  atmoUniforms.uSunDir.value.copy(sun.position).normalize();
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
  const before = { ...inv };
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
  saveCheckpoint();
  renderStats();
  // day-end card: closure for yesterday + a hook for tomorrow
  const gains = [];
  for (const k of ['food', 'fish', 'egg', 'milk', 'meal', 'wool', 'gold']) {
    const d = (inv[k] || 0) - (before[k] || 0);
    if (d > 0) gains.push(`+${d}${ITEM_ICON[k] || k}`);
  }
  const ripe = Home.plots.filter((p) => p.bought && p.crop && p.growth >= 3).length;
  let msg = `☀️ Day ${Life.day} · ${SEASONS[seasonNow()]}` + (rested ? '' : ' (nodded off outside 😴−⚡)') + (Life.festival ? ` · 🎉 ${SEASONS[seasonNow()]} festival!` : '');
  if (gains.length) msg += ` — overnight: ${gains.join(' ')}`;
  else msg += ' — herd ate, fields drank';
  if (ripe > 0) msg += ` · ${ripe} plot${ripe > 1 ? 's' : ''} ripe!`;
  else msg += ' · tomorrow: water + check traps';
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
    fishBook: { ...(Life.fishBook || {}) }, recipes: { ...(Life.recipes || {}) }, packBonus,
    rpg: { level: RPG.level, xp: Math.round(RPG.xp), xpNext: RPG.xpNext, weapon: RPG.weapon, perkChop: RPG.perkChop, perkRun: RPG.perkRun, perkTame: RPG.perkTame },
    home: { house: Home.house, well: Home.well, barn: Home.barn, fences: Home.fences, cabin: Home.cabin, stall: Home.stall, lanterns: Home.lanterns, dog: Home.dog, decor: Home.decor, build: Home.build ? { target: Home.build.target, t: Home.build.t, dur: Home.build.dur } : null, plots: Home.plots.map((p) => ({ crop: p.crop, growth: p.growth, water: p.water })) },
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
  Life.fishBook = { ...(s.fishBook || {}) };
  Life.recipes = { ...(s.recipes || {}) };
  if (s.rpg) {
    RPG.level = Math.max(1, Math.min(20, s.rpg.level | 0 || 1));
    RPG.xp = Math.max(0, s.rpg.xp || 0);
    RPG.xpNext = s.rpg.xpNext || (35 + (RPG.level - 1) * 28);
    RPG.weapon = Math.max(0, Math.min(3, s.rpg.weapon | 0 || 0));
    RPG.perkChop = s.rpg.perkChop || 1; RPG.perkRun = s.rpg.perkRun || 1; RPG.perkTame = s.rpg.perkTame || 1;
    rpgRefreshMults();
  }
  if (typeof s.packBonus === 'number') packBonus = Math.max(0, Math.min(24, s.packBonus | 0));
  if (typeof s.stats?.fishCaught !== 'number') Life.stats.fishCaught = 0;
  Home.build = null;
  if (s.home) {
    Home.house = s.home.house ?? 0; Home.well = !!s.home.well; Home.barn = s.home.barn ?? 0;
    Home.fences = s.home.fences ?? 0; Home.cabin = !!s.home.cabin; Home.stall = !!s.home.stall;
    Home.lanterns = s.home.lanterns ?? 0; Home.dog = !!s.home.dog; Home.decor = s.home.decor ?? 0;
    Home.plots = (s.home.plots || []).map((p) => ({ bought: !!p.bought, crop: !!p.crop, growth: p.growth ?? 0, water: !!p.water }));
    while (Home.plots.length < 6) Home.plots.push({ crop: false, growth: 0, water: false });
    const hb = s.home.build;
    const target = hb && Number.isFinite(hb.target) ? Math.min(4, Math.max(1, Math.floor(hb.target))) : 0;
    Home.build = target > Home.house
      ? {
          target,
          t: Math.max(0, Math.min(Number(hb.dur) || HOUSE_BUILD_DUR, Number(hb.t) || 0)),
          dur: Math.max(0.2, Number(hb.dur) || HOUSE_BUILD_DUR),
        }
      : null;
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
    for (const k of ['fish', 'egg', 'milk', 'food']) { if (inv[k] > 0) { inv[k]--; ate++; took = true; break; } }
    if (!took) break;
  }
  if (ate < need) {
    meters.hunger = Math.max(0, meters.hunger - 40);
    meters.morale = Math.max(0, meters.morale - 15);
    Life.grief = Math.min(1.5, (Life.grief || 0) + 0.6);
  }
  meters.hunger = Math.max(0, meters.hunger - 5);
  renderStats();
}
function cookMeal() {
  if (playerDead) return;
  const have = (inv.food || 0) + (inv.fish || 0) + (inv.egg || 0) + (inv.milk || 0);
  if (have < 2) return toast('🍲 Need 2 produce (🍎/🐟/🥚/🥛) to cook a meal.');
  const used = [];
  let need = 2;
  for (const k of ['fish', 'food', 'egg', 'milk']) { while (need > 0 && inv[k] > 0) { inv[k]--; used.push(k); need--; } }
  inv.meal = (inv.meal || 0) + 1; // net −1 pack, always fits
  meters.energy = Math.min(100, meters.energy + 5);
  // recipe discovery: first time you mix a combo, it is remembered
  const key = [...used].sort().join('+');
  Life.recipes = Life.recipes || {};
  const isNew = key && !Life.recipes[key];
  if (key) Life.recipes[key] = (Life.recipes[key] || 0) + 1;
  burst(homeFirePos ? homeFirePos.clone() : player.position.clone(), 0xffb35a, isNew ? 26 : 14, isNew ? 3 : 2);
  chime(700); if (isNew) setTimeout(() => chime(880), 140);
  toast(isNew ? `🍲 New recipe! ${used.join(' + ')} → hearty meal!` : '🍲 Cooked a hearty meal! (F to eat)');
  if (onGainXp) onGainXp(isNew ? 18 : 10, (homeFirePos ? homeFirePos.clone() : player.position.clone()));
  renderStats();
}
tickers.push((t, dt) => {
  if (playerDead || sleeping) return;
  // RPG pacing: hunger drains ~3x slower so exploring beats eating on schedule.
  meters.hunger = Math.max(0, (meters.hunger ?? 100) - dt * (100 / 900));
  if (meters.hunger <= 0) {
    meters.health = Math.max(1, meters.health - 2 * dt); // starving aches but won't finish you
    meters.energy = Math.max(0, meters.energy - 3 * dt);
    if (!hungerWarned) { hungerWarned = true; toast('🍽️ Starving! Eat something (F).'); chime(200); }
  } else if (meters.hunger > 30) hungerWarned = false;
  const stock = inv.food + (inv.fish || 0) + (inv.egg || 0) + (inv.milk || 0) + (inv.meal || 0);
  if (stock > Life.stats.maxFood) Life.stats.maxFood = stock;
  if (Life.grief > 0) Life.grief = Math.max(0, Life.grief - dt / 120);
  const mt = moraleTarget();
  meters.morale += THREE.MathUtils.clamp(mt - (meters.morale ?? 80), -dt * 2, dt * 2);
});

// --- homestead: buildings, plots, well (fixed site south of Clover Fields) ---
const HOME = { lat: -3, lon: 56 };
const Home = {
  house: 0, build: null, well: false, barn: 0, fences: 0, cabin: false, stall: false,
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
const HOUSE_BUILD_DUR = 4.5;
const HOUSE_BUILD_NAMES = { 1: 'Mud Hut', 2: 'Farmhouse', 3: 'Big Farmhouse', 4: 'Manor' };
let houseBuildParts = null;
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
function houseStyle(t) {
  return {
    w: t >= 3 ? 4.2 : 3.2,
    d: t >= 3 ? 3.6 : 2.8,
    hgt: t >= 4 ? 3.2 : 2.2,
    wallM: mat(t >= 4 ? 0xf3e4c8 : 0x9a6b42),
    roofM: mat(t >= 3 ? 0x7a2e2e : 0x4a5d5a),
  };
}
function buildHouseMesh() {
  if (Home.build) { buildHouseConstructionMesh(); return; }
  const t = Home.house, broken = Home.dmg.house;
  if (t === 0) {
    const tent = mesh(new THREE.ConeGeometry(1.5, 1.9, 6), mat(0xd9c9a8), 0, 0, 0);
    placeAt(tent, HOUSE_SPOT.lat, HOUSE_SPOT.lon, 0.9, 0.4);
    placeAt(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.56, 8), mat(0xe8d9a8), 0, 0, 0, false), HOUSE_SPOT.lat + 1.2, HOUSE_SPOT.lon + 0.5, 0.2, 1);
    return;
  }
  const g = new THREE.Group();
  const { w, d, hgt, wallM, roofM } = houseStyle(t);
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

// House construction: a staged Age-of-Empires-style build (scaffold, hammering hands, rising walls).
function buildHouseConstructionMesh() {
  const b = Home.build;
  if (!b) return;
  const { w, d, hgt, wallM, roofM } = houseStyle(b.target);
  const g = new THREE.Group();
  const baseH = 0.12;
  const foundation = mesh(new THREE.BoxGeometry(w + 0.55, baseH, d + 0.55), mat(0x8d8f93), 0, baseH / 2, 0);
  g.add(foundation);

  const walls = new THREE.Group();
  walls.position.y = baseH;
  walls.add(mesh(new THREE.BoxGeometry(w, hgt, d), wallM, 0, hgt / 2, 0));
  if (b.target >= 3) walls.add(mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), wallM, w / 2 + 0.8, 0.9, 0.4));
  const windows = [
    mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), windowGlowM, -w / 4, 1.3, d / 2 + 0.02, false),
    mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), windowGlowM, w / 4, 1.3, d / 2 + 0.02, false),
  ];
  for (const win of windows) walls.add(win);
  g.add(walls);

  const roof = new THREE.Group();
  roof.position.y = baseH + hgt;
  const roofMesh = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.5, 4), roofM, 0, 0.75, 0);
  roofMesh.rotation.y = Math.PI / 4;
  roof.add(roofMesh);
  g.add(roof);

  const chimney = mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 6), mat(0x8d8d94), w / 4, baseH + hgt + 1.2, -d / 4);
  g.add(chimney);

  const scaffold = new THREE.Group();
  const postM = mat(0x8a6238), plankM = mat(0x9a6b42);
  const pad = 0.5, postH = hgt + 1.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    scaffold.add(mesh(new THREE.CylinderGeometry(0.055, 0.075, postH, 5), postM, sx * (w / 2 + pad), postH / 2, sz * (d / 2 + pad)));
  for (const y of [baseH + 0.65, baseH + hgt * 0.62, baseH + hgt + 0.25]) {
    scaffold.add(mesh(new THREE.BoxGeometry(w + pad * 2, 0.07, 0.07), postM, 0, y, d / 2 + pad, false));
    scaffold.add(mesh(new THREE.BoxGeometry(w + pad * 2, 0.07, 0.07), postM, 0, y, -d / 2 - pad, false));
    scaffold.add(mesh(new THREE.BoxGeometry(0.07, 0.07, d + pad * 2), postM, w / 2 + pad, y, 0, false));
    scaffold.add(mesh(new THREE.BoxGeometry(0.07, 0.07, d + pad * 2), postM, -w / 2 - pad, y, 0, false));
  }
  scaffold.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.08, 0.45), plankM, 0, baseH + 0.7, d / 2 + pad + 0.22));
  g.add(scaffold);

  const workers = [];
  const specs = [
    { x: -w / 2 - 0.7, z: d / 2 + 0.9, yaw: 0.55, coat: 0x3f9a4c, phase: 0 },
    { x: w / 2 + 0.95, z: -0.2, yaw: -1.15, coat: 0xc9573a, phase: 2.2 },
  ];
  for (const spec of specs) {
    const v = makeVillager({ coat: spec.coat, hat: 'straw', hatColor: 0xe8d27a });
    v.userData.villager.mark.visible = false;
    v.position.set(spec.x, 0, spec.z);
    v.rotation.y = spec.yaw;
    const arm = v.userData.villager.arm;
    const hammer = new THREE.Group();
    hammer.position.set(0, -0.58, 0.04);
    hammer.rotation.x = 0.45;
    hammer.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 5), mat(0x7a5230), 0, -0.08, 0, false));
    hammer.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 0.34), mat(0x9aa0a6, { metalness: 0.5, roughness: 0.4 }), 0, -0.36, 0.05, false));
    arm.add(hammer);
    g.add(v);
    workers.push({ arm, phase: spec.phase, mesh: v });
  }

  placeAt(g, HOUSE_SPOT.lat, HOUSE_SPOT.lon, 0, 0.5);
  houseBuildParts = { walls, roof, chimney, windows, scaffold, workers };
  updateHouseConstruction(Math.min(1, b.t / b.dur));
}

function updateHouseConstruction(p) {
  const q = houseBuildParts;
  if (!q) return;
  const smooth = THREE.MathUtils.smoothstep;
  const wallP = Math.max(0.02, smooth(p, 0.08, 0.58));
  q.walls.scale.y = wallP;
  q.walls.visible = p > 0.04;
  const roofP = Math.max(0.02, smooth(p, 0.56, 0.9));
  q.roof.scale.set(roofP, roofP, roofP);
  q.roof.visible = p > 0.54;
  const chimP = Math.max(0.02, smooth(p, 0.82, 0.96));
  q.chimney.scale.y = chimP;
  q.chimney.visible = p > 0.82;
  for (const win of q.windows) win.visible = p > 0.55;
  q.scaffold.visible = p < 0.95;
  for (const w of q.workers) w.mesh.visible = p < 0.98;
}

function startHouseConstruction(target) {
  Home.build = { target, t: 0, dur: HOUSE_BUILD_DUR };
  closeBuild();
  rebuildHomestead();
  burst(homeSpot(HOUSE_SPOT.lat, HOUSE_SPOT.lon, 1.0), 0xd8c7a1, 12, 1.6);
  chime(380);
  toast(`🔨 ${HOUSE_BUILD_NAMES[target] || 'Home'} under construction — watch it rise!`);
  saveCheckpoint();
}

function completeHouseConstruction() {
  const b = Home.build;
  if (!b) return;
  const name = HOUSE_BUILD_NAMES[b.target] || 'Home';
  Home.house = b.target;
  Home.build = null;
  rebuildHomestead();
  const c = homeSpot(HOUSE_SPOT.lat, HOUSE_SPOT.lon, 1.4);
  burst(c, 0x9df0a8, 22, 2.4);
  burst(c, 0xffd97a, 10, 1.6);
  chime(760);
  toast(`🏠 ${name} complete!`);
  if (onGainXp) onGainXp(30, c);
  renderBuild();
  saveCheckpoint();
}

tickers.push((t, dt) => {
  const b = Home.build;
  if (!b) return;
  b.t = Math.min(b.dur, b.t + dt);
  const p = b.dur > 0 ? b.t / b.dur : 1;
  updateHouseConstruction(p);
  for (const w of houseBuildParts?.workers || []) {
    w.arm.rotation.x = -0.95 + Math.sin(t * 8.5 + w.phase) * 0.85;
    w.arm.rotation.z = Math.sin(t * 4.2 + w.phase) * 0.08;
  }
  b.dust = (b.dust ?? 0) - dt;
  if (b.dust <= 0) {
    b.dust = 0.55;
    burst(homeSpot(HOUSE_SPOT.lat, HOUSE_SPOT.lon, 0.6 + p * 1.4), 0xd8c7a1, 3, 1.0);
  }
  if (b.t >= b.dur) completeHouseConstruction();
});

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
  Home.chimneyG = null;
  houseBuildParts = null;
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
    if (onGainXp) onGainXp(12, plotMesh[i].g.position.clone());
  } else if (p.crop && !p.water) {
    const noWell = !Home.well || Home.dmg.well;
    if (noWell && meters.energy < 3) return toast('😮‍💨 Too tired to haul water from the pond.');
    if (noWell) meters.energy = Math.max(0, meters.energy - 3);
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
function houseReq(target, missingWhy) {
  if (Home.house >= target) return { ok: false, why: 'Built ✓' };
  if (Home.build) return { ok: false, why: 'Construction in progress…' };
  if (Home.house === target - 1) return { ok: true };
  return { ok: false, why: missingWhy };
}
const BUILD_DEFS = [
  { id: 'hut', name: 'Mud Hut', cost: { wood: 3 }, blurb: 'First real roof. Better sleep.', houseTier: 1, req: () => houseReq(1, '') },
  { id: 'house1', name: 'Farmhouse', cost: { wood: 8, stone: 4 }, blurb: '3 beds, cooking corner. Marriage-ready.', houseTier: 2, req: () => houseReq(2, 'Needs hut first') },
  { id: 'house2', name: 'Big Farmhouse + cellar', cost: { wood: 10, stone: 8, gold: 10 }, blurb: '4 beds. Cellar keeps food, shelters tornadoes.', houseTier: 3, req: () => houseReq(3, 'Needs farmhouse first') },
  { id: 'house3', name: 'Manor', cost: { wood: 12, stone: 10, gold: 25 }, blurb: '6 beds. The talk of the planet.', houseTier: 4, req: () => houseReq(4, 'Needs big farmhouse first') },
  { id: 'pack', name: 'Big Pack', cost: { wood: 4, wool: 2 }, blurb: 'Stitched pockets. +8 pack room.', req: () => (packBonus >= 8 ? { ok: false, why: 'Roomy ✓' } : { ok: true }), apply: () => { packBonus += 8; } },
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
  if (b.houseTier) { startHouseConstruction(b.houseTier); return; }
  b.apply();
  rebuildHomestead();
  burst(homeSpot(HOME.lat, HOME.lon, 1.5), 0x9df0a8, 18, 2.4);
  chime(700);
  toast(`🔨 ${b.name} done!`);
  if (onGainXp) onGainXp(20, homeSpot(HOME.lat, HOME.lon, 1.5));
  renderBuild();
  saveCheckpoint();
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
  const featherM = furM('hen', 0xf7f3ec, ['#e6ddc9', '#ffffff', '#efe6d4'], { n: 150, rMin: 1, rMax: 2.6 });
  const wingM = mat(0xefe8d8);
  const combM = mat(0xd93a3a), beakM = mat(0xe8a33d), legM = mat(0xe8b25f);
  const body = new THREE.Group(); body.position.set(0, 0.4, 0); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.3, 12, 9), featherM, 0, 0, -0.02));
  body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), featherM, 0, 0.13, -0.17, false)); // back pouf
  // tail feathers, fanned up and back
  const tail = new THREE.Group(); tail.position.set(0, 0.16, -0.26); body.add(tail);
  for (let k = -1; k <= 1; k++) {
    const f = mesh(new THREE.BoxGeometry(0.09, 0.34, 0.03), k ? mat(0xc9bda0) : featherM, 0, 0.15, -0.02, false);
    f.rotation.x = -0.85 + Math.abs(k) * 0.18; f.rotation.z = k * 0.35;
    tail.add(f);
  }
  // folded wings (flank pivots, so they can flutter)
  const wings = [];
  for (const sx of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(sx * 0.14, 0.05, -0.02); wg.userData.base = 0;
    const w = mesh(new THREE.SphereGeometry(0.2, 10, 8), wingM, sx * 0.1, 0, 0, false);
    w.scale.set(0.4, 1.0, 1.5); wg.add(w);
    body.add(wg); wings.push(wg);
  }
  // neck + head with comb, wattle, beak
  const head = new THREE.Group(); head.position.set(0, 0.24, 0.2); body.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.2, 8), featherM, 0, -0.08, -0.04, false));
  head.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), featherM, 0, 0.06, 0.02));
  for (let k = -1; k <= 1; k++)
    head.add(mesh(new THREE.SphereGeometry(k ? 0.045 : 0.06, 7, 6), combM, 0, 0.19 - Math.abs(k) * 0.015, -0.06 + k * 0.09, false));
  head.add(mesh(new THREE.SphereGeometry(0.045, 7, 6), combM, 0, 0.08, 0.15, false)); // wattle
  const beak = mesh(new THREE.ConeGeometry(0.055, 0.16, 6), beakM, 0, 0.03, 0.18, false);
  beak.rotation.x = Math.PI / 2; head.add(beak);
  for (const sx of [-1, 1])
    head.add(mesh(new THREE.SphereGeometry(0.032, 6, 5), mat(0x1a1512), sx * 0.08, 0.09, 0.1, false));
  // legs with three-toed feet
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.09, 0.24, 0.02); g.add(hip);
    hip.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 6), legM, 0, -0.1, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.13), legM, 0, -0.21, 0.03, false));
    for (let k = -1; k <= 1; k++)
      hip.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.09), legM, k * 0.035, -0.21, 0.11, false));
    legs.push(hip);
  }
  g.scale.setScalar(0.85);
  g.userData.anim = {
    legs, head, tail, body, wings, bodyBob: 0.03, cadence: 11, amp: 0.7,
    graze: 1.0, grazeSpeed: 1.25, headDrop: 0.22, tailAmp: 0.5, tailSpeed: 4, flap: 11, flapAmp: 0.14,
  };
  return g;
}
function makeFarmSheep() {
  return makeSheep(0.6);
}
function makeCow() {
  const g = new THREE.Group();
  const hideM = furM('cow', 0x9a6b42, ['#f3ece2', '#7a5230'], { n: 8, rMin: 9, rMax: 16, aMin: 0.5, aMax: 0.85 }); // big patches
  const creamM = mat(0xf3ece2), pinkM = mat(0xe8a9a0), hoofM = mat(0x4a4038);
  const body = new THREE.Group(); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.62, 14, 10), hideM, 0, 0.95, 0);
  torso.scale.set(1.0, 1.0, 1.55); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.44, 12, 9), hideM, 0, 1.02, 0.62, false)); // shoulders
  body.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), pinkM, 0, 0.6, -0.62, false)); // udder
  const head = new THREE.Group(); head.position.set(0, 1.12, 1.0); body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.28, 12, 9), hideM, 0, 0.04, 0);
  skull.scale.set(0.95, 1, 1.2); head.add(skull);
  head.add(mesh(new THREE.BoxGeometry(0.3, 0.24, 0.3), creamM, 0, -0.08, 0.24, false)); // muzzle
  head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), pinkM, 0, -0.06, 0.4, false)); // nose
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0x191512), sx * 0.15, 0.1, 0.21, false));
    const ear = mesh(new THREE.SphereGeometry(0.12, 8, 6), hideM, sx * 0.3, 0.05, 0, false);
    ear.scale.set(0.55, 0.35, 1); ear.rotation.z = sx * 0.5; head.add(ear);
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.22, 6), creamM, sx * 0.2, 0.23, -0.02, false);
    horn.rotation.z = -sx * 0.6; head.add(horn);
  }
  // tail with a dark switch
  const tail = new THREE.Group(); tail.position.set(0, 1.12, -0.95); body.add(tail);
  tail.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.8, 6), hideM, 0, -0.4, 0, false));
  tail.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 6), mat(0x4a382a), 0, -0.88, 0, false));
  // legs + hooves (FL, FR, BL, BR)
  const legs = [];
  for (const [lx, lz] of [[0.32, 0.5], [-0.32, 0.5], [0.32, -0.5], [-0.32, -0.5]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.62, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.6, 8), hideM, 0, -0.28, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.17, 0.14, 0.19), hoofM, 0, -0.55, 0.01, false));
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, body, bodyBob: 0.035, cadence: 6, amp: 0.45,
    graze: 0.75, grazeSpeed: 0.45, headDrop: 0.2, tailAmp: 0.55, tailSpeed: 2.4,
  };
  return g;
}
function makeDeer() {
  const g = new THREE.Group();
  const hideM = furM('deer', 0xa86f42, ['#8a5a33', '#d9a66a', '#f3e9dc'], { n: 95, rMin: 1, rMax: 3, aMax: 0.35 });
  const creamM = mat(0xf3e9dc), darkM = mat(0x2a211b), antlerM = mat(0x6e543b);
  const body = new THREE.Group(); body.position.set(0, 1.12, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.55, 12, 9), hideM, 0, 0, 0);
  torso.scale.set(0.9, 0.9, 1.55); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), hideM, 0, 0.04, 0.58, false));
  for (const [sx, sz] of [[-0.22, 0.1], [0.24, -0.25], [0, -0.6]])
    body.add(mesh(new THREE.SphereGeometry(0.075, 6, 5), creamM, sx, 0.43, sz, false)); // fawn spots
  const neck = new THREE.Group(); neck.position.set(0, 0.2, 0.55); neck.rotation.x = -0.38; body.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.9, 7), hideM, 0, 0.42, 0));
  const head = new THREE.Group(); head.position.set(0, 0.92, 0.02); neck.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.24, 10, 8), hideM, 0, 0, 0.06);
  skull.scale.set(0.9, 0.95, 1.2); head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), creamM, 0, -0.05, 0.28, false));
  head.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), darkM, 0, -0.04, 0.41, false));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), darkM, sx * 0.13, 0.08, 0.22, false));
    const ear = mesh(new THREE.ConeGeometry(0.1, 0.34, 6), hideM, sx * 0.2, 0.2, 0, false);
    ear.rotation.z = sx * 0.7; ear.rotation.x = -0.25; head.add(ear);
    const ant = new THREE.Group(); ant.position.set(sx * 0.11, 0.2, 0); head.add(ant);
    ant.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.52, 5), antlerM, 0, 0.24, 0, false));
    const tine = mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.32, 5), antlerM, sx * 0.1, 0.36, 0, false);
    tine.rotation.z = -sx * 0.65; ant.add(tine);
    const tine2 = mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.26, 5), antlerM, -sx * 0.08, 0.12, 0, false);
    tine2.rotation.z = sx * 0.8; ant.add(tine2);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.15, -0.82); body.add(tail);
  tail.add(mesh(new THREE.ConeGeometry(0.1, 0.38, 6), creamM, 0, -0.15, -0.03, false));
  const legs = [];
  for (const [lx, lz] of [[0.28, 0.52], [-0.28, 0.52], [0.28, -0.52], [-0.28, -0.52]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.72, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.62, 6), hideM, 0, -0.3, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.13, 0.1, 0.18), darkM, 0, -0.63, 0.02, false));
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, body, bodyBob: 0.04, cadence: 5.5, amp: 0.5,
    graze: 0.65, grazeSpeed: 0.3, headDrop: 0.16, tailAmp: 0.3, tailSpeed: 2.2,
  };
  return g;
}
function makeHare(base = 0xc9a070, tones = ['#b9885a', '#f3e9dc']) {
  const g = new THREE.Group();
  const fur = furM('hare' + base, base, tones, { n: 55, rMin: 1, rMax: 2.2, aMax: 0.25 });
  const creamM = mat(0xf3e9dc), darkM = mat(0x2a211b), pinkM = mat(0xe8a9a0);
  const body = new THREE.Group(); body.position.set(0, 0.5, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.28, 10, 8), fur, 0, 0, 0);
  torso.scale.set(0.95, 0.9, 1.25); body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.22, 0.28); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.18, 9, 7), fur, 0, 0, 0));
  head.add(mesh(new THREE.SphereGeometry(0.1, 7, 6), creamM, 0, -0.04, 0.16, false));
  head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), pinkM, 0, -0.01, 0.25, false));
  const ears = [], earBase = [];
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), darkM, sx * 0.1, 0.06, 0.12, false));
    const ear = new THREE.Group(); ear.position.set(sx * 0.08, 0.13, -0.02); head.add(ear);
    ear.add(mesh(new THREE.CapsuleGeometry(0.055, 0.32, 3, 6), fur, 0, 0.2, 0, false));
    ear.add(mesh(new THREE.CapsuleGeometry(0.028, 0.26, 3, 5), pinkM, 0, 0.2, 0.03, false));
    ear.rotation.z = sx * 0.15; ear.rotation.x = -0.12;
    ears.push(ear); earBase.push(ear.rotation.z);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.3); body.add(tail);
  tail.add(mesh(new THREE.SphereGeometry(0.1, 7, 6), creamM, 0, 0, 0, false));
  const legs = [];
  for (const [lx, lz] of [[0.14, 0.18], [-0.14, 0.18], [0.16, -0.2], [-0.16, -0.2]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.38, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.25, 5), fur, 0, -0.13, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.09, 0.06, 0.14), creamM, 0, -0.26, 0.03, false));
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, ears, earBase, body, bodyBob: 0.1, cadence: 8, amp: 0.65,
    graze: 0.45, grazeSpeed: 1.4, headDrop: 0.06, tailAmp: 0.15, tailSpeed: 3.5,
  };
  return g;
}
function makeFennec() {
  const g = new THREE.Group();
  const fur = furM('fennec', 0xe3b77a, ['#c99758', '#f3e2b8', '#6e4e30'], { n: 70, rMin: 1, rMax: 2.4, aMax: 0.3 });
  const creamM = mat(0xf3e9dc), darkM = mat(0x2a211b), pinkM = mat(0xd98f86);
  const body = new THREE.Group(); body.position.set(0, 0.56, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.3, 10, 8), fur, 0, 0, 0);
  torso.scale.set(0.85, 0.8, 1.3); body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.22, 0.33); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), fur, 0, 0, 0));
  head.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), creamM, 0, -0.06, 0.18, false));
  head.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), darkM, 0, -0.035, 0.29, false));
  const ears = [], earBase = [];
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), darkM, sx * 0.12, 0.07, 0.14, false));
    const ear = new THREE.Group(); ear.position.set(sx * 0.14, 0.14, 0); head.add(ear);
    const outer = mesh(new THREE.ConeGeometry(0.13, 0.55, 5), fur, 0, 0.25, 0, false);
    outer.rotation.z = -sx * 0.12; ear.add(outer);
    const inner = mesh(new THREE.ConeGeometry(0.075, 0.4, 5), pinkM, 0, 0.24, 0.035, false);
    inner.rotation.z = -sx * 0.12; ear.add(inner);
    ear.rotation.z = sx * 0.18;
    ears.push(ear); earBase.push(ear.rotation.z);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.35); body.add(tail);
  tail.add(mesh(new THREE.CapsuleGeometry(0.085, 0.42, 3, 7), fur, 0, -0.22, -0.05, false));
  tail.add(mesh(new THREE.SphereGeometry(0.09, 7, 6), creamM, 0, -0.45, -0.05, false));
  const legs = [];
  for (const [lx, lz] of [[0.16, 0.2], [-0.16, 0.2], [0.16, -0.22], [-0.16, -0.22]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.42, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.34, 5), fur, 0, -0.17, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.15), darkM, 0, -0.35, 0.03, false));
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, ears, earBase, body, bodyBob: 0.035, cadence: 7, amp: 0.55,
    graze: 0.4, grazeSpeed: 1.0, headDrop: 0.06, tailAmp: 0.35, tailSpeed: 2.8,
  };
  return g;
}
function makeEmberLizard() {
  const g = new THREE.Group();
  const hideM = furM('ember-lizard', 0x4a3a32, ['#2e2420', '#7a4a32', '#d96a2f'], { n: 65, rMin: 1, rMax: 2.2, aMax: 0.35 });
  const emberM = mat(0xff7a3d, { emissive: 0xff4a1a, emissiveIntensity: 0.8 });
  const darkM = mat(0x221a16);
  const body = new THREE.Group(); body.position.set(0, 0.24, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.3, 10, 7), hideM, 0, 0, 0);
  torso.scale.set(1.1, 0.52, 1.65); body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.03, 0.52); body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.2, 9, 7), hideM, 0, 0, 0);
  skull.scale.set(0.95, 0.7, 1.1); head.add(skull);
  for (const sx of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.038, 6, 5), emberM, sx * 0.11, 0.08, 0.12, false));
  const tail = new THREE.Group(); tail.position.set(0, 0, -0.45); body.add(tail);
  tail.add(mesh(new THREE.CylinderGeometry(0.11, 0.04, 0.85, 6), hideM, 0, 0, -0.4, false));
  for (let i = 0; i < 3; i++) body.add(mesh(new THREE.ConeGeometry(0.045, 0.18, 4), emberM, 0, 0.22, 0.25 - i * 0.24, false));
  const legs = [];
  for (const [lx, lz] of [[0.38, 0.3], [-0.38, 0.3], [0.38, -0.28], [-0.38, -0.28]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.18, lz);
    hip.add(mesh(new THREE.BoxGeometry(0.3, 0.07, 0.1), hideM, lx > 0 ? 0.13 : -0.13, 0, 0, false));
    hip.add(mesh(new THREE.BoxGeometry(0.11, 0.055, 0.18), darkM, lx > 0 ? 0.28 : -0.28, 0, 0.04, false));
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, body, legAxis: 'z', bodyBob: 0.02, cadence: 11, amp: 0.45,
    graze: 0.1, grazeSpeed: 1.8, tailAmp: 0.65, tailSpeed: 4,
  };
  return g;
}
function makeSeaTurtle() {
  const g = new THREE.Group();
  const shellM = mat(0x3f9a6b, { roughness: 0.8 }), rimM = mat(0x2f6e4f), skinM = mat(0x7da88a);
  const creamM = mat(0xd9e6c8);
  const shell = mesh(new THREE.SphereGeometry(0.6, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), shellM, 0, 0.18, 0);
  shell.scale.set(1, 0.45, 1.25); g.add(shell);
  const rim = mesh(new THREE.TorusGeometry(0.55, 0.06, 5, 12), rimM, 0, 0.18, 0, false);
  rim.rotation.x = Math.PI / 2; rim.scale.z = 1.2; g.add(rim);
  const belly = mesh(new THREE.SphereGeometry(0.5, 10, 6), creamM, 0, 0.14, 0, false);
  belly.scale.set(1, 0.22, 1.2); g.add(belly);
  for (const [x, z] of [[-0.2, 0.2], [0.2, 0.1], [-0.1, -0.3], [0.24, -0.35]])
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.035, 0.18), rimM, x, 0.42, z, false)); // shell scutes
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.62); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.18, 9, 7), skinM, 0, 0, 0));
  head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(0x191512), 0.1, 0.06, 0.14, false));
  head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(0x191512), -0.1, 0.06, 0.14, false));
  const flippers = [], bases = [], sides = [];
  for (const [sx, z, ph] of [[1, 0.28, 1], [-1, 0.28, -1], [1, -0.35, 1], [-1, -0.35, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.48, 0.14, z);
    const fin = mesh(new THREE.BoxGeometry(0.48, 0.07, 0.22), skinM, sx * 0.24, 0, 0, false);
    fin.scale.z = ph > 0 ? 1 : 0.7; pivot.add(fin);
    pivot.rotation.z = sx * -0.12;
    g.add(pivot); flippers.push(pivot); bases.push(pivot.rotation.z); sides.push(sx);
  }
  const tail = mesh(new THREE.ConeGeometry(0.09, 0.24, 5), skinM, 0, 0.14, -0.62, false);
  tail.rotation.x = -Math.PI / 2; g.add(tail);
  g.userData.turtle = { flippers, bases, sides, head };
  return g;
}
function makeFish(color = 0x7ad9ff, s = 1) {
  const g = new THREE.Group();
  const bodyM = mat(color, { roughness: 0.45, emissive: color, emissiveIntensity: 0.12 });
  const finM = mat(0xd9f2ff, { side: THREE.DoubleSide, roughness: 0.6 });
  const body = mesh(new THREE.CapsuleGeometry(0.12, 0.34, 3, 7), bodyM, 0, 0, 0, false);
  body.rotation.x = Math.PI / 2; g.add(body);
  g.add(mesh(new THREE.ConeGeometry(0.075, 0.2, 4), finM, 0, 0.15, -0.02, false)); // dorsal fin
  const tail = new THREE.Group(); tail.position.set(0, 0, -0.33); g.add(tail);
  const fan = mesh(new THREE.ConeGeometry(0.16, 0.28, 4), finM, 0, 0, -0.12, false);
  fan.rotation.x = -Math.PI / 2; fan.scale.z = 0.45; tail.add(fan);
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.028, 6, 5), mat(0x191512), sx * 0.1, 0.05, 0.14, false));
    const side = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), finM, sx * 0.2, 0.01, 0.02, false);
    side.rotation.z = sx * 0.8; g.add(side);
  }
  g.userData.tail = tail;
  g.scale.setScalar(s);
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
    const walking = toT.length() > 0.4;
    if (walking) {
      const d = tangentStep(a.pos, toT, dt * 1.1);
      if (d) a.facing.lerp(d, 0.2).normalize();
    }
    const n = a.pos.clone().normalize();
    a.mesh.position.copy(a.pos).addScaledVector(n, Math.abs(Math.sin(t * 5 + a.phase)) * (walking ? 0.12 : 0.03));
    a.facing.addScaledVector(n, -a.facing.dot(n)).normalize();
    faceAlong(a.mesh, a.pos, a.facing);
    a.mesh.rotateZ(Math.sin(t * 5 + a.phase) * 0.05 * (walking ? 0.3 : 1));
    animateAnimal(a.mesh, t, walking ? Math.min(1, toT.length() / 2.5) : 0, dt);
    if (a.interact) a.interact.pos.copy(a.mesh.position);
  }
});
// --- guard dog ---
function makeDog() {
  const g = new THREE.Group();
  const fur = furM('dog', 0x9a6b42, ['#7a5230', '#b8855a', '#f3e9dc'], { n: 150, rMin: 1.2, rMax: 3 });
  const creamM = mat(0xf3e9dc), darkM = mat(0x33291f);
  const body = new THREE.Group(); body.position.set(0, 0.5, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.26, 12, 9), fur, 0, 0, 0);
  torso.scale.set(0.95, 1, 1.6); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), fur, 0, 0.02, 0.3, false)); // chest
  body.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), fur, 0, 0.04, -0.28, false)); // haunches
  body.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), creamM, 0, -0.12, 0.36, false)); // white bib
  const head = new THREE.Group(); head.position.set(0, 0.3, 0.4); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.22, 12, 9), fur, 0, 0.02, 0));
  head.add(mesh(new THREE.BoxGeometry(0.15, 0.13, 0.18), fur, 0, -0.03, 0.2, false)); // muzzle
  head.add(mesh(new THREE.SphereGeometry(0.05, 7, 6), darkM, 0, -0.01, 0.3, false)); // nose
  head.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), creamM, 0, -0.06, 0.24, false)); // muzzle blaze
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.085, 0.26, 6), darkM, sx * 0.17, 0.05, 0.02, false);
    ear.rotation.x = 2.0; ear.rotation.z = -sx * 0.45; // floppy, hanging forward
    head.add(ear); ears.push(ear);
    head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(0x1a1512), sx * 0.09, 0.07, 0.16, false));
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.42); body.add(tail);
  const t1 = mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.3, 6), fur, 0, 0.13, -0.05);
  t1.rotation.x = 0.75; tail.add(t1);
  const t2 = mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.24, 6), creamM, 0, 0.32, -0.14, false);
  t2.rotation.x = 1.05; tail.add(t2);
  const legs = [];
  for (const [lx, lz] of [[0.17, -0.3], [0.17, 0.3], [-0.17, -0.3], [-0.17, 0.3]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.42, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.34, 7), fur, 0, -0.17, 0, false));
    hip.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), creamM, 0, -0.34, 0.02, false)); // paw
    g.add(hip); legs.push(hip);
  }
  g.userData.tail = tail;
  g.userData.anim = {
    legs, head, tail, body, ears, earBase: ears.map((e) => e.rotation.z),
    bodyBob: 0.03, cadence: 10, amp: 0.6, graze: 0.35, grazeSpeed: 1.6, headDrop: 0.07, tailAmp: 0.45, tailSpeed: 4,
  };
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
  const moved = d.lastPos ? d.pos.distanceTo(d.lastPos) : 0;
  (d.lastPos || (d.lastPos = d.pos.clone())).copy(d.pos);
  const n = d.pos.clone().normalize();
  d.mesh.position.copy(d.pos).addScaledVector(n, Math.abs(Math.sin(t * 8 + d.phase)) * (moved > 0.002 ? 0.08 : 0.02));
  d.facing.addScaledVector(n, -d.facing.dot(n)).normalize();
  faceAlong(d.mesh, d.pos, d.facing);
  const m01 = Math.min(1, moved / Math.max(1e-4, dt * 5.5));
  animateAnimal(d.mesh, t, m01, dt);
  if (m01 < 0.3) d.mesh.userData.anim.tail.rotation.y += Math.sin(t * 12) * 0.3 * (1 - m01); // happy wag at rest
  if (d.interact) d.interact.pos.copy(d.mesh.position);
});
// --- wolves: stalk the herd at night, bounce off fences & lanterns ---
function makeWolf() {
  const g = new THREE.Group();
  const fur = furM('wolf', 0x5a5a66, ['#43434e', '#7c7c8a', '#e8eef2'], { n: 170, rMin: 1.2, rMax: 3 });
  const darkM = mat(0x2e2e36);
  const body = new THREE.Group(); body.position.set(0, 0.52, 0); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.28, 12, 9), fur, 0, 0, 0);
  torso.scale.set(0.95, 1, 1.7); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), fur, 0, 0.08, 0.34, false)); // ruff / shoulders
  body.add(mesh(new THREE.SphereGeometry(0.21, 10, 8), fur, 0, 0.03, -0.32, false)); // hips
  const head = new THREE.Group(); head.position.set(0, 0.3, 0.46); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.2, 12, 9), fur, 0, 0.02, 0));
  const snout = mesh(new THREE.ConeGeometry(0.11, 0.34, 7), fur, 0, -0.03, 0.24, false);
  snout.rotation.x = Math.PI / 2; head.add(snout);
  head.add(mesh(new THREE.SphereGeometry(0.05, 7, 6), darkM, 0, -0.04, 0.4, false)); // nose
  head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xd8d2c8), 0, -0.1, 0.24, false)); // pale chin
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.09, 0.26, 5), fur, sx * 0.13, 0.18, -0.02, false);
    ear.rotation.z = -sx * 0.22; ear.rotation.x = -0.12; head.add(ear);
    const inner = mesh(new THREE.ConeGeometry(0.05, 0.16, 5), darkM, sx * 0.13, 0.17, 0.02, false);
    inner.rotation.z = -sx * 0.22; head.add(inner);
  }
  const eyeM = mat(0xe03131, { emissive: 0x7a1010, emissiveIntensity: 0.8 });
  for (const sx of [-0.12, 0.12])
    head.add(mesh(new THREE.SphereGeometry(0.045, 7, 6), eyeM, sx, 0.06, 0.17, false));
  // bushy two-segment tail
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.5); body.add(tail);
  const t1 = mesh(new THREE.ConeGeometry(0.14, 0.4, 7), fur, 0, 0.1, -0.14, false);
  t1.rotation.x = -2.25; tail.add(t1);
  const t2 = mesh(new THREE.ConeGeometry(0.1, 0.3, 7), darkM, 0, 0.04, -0.44, false);
  t2.rotation.x = -1.75; tail.add(t2);
  const legs = [];
  for (const [lx, lz] of [[0.17, -0.34], [0.17, 0.34], [-0.17, -0.34], [-0.17, 0.34]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.46, lz);
    hip.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.4, 7), fur, 0, -0.2, 0, false));
    hip.add(mesh(new THREE.SphereGeometry(0.075, 8, 6), darkM, 0, -0.38, 0.02, false)); // paw
    g.add(hip); legs.push(hip);
  }
  g.userData.anim = {
    legs, head, tail, body, bodyBob: 0.03, cadence: 9, amp: 0.6,
    graze: 0.3, grazeSpeed: 0.8, headDrop: 0.05, tailAmp: 0.25, tailSpeed: 2,
  };
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
      () => `Wolf ❤ ${Math.max(0, Math.ceil(w.hp))} — tap to fight`,
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
  playerAttackCd = Math.max(0.3, window.__rpgSwing || 0.55);
  startChop();
  setTimeout(() => {
    if (w.hp <= 0 || playerDead) return;
    if (player.position.distanceTo(w.mesh.position) > 5.2) return;
    let dmg = Math.round((12 + Math.random() * 8) * (tools.axe || 1) * (window.__rpgDmgMult || 1));
    if (critBuff > 0) { dmg = Math.round(dmg * 1.8); critBuff--; toast('💥 Critical strike!'); }
    w.hp -= dmg;
    burst(w.mesh.position.clone(), 0xffd97a, 12, 2);
    spawnPopup(w.mesh.position.clone(), `-${dmg}`, '#ffffff');
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
  if (activeTask?.interact?.wolf === w) clearAutoTask();
  if (onGainXp) onGainXp(30, w.mesh.position.clone());
  spawnPopup(w.mesh.position.clone(), '🐺 Fang +2🍎', '#ffd97a');
  saveCheckpoint();
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
      // strike: livestock instantly, but the traveler gets a dodgeable telegraph
      if (w.windup > 0) {
        w.windup -= dt;
        if (w.windup <= 0) {
          w.atkCd = 1.5;
          if (w.huntsPlayer && !playerDead && w.pos.distanceTo(player.position) < 2.6) {
            damagePlayer(Math.round(6 + Math.random() * 5), w.mesh.position);
            toast('🐺 The wolf snaps at you! Tap it to fight back — or dodge (Shift)!');
          }
        }
      } else if (w.atkCd <= 0) {
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
          w.windup = 0.6;
          burst(w.mesh.position.clone(), 0xe03131, 6, 1.2);
          spawnPopup(w.mesh.position.clone(), '❗', '#ff6b6b', true);
          chime(140);
        }
      }
    }
    const n = w.pos.clone().normalize();
    w.mesh.position.copy(w.pos).addScaledVector(n, Math.abs(Math.sin(t * 7 + w.phase)) * 0.08);
    w.facing.addScaledVector(n, -w.facing.dot(n)).normalize();
    faceAlong(w.mesh, w.pos, w.facing);
    const moved = w.lastPos ? w.pos.distanceTo(w.lastPos) : 0;
    (w.lastPos || (w.lastPos = w.pos.clone())).copy(w.pos);
    animateAnimal(w.mesh, t, Math.min(1, moved / Math.max(1e-4, dt * 5)), dt);
    if (w.prey || w.huntsPlayer) w.mesh.userData.anim.head.rotation.x += 0.22; // head low on the hunt
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

// --- ambient wildlife: harmless wanderers that make each biome feel inhabited ---
const ambientWanderers = [];
function addAmbientWanderer(meshObj, lat, lon, radius = 2.4, speed = 0.22, phase = rand(Math.PI * 2)) {
  const home = latLonToVec3(lat, lon, 0).normalize();
  const east = V3(-home.z, 0, home.x);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(home, east).normalize();
  const start = home.clone().multiplyScalar(R + heightFor(home) + 0.06);
  meshObj.position.copy(start);
  scene.add(meshObj);
  const entry = { mesh: meshObj, home, radius, speed, phase };
  ambientWanderers.push(entry);
  let prev = start.clone();
  tickers.push((t, dt) => {
    const a = t * speed + phase;
    const n = home.clone()
      .addScaledVector(east, Math.sin(a) * radius / R)
      .addScaledVector(north, Math.sin(a * 0.73 + 1.3) * radius * 0.55 / R)
      .normalize();
    const p = n.clone().multiplyScalar(R + heightFor(n) + 0.05);
    const step = p.clone().sub(prev);
    if (step.lengthSq() > 1e-5) {
      const dir = step.clone().addScaledVector(n, -step.dot(n));
      if (dir.lengthSq() > 1e-6) faceAlong(meshObj, p, dir.normalize());
    }
    meshObj.position.copy(p);
    const hop = meshObj.userData.ambientHop || 0;
    if (hop) meshObj.position.addScaledVector(n, Math.abs(Math.sin(t * (meshObj.userData.hopSpeed || 5) + phase)) * hop);
    prev.copy(p);
    animateAnimal(meshObj, t, 0.4, dt);
  });
}
const deerA = makeDeer(); addAmbientWanderer(deerA, 20, 148, 3.2, 0.16);
const deerB = makeDeer(); addAmbientWanderer(deerB, 23, 164, 2.7, 0.13, 2.1);
const deerC = makeDeer(); addAmbientWanderer(deerC, 25, 153, 2.4, 0.18, 4.4);
for (const [la, lo, ph] of [[4, 32, 0.8], [8, 45, 2.6]]) {
  const hare = makeHare(0xb9885a, ['#8a5a33', '#d9b988', '#f3e9dc']);
  hare.userData.ambientHop = 0.1; hare.userData.hopSpeed = 4.6;
  addAmbientWanderer(hare, la, lo, 1.7, 0.34, ph);
}
for (const [la, lo, ph] of [[53, 116, 1.2], [56, 142, 3.8], [58, 100, 5.2], [51, 151, 2.4]]) {
  const hare = makeHare(0xe9e4d8, ['#f7f2e6', '#c9c2b4', '#ffffff']);
  hare.userData.ambientHop = 0.13; hare.userData.hopSpeed = 4.2;
  addAmbientWanderer(hare, la, lo, 1.8, 0.3, ph);
}
for (const [la, lo, ph] of [[7, 116, 0.4], [13, 103, 3.1], [15, 119, 5.5]]) {
  const fennec = makeFennec();
  addAmbientWanderer(fennec, la, lo, 1.9, 0.3, ph);
}
for (const [la, lo, ph] of [[18, 318, 1.1], [16, 340, 3.4], [12, 310, 5.8], [21, 335, 0.2]]) {
  const lizard = makeEmberLizard();
  addAmbientWanderer(lizard, la, lo, 1.25, 0.5, ph);
}

// sea turtles surface for air in the warm shallows
function addSeaTurtle(lat, lon, phase = rand(Math.PI * 2)) {
  const turtle = makeSeaTurtle();
  const center = latLonToVec3(lat, lon, 0).normalize();
  const east = V3(-center.z, 0, center.x);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(center, east).normalize();
  turtle.position.copy(center).multiplyScalar(R + 0.11);
  scene.add(turtle);
  tickers.push((t) => {
    const a = t * 0.14 + phase;
    const n = center.clone()
      .addScaledVector(east, Math.cos(a) * 3.2 / R)
      .addScaledVector(north, Math.sin(a) * 2.4 / R)
      .normalize();
    const p = n.clone().multiplyScalar(R + 0.11 + Math.sin(t * 1.6 + phase) * 0.02);
    const d = east.clone().multiplyScalar(-Math.sin(a) * 3.2)
      .addScaledVector(north, Math.cos(a) * 2.4);
    if (d.lengthSq() > 1e-6) faceAlong(turtle, p, d.normalize());
    turtle.position.copy(p);
    const rig = turtle.userData.turtle;
    if (rig) {
      rig.head.rotation.y = Math.sin(t * 0.7 + phase) * 0.24;
      for (let i = 0; i < rig.flippers.length; i++)
        rig.flippers[i].rotation.z = rig.bases[i] + Math.sin(t * 2.2 + phase + i * 1.4) * 0.24 * rig.sides[i];
    }
  });
}
addSeaTurtle(-22, 295, 0.7);
addSeaTurtle(-1, 216, 2.9);
addSeaTurtle(-6, 244, 4.6);

// --- fish schools: bright surface shoals that make the sea feel alive ---
function addFishSchool(lat, lon, count = 5, spread = 2.2, phase = rand(Math.PI * 2)) {
  const center = latLonToVec3(lat, lon, 0).normalize();
  const east = V3(-center.z, 0, center.x);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(center, east).normalize();
  const colors = [0x7ad9ff, 0xffb35a, 0xd9f2ff, 0x6ae0c8];
  const fish = [];
  for (let i = 0; i < count; i++) {
    const f = makeFish(colors[i % colors.length], rand(0.8, 1.35));
    const n0 = center.clone().multiplyScalar(R + 0.13);
    f.position.copy(n0);
    f.userData.phase = rand(Math.PI * 2);
    scene.add(f);
    fish.push({ g: f, r: spread * rand(0.55, 1.0), off: rand(Math.PI * 2) });
  }
  tickers.push((t) => {
    for (const f of fish) {
      const a = t * 0.16 + phase + f.off * 0.18;
      const n = center.clone()
        .addScaledVector(east, Math.cos(a) * f.r / R)
        .addScaledVector(north, Math.sin(a) * f.r * 0.72 / R)
        .normalize();
      const p = n.clone().multiplyScalar(R + 0.13 + Math.sin(t * 2.2 + f.g.userData.phase) * 0.015);
      const d = east.clone().multiplyScalar(-Math.sin(a) * f.r)
        .addScaledVector(north, Math.cos(a) * f.r * 0.72);
      if (d.lengthSq() > 1e-6) faceAlong(f.g, p, d.normalize());
      f.g.position.copy(p);
      f.g.rotateZ(Math.sin(t * 2 + f.g.userData.phase) * 0.08);
      if (f.g.userData.tail) f.g.userData.tail.rotation.y = Math.sin(t * 8 + f.g.userData.phase) * 0.55;
    }
  });
}
addFishSchool(-25, 291, 6, 2.4, 0.4);
addFishSchool(-28, 302, 5, 2.1, 2.5);
addFishSchool(-2, 216, 5, 1.9, 1.3);
addFishSchool(5, 245, 6, 2.3, 3.8);
addFishSchool(-9, 235, 4, 1.7, 5.4);

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
  saveCheckpoint();
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
  saveCheckpoint();
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
  saveCheckpoint();
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
const ROT_DAYS = { food: 4, fish: 2, egg: 3, milk: 2, meal: 8 };
function overnightSpoilage() {
  const cellar = Home.house >= 3 && !Home.dmg.house;
  for (const k of ['food', 'fish', 'egg', 'milk', 'meal']) {
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
    saveCheckpoint();
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
  inv.wood = 0; inv.stone = 0; inv.gold = 2; inv.food = 4; inv.fish = 0; inv.wool = 0; inv.remedy = 1;
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
  saveCheckpoint();
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
      saveCheckpoint();
    }
  }
});

// ---------- sequential trail objectives ----------
const qInZone = (zone) => {
  const b = biomeAt(playerPos.clone().normalize());
  return zone === 'cove' ? (b === 'cove' || b === 'lagoon') : b === zone;
};
const qStage = (id) => byId(id)?.stage || 0;
const qWonder = (id) => !!byId(id)?.done;
const qGold = (n) => () => `Earn ${Math.min(n, Life.stats.goldEarned || 0)}/${n}🪙 total`;
const QUESTS = [
  {
    id: 'camp', title: 'Make Camp',
    hint: 'Clover Fields · your axe is in hand. Chop any tree for 3 wood, then press H.',
    subs: [
      { id: 'camp-wood', text: 'Gather 3 wood', done: () => inv.wood >= 3 },
      { id: 'camp-hut', text: 'Build a Mud Hut (H)', done: () => Home.house >= 1 },
    ],
    auto: () => Home.house >= 1,
  },
  {
    id: 'night', title: 'First Night',
    hint: 'Home · sleep in your bed, then cook and eat a meal.',
    subs: [
      { id: 'night-sleep', text: 'Sleep until dawn', done: () => Life.nights >= 1 },
      { id: 'night-meal', text: 'Cook & eat a hearty meal', done: () => (Life.stats.meals || 0) >= 1 },
    ],
    auto: () => Life.nights >= 1 && (Life.stats.meals || 0) >= 1,
  },
  {
    id: 'roots', title: 'Put Down Roots',
    hint: 'Homestead board (H) · a farmhouse, a well, and your first harvest.',
    subs: [
      { id: 'roots-house', text: 'Build a Farmhouse', done: () => Home.house >= 2 },
      { id: 'roots-well', text: 'Dig a Stone Well', done: () => !!Home.well },
      { id: 'roots-harvest', text: 'Harvest a field plot', done: () => (Life.stats.harvests || 0) >= 1 },
    ],
    auto: () => Home.house >= 2 && !!Home.well && (Life.stats.harvests || 0) >= 1,
  },
  {
    id: 'flame', title: 'Tend the Flame',
    hint: 'Fernwood · find the eternal flame among the pines.',
    subs: [
      { id: 'flame-reach', text: 'Reach Fernwood', done: () => qInZone('forest') || qStage('flame') > 0 },
      { id: 'flame-1', text: 'Tend the flame (1/3)', done: () => qStage('flame') >= 1 },
      { id: 'flame-2', text: 'Feed the flame (2/3)', done: () => qStage('flame') >= 2 },
      { id: 'flame-3', text: 'Nurture the blaze (3/3)', done: () => qWonder('flame') },
    ],
    auto: () => qWonder('flame'),
  },
  {
    id: 'harvest', title: 'Bountiful Harvest',
    hint: 'Clover Fields · the three rows beside the red barn.',
    subs: [
      { id: 'harvest-reach', text: 'Reach Clover Fields', done: () => qInZone('farm') || qStage('harvest') > 0 },
      { id: 'harvest-1', text: 'Plant the rows', done: () => qStage('harvest') >= 1 },
      { id: 'harvest-2', text: 'Water the sprouts', done: () => qStage('harvest') >= 2 },
      { id: 'harvest-3', text: 'Bring in the harvest', done: () => qWonder('harvest') },
    ],
    auto: () => qWonder('harvest'),
  },
  {
    id: 'oasis', title: 'Wake the Oasis',
    hint: 'Sunstone Oasis · the quiet spring among the golden dunes.',
    subs: [
      { id: 'oasis-reach', text: 'Reach Sunstone Oasis', done: () => qInZone('oasis') || qStage('oasis') > 0 },
      { id: 'oasis-1', text: 'Brush the sand', done: () => qStage('oasis') >= 1 },
      { id: 'oasis-2', text: 'Turn the sunstones', done: () => qStage('oasis') >= 2 },
      { id: 'oasis-3', text: 'Wake the oasis spring', done: () => qWonder('oasis') },
    ],
    auto: () => qWonder('oasis'),
  },
  {
    id: 'bell', title: 'Ring the Bell',
    hint: 'Shell Cove · the dune bell above the tide.',
    subs: [
      { id: 'bell-reach', text: 'Reach Shell Cove', done: () => qInZone('cove') || qWonder('bell') },
      { id: 'bell-ring', text: 'Ring the dune bell', done: () => qWonder('bell') },
    ],
    auto: () => qWonder('bell'),
  },
  {
    id: 'light', title: 'Light the Lighthouse',
    hint: 'Tideglass Reef · swim out and wake the beacon.',
    subs: [
      { id: 'light-reach', text: 'Reach Tideglass Reef', done: () => qInZone('reef') || qWonder('light') },
      { id: 'light-lit', text: 'Light the lighthouse', done: () => qWonder('light') },
    ],
    auto: () => qWonder('light'),
  },
  {
    id: 'scan', title: 'Scan the Volcano',
    hint: 'Ember Heights · stand at the crater tripod and hold still.',
    subs: [
      { id: 'scan-reach', text: 'Reach Ember Heights', done: () => qInZone('volcano') || qWonder('scan') },
      { id: 'scan-done', text: 'Scan the volcano (hold still)', done: () => qWonder('scan') },
    ],
    auto: () => qWonder('scan'),
  },
  {
    id: 'aurora', title: 'Wake the Aurora',
    hint: 'Northlight · the standing stones beneath the sky-fire.',
    subs: [
      { id: 'aurora-reach', text: 'Reach Northlight', done: () => qInZone('arctic') || qWonder('aurora') },
      { id: 'aurora-done', text: 'Wake the aurora', done: () => qWonder('aurora') },
    ],
    auto: () => qWonder('aurora'),
  },
  {
    id: 'prosper', title: 'Prosper',
    hint: 'Homestead board & villagers · more hands, more gold.',
    subs: [
      { id: 'prosper-barn', text: 'Raise a Barn', done: () => Home.barn >= 1 },
      { id: 'prosper-hand', text: 'Hire a farmhand', done: () => Life.workers.length >= 1 },
      { id: 'prosper-gold', text: qGold(50), done: () => (Life.stats.goldEarned || 0) >= 50 },
    ],
    auto: () => Home.barn >= 1 && Life.workers.length >= 1 && (Life.stats.goldEarned || 0) >= 50,
  },
  {
    id: 'family', title: 'A Full Hearth',
    hint: 'Lena or Marina · gifts, a ring, marriage, then a child.',
    subs: [
      { id: 'family-marry', text: 'Marry your sweetheart', done: () => !!Life.spouse },
      { id: 'family-child', text: 'Welcome a child', done: () => Life.kids.length >= 1 },
    ],
    auto: () => !!Life.spouse && Life.kids.length >= 1,
  },
  {
    id: 'legacy', title: 'Heir to the Farm',
    hint: 'Legacy · a big house, a grown heir, and a storm survived.',
    subs: [
      { id: 'legacy-house', text: 'Big Farmhouse + cellar', done: () => Home.house >= 3 },
      { id: 'legacy-teen', text: 'Raise your child to teen', done: () => Life.kids.some((k) => k.stage >= 2) },
      { id: 'legacy-storm', text: 'Survive a tornado', done: () => !!Life.stats.tornadoSeen },
      { id: 'legacy-gold', text: qGold(100), done: () => (Life.stats.goldEarned || 0) >= 100 },
    ],
    auto: () => Home.house >= 3 && Life.kids.some((k) => k.stage >= 2) && !!Life.stats.tornadoSeen && (Life.stats.goldEarned || 0) >= 100,
  },
  {
    id: 'retire', title: 'Pass the Axe',
    hint: 'Family & upgrades · retire when your heir is ready.',
    subs: [
      { id: 'retire-done', text: 'Retire into your heir', done: () => Life.gen >= 2 },
    ],
    auto: () => Life.gen >= 2,
  },
];
const QUEST_SUB_IDS = new Set(QUESTS.flatMap((q) => q.subs.map((st) => st.id)));
const QUEST_IDS = new Set(QUESTS.map((q) => q.id));
let questIndex = 0;
let questDone = new Set();
let questDoneObjectives = new Set();
let questTransition = false;
let questToken = 0;
let questRows = new Map();
let questTimerA = null, questTimerB = null;

function questSubText(st) { return typeof st.text === 'function' ? st.text() : st.text; }
function questSubDone(st) { return questDone.has(st.id) || st.done(); }
function questMarkSub(st, animate) {
  const row = questRows.get(st.id);
  if (!row) return;
  row.row.classList.add('done');
  row.box.classList.add('done');
  if (animate) {
    row.box.classList.remove('pop');
    void row.box.offsetWidth;
    row.box.classList.add('pop');
  }
}
function questUpdateLabels() {
  const q = QUESTS[questIndex];
  if (!q) return;
  for (const st of q.subs) {
    if (typeof st.text !== 'function') continue;
    const row = questRows.get(st.id);
    if (!row) continue;
    const label = st.text();
    if (row.txt.textContent !== label) row.txt.textContent = label;
  }
}
function questRender(animate) {
  const panel = document.getElementById('objective-panel');
  if (!panel) return;
  const q = QUESTS[questIndex];
  if (!q) return;
  const list = document.getElementById('obj-list');
  const title = document.getElementById('obj-title');
  const hint = document.getElementById('obj-hint');
  const check = document.getElementById('obj-check');
  document.getElementById('obj-index').textContent = `${questIndex + 1} / ${QUESTS.length}`;
  title.textContent = q.title;
  title.classList.remove('done');
  hint.textContent = q.hint || '';
  check.classList.remove('done', 'pop');
  list.innerHTML = '';
  questRows.clear();
  for (const st of q.subs) {
    const row = document.createElement('div');
    row.className = 'obj-sub';
    const box = document.createElement('span');
    box.className = 'obj-check';
    const txt = document.createElement('span');
    txt.className = 'obj-text';
    txt.textContent = questSubText(st);
    row.appendChild(box); row.appendChild(txt); list.appendChild(row);
    questRows.set(st.id, { row, box, txt });
    if (questDone.has(st.id)) questMarkSub(st, false);
  }
  panel.classList.remove('hidden', 'leaving', 'arriving');
  if (animate) { void panel.offsetWidth; panel.classList.add('arriving'); }
}
function questNormalize() {
  let guard = 0;
  while (questIndex < QUESTS.length && guard++ < QUESTS.length + 1) {
    const q = QUESTS[questIndex];
    const complete = (q.auto && q.auto()) || q.subs.every(questSubDone);
    if (!complete) break;
    for (const st of q.subs) questDone.add(st.id);
    questDoneObjectives.add(q.id);
    questIndex++;
  }
  if (questIndex >= QUESTS.length) return;
  const q = QUESTS[questIndex];
  for (const st of q.subs) if (!questDone.has(st.id) && st.done()) questDone.add(st.id);
}
function questResume() {
  if (!started) return;
  const panel = document.getElementById('objective-panel');
  if (!panel) return;
  questNormalize();
  if (questIndex >= QUESTS.length) { panel.classList.add('hidden'); return; }
  questRender(false);
}
function questHide() {
  questToken++;
  questTransition = false;
  clearTimeout(questTimerA); clearTimeout(questTimerB);
  const panel = document.getElementById('objective-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.classList.remove('leaving', 'arriving');
}
function questNew() {
  questHide();
  questIndex = 0;
  questDone = new Set();
  questDoneObjectives = new Set();
  questRows.clear();
}
function questLoad(data) {
  questHide();
  if (data && typeof data.index === 'number') {
    questIndex = Math.max(0, Math.min(QUESTS.length, data.index | 0));
    questDone = new Set((Array.isArray(data.done) ? data.done : []).filter((id) => QUEST_SUB_IDS.has(id)));
    questDoneObjectives = new Set((Array.isArray(data.completed) ? data.completed : []).filter((id) => QUEST_IDS.has(id)));
  } else {
    questIndex = 0;
    questDone = new Set();
    questDoneObjectives = new Set();
  }
  questNormalize();
}
function questSnapshot() {
  return { index: questIndex, done: [...questDone], completed: [...questDoneObjectives] };
}
function questCompleteActive(q) {
  if (questTransition) return;
  questTransition = true;
  for (const st of q.subs) questDone.add(st.id);
  questDoneObjectives.add(q.id);
  const panel = document.getElementById('objective-panel');
  const check = document.getElementById('obj-check');
  const title = document.getElementById('obj-title');
  const hint = document.getElementById('obj-hint');
  if (check) {
    check.classList.add('done');
    check.classList.remove('pop');
    void check.offsetWidth;
    check.classList.add('pop');
  }
  if (title) title.classList.add('done');
  if (hint) hint.textContent = 'Complete · next objective incoming…';
  chime(880);
  const token = ++questToken;
  questTimerA = setTimeout(() => {
    if (token !== questToken || !panel) return;
    panel.classList.add('leaving');
  }, 1450);
  questTimerB = setTimeout(() => {
    if (token !== questToken) return;
    questTransition = false;
    questIndex++;
    questRows.clear();
    if (questIndex >= QUESTS.length) { questFinish(); return; }
    questNormalize();
    if (questIndex >= QUESTS.length) { questFinish(); return; }
    questRender(true);
  }, 2050);
}
function questFinish() {
  const panel = document.getElementById('objective-panel');
  if (!panel) return;
  const list = document.getElementById('obj-list');
  const title = document.getElementById('obj-title');
  const hint = document.getElementById('obj-hint');
  const check = document.getElementById('obj-check');
  document.getElementById('obj-index').textContent = `${QUESTS.length} / ${QUESTS.length}`;
  title.textContent = 'All trails walked';
  title.classList.add('done');
  hint.textContent = 'The planet is whole. The hearth is yours.';
  check.classList.add('done');
  list.innerHTML = '';
  questRows.clear();
  const row = document.createElement('div');
  row.className = 'obj-sub done';
  const box = document.createElement('span');
  box.className = 'obj-check done';
  const txt = document.createElement('span');
  txt.className = 'obj-text';
  txt.textContent = 'Every small wonder, every harvest, every heir — your story continues.';
  row.appendChild(box); row.appendChild(txt); list.appendChild(row);
  panel.classList.remove('hidden', 'leaving', 'arriving');
  void panel.offsetWidth;
  panel.classList.add('arriving');
  chime(880);
  const token = ++questToken;
  questTimerA = setTimeout(() => {
    if (token !== questToken) return;
    panel.classList.add('leaving');
  }, 2800);
  questTimerB = setTimeout(() => {
    if (token !== questToken) return;
    panel.classList.add('hidden');
    panel.classList.remove('leaving', 'arriving');
  }, 3500);
}
function questTick() {
  if (!started || paused || playerDead || questTransition) return;
  const q = QUESTS[questIndex];
  if (!q) return;
  questUpdateLabels();
  if (q.auto && q.auto()) {
    for (const st of q.subs) {
      if (!questDone.has(st.id)) { questDone.add(st.id); questMarkSub(st, false); }
    }
  } else {
    let changed = false;
    for (const st of q.subs) {
      if (!questDone.has(st.id) && st.done()) {
        questDone.add(st.id);
        questMarkSub(st, true);
        changed = true;
      }
    }
    if (changed) chime(620);
  }
  if (q.subs.every((st) => questDone.has(st.id))) questCompleteActive(q);
}
tickers.push(questTick);
// --- trail beacon: a golden marker + distance readout so you never feel lost ---
const QUEST_SPOTS = {
  camp: [2, 50], night: [-2, 56], roots: [8, 52], flame: [12, 158], harvest: [8, 52],
  oasis: [4, 110], bell: [14, 279], light: [2, 230], scan: [8, 328], aurora: [60, 140],
  prosper: [-2, 56], family: [5.5, 47], legacy: [-2, 56], retire: [-2, 56],
};
const questBeacon = new THREE.Group();
{
  const core = mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffd97a, emissive: 0xa86a00, emissiveIntensity: 1.2, flatShading: true }), 0, 0, 0, false);
  core.name = 'beacon-core';
  const beam = mesh(new THREE.CylinderGeometry(0.12, 0.35, 6, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 0, 3, 0, false);
  questBeacon.add(core); questBeacon.add(beam);
  questBeacon.visible = false;
  scene.add(questBeacon);
}
let questDistEl = null;
tickers.push((t) => {
  if (!started || paused) { questBeacon.visible = false; return; }
  const q = QUESTS[questIndex];
  if (!q || !QUEST_SPOTS[q.id]) { questBeacon.visible = false; return; }
  if (!questDistEl) {
    questDistEl = document.createElement('div');
    questDistEl.id = 'obj-dist';
    questDistEl.style.cssText = 'margin-top:4px;font-size:12px;opacity:.85';
    document.getElementById('objective-panel')?.appendChild(questDistEl);
  }
  const [la, lo] = QUEST_SPOTS[q.id];
  const target = anchor(la, lo, 2.2);
  questBeacon.visible = true;
  questBeacon.position.copy(target);
  questBeacon.position.addScaledVector(target.clone().normalize(), Math.sin(t * 2.4) * 0.3);
  const core = questBeacon.getObjectByName('beacon-core');
  if (core) { core.rotation.y = t * 1.8; core.position.y = Math.sin(t * 2.4) * 0.3; }
  const d = player.position.distanceTo(target);
  if (questDistEl) questDistEl.textContent = d < 4 ? '✨ You are here — press E!' : `➤ ${Math.round(d)}m ${d > 20 ? '— follow the gold light' : '— almost there'}`;
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
sunSpr.scale.setScalar(26 * S); scene.add(sunSpr);
const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(220,235,255,1)', 'rgba(150,180,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
moonSpr.scale.setScalar(13 * S); scene.add(moonSpr);
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
    const bodyM = mat(0x3a3330);
    const body = mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), bodyM, 0, 0, 0, false);
    body.rotation.x = Math.PI / 2; g.add(body);
    g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), bodyM, 0, 0.01, 0.15, false));
    for (const sx of [-1, 1]) { // antennae with club tips
      const an = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), bodyM, sx * 0.05, 0.08, 0.22, false);
      an.rotation.x = 0.9; an.rotation.z = -sx * 0.35; g.add(an);
      g.add(mesh(new THREE.SphereGeometry(0.014, 6, 5), bodyM, sx * 0.1, 0.15, 0.3, false));
    }
    const wl = new THREE.Group(); wl.position.set(0.03, 0.02, 0.02); g.add(wl);
    const wr = new THREE.Group(); wr.position.set(-0.03, 0.02, 0.02); g.add(wr);
    for (const [w, sx] of [[wl, 1], [wr, -1]]) {
      const fore = mesh(new THREE.PlaneGeometry(0.3, 0.24), wm, sx * 0.15, 0, 0.02, false);
      fore.rotation.x = -Math.PI / 2; w.add(fore);
      const hind = mesh(new THREE.PlaneGeometry(0.24, 0.2), wm, sx * 0.12, 0, -0.12, false);
      hind.rotation.x = -Math.PI / 2; w.add(hind);
    }
    scene.add(g);
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
  const { g, body, wl, wr } = makeBirdMesh(0.8, 0xf4f7fa, 0xe4ebf0, ['#d8e1e8', '#ffffff']);
  scene.add(g);
  seabirds.push({ g, body, wl, wr, cx: i < 2 ? 2 : 8, cz: i < 2 ? 228 : 285, r: rand(4, 7), h: rand(6, 9), sp: rand(0.25, 0.45) * (i % 2 ? 1 : -1), ph: rand(6) });
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
  for (let i = 0; i < 18; i++) {
    const la = rand(19, 27), lo = rand(148, 168);
    const birch = put(makeBirch(rand(2.4, 3.6)), la, lo, rand(3));
    addChoppableTree(birch, la, lo, 'Birch', 0x8fd06a);
  }
}
// --- one graphics ticker to rule the ambience ---
let emberT = 0;
tickers.push((t, dt) => {
  const night = isNight();
  // sun/moon sprites ride the sky
  sunSpr.position.copy(sun.position).normalize().multiplyScalar(190 * S);
  sunSpr.material.opacity = 0.35 + (sun.intensity / 2.3) * 0.65;
  moonSpr.position.copy(sun.position).normalize().multiplyScalar(-185 * S);
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
    // nose into the drift, rolling gently as it bobs
    const vx = Math.cos(t * 0.9 + b.ph) * 0.9 * b.r, vz = -Math.sin(t * 0.7 + b.ph) * 0.7 * b.r;
    b.g.rotation.set(Math.sin(t * 2.1 + b.ph) * 0.1, Math.atan2(vx, vz), Math.sin(t * 1.4 + b.ph) * 0.12);
    const f = 0.35 + Math.abs(Math.sin(t * 15 + b.ph)) * 0.95;
    b.wl.rotation.z = f; b.wr.rotation.z = -f;
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
  // seabirds wheel over the water: real heading + banked turns
  for (const s of seabirds) {
    const a = t * s.sp + s.ph;
    const dir = Math.sign(s.sp);
    const posAt = (aa) => latLonToVec3(s.cx + Math.cos(aa) * 6, s.cz + Math.sin(aa) * 10, 0).normalize();
    const hAt = (aa) => {
      const p0 = posAt(aa), p1 = posAt(aa + 0.06 * dir);
      return p1.addScaledVector(p0, -p1.dot(p0)).normalize();
    };
    const n0 = posAt(a);
    s.g.position.copy(n0).multiplyScalar(R + s.h + Math.sin(t * 1.5 + s.ph) * 0.5);
    const h0 = hAt(a), h1 = hAt(a + 0.06 * dir);
    const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), h0.clone().negate(), n0);
    s.g.quaternion.setFromRotationMatrix(m);
    const turn = Math.atan2(new THREE.Vector3().crossVectors(h0, h1).dot(n0), h0.dot(h1));
    s.g.rotateZ(THREE.MathUtils.clamp(-turn * 4, -0.45, 0.45));
    const glide = 0.45 + 0.55 * Math.sin(t * 0.7 + s.ph);
    const flap = Math.sin(t * 10 + s.ph) * 0.7 * glide;
    wingFlap(s.wl, flap); wingFlap(s.wr, flap);
    s.body.position.y = Math.sin(t * 1.4 + s.ph) * 0.02;
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

// ---------- stone cairns: old waypoint landmarks (they no longer save) ----------
// ---------- settings ----------
const SETTINGS_KEY = 'little-planet-settings-v1';
const SETTINGS_DEFS = [
  { id: 'sound', name: 'Sound', desc: 'Chimes, barks & toasts', opts: [true, false], labels: { true: 'On 🔊', false: 'Off 🔇' } },
  { id: 'quality', name: 'Graphics quality', desc: 'Low helps slow devices', opts: ['high', 'low'], labels: { high: 'High ✨', low: 'Low ⚡' } },
  { id: 'cam', name: 'Camera orbit speed', desc: 'Mouse-drag sensitivity', opts: ['slow', 'normal', 'fast'], labels: { slow: 'Slow', normal: 'Normal', fast: 'Fast' } },
  { id: 'autosave', name: 'Autosave', desc: 'Sleep and trades save quietly on their own', opts: [true, false], labels: { true: 'On 💾', false: 'Off ✋' } },
];
let settings = { sound: true, quality: 'high', cam: 'normal', autosave: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* fresh */ }
function persistSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } }
function applySettings() {
  muted = (settings.sound === false);
  const sb = document.getElementById('btn-sound');
  if (sb) sb.textContent = muted ? '🔇' : '🔊';
  try { renderer.setPixelRatio(settings.quality === 'low' ? 1 : Math.min(devicePixelRatio, 2)); } catch { /* headless */ }
}
function camFactor() { return settings.cam === 'slow' ? 0.5 : (settings.cam === 'fast' ? 2 : 1); }
// ---------- save slots (3) ----------
const SLOT_COUNT = 3;
const LEGACY_KEY = 'little-planet-save-v1';
const slotKey = (i) => `little-planet-slot-${i}-v1`;
let activeSlot = 0;
let playtime = 0;
function migrateLegacySave() {
  try {
    if (!localStorage.getItem(LEGACY_KEY)) return;
    for (let i = 0; i < SLOT_COUNT; i++) if (localStorage.getItem(slotKey(i))) return; // slots already in use
    localStorage.setItem(slotKey(0), localStorage.getItem(LEGACY_KEY));
    localStorage.removeItem(LEGACY_KEY);
    setTimeout(() => toast('📦 Old save moved to Slot 1.'), 3000);
  } catch { /* private mode */ }
}
function readSlot(i) {
  try {
    const raw = localStorage.getItem(slotKey(i));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function anySaves() { for (let i = 0; i < SLOT_COUNT; i++) if (readSlot(i)) return true; return false; }
const SAVE_KEY = slotKey(0); // legacy alias (unused by new code)
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
    const base = latLonToVec3(c.lat, c.lon, 0);
    orientOnSphere(g, latLonToVec3(c.lat, c.lon, heightFor(base.normalize()) + 0.05), rand(Math.PI * 2));
    scene.add(g);
    tickers.push((t) => {
      lamp.rotation.y += 0.01;
      lamp.position.y = 1.65 + Math.sin(t * 2 + c.lat) * 0.08;
      lampM.emissiveIntensity = 0.6 + Math.sin(t * 2.4) * 0.15;
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
    v: 1, at: Date.now(),
    pos: playerPos.toArray(), facing: facing.toArray(), heading: moveDirSmooth.toArray(),
    inv: { ...inv }, meters: { ...meters },
    tools: { ...tools },
    life: saveLife(),
    npcs: NPCS.map((n) => ({ id: n.id, counts: n.trades.map((t) => t.count), met: n.met, lineIdx: n.lineIdx })),
    wonders: wonders.map((w) => ({ id: w.id, done: w.done, stage: w.stage || 0 })),
    bridges: bridges.map((b) => b.fixed),
    bears: bears.map((b) => ({ hp: b.hp, dead: b.dead, pos: b.pos.toArray() })),
    fishStage,
    fishSource,
    boat: { pos: boatN.toArray(), heading: boatHeading.toArray(), inBoat, fishSource },
    quest: questSnapshot(),
    meta: {
      at: Date.now(), day: Life.day, season: SEASONS[seasonNow()], gen: Life.gen,
      house: Home.house, playtime: Math.floor(playtime),
    },
  };
}
// Silent save of the active slot. `force` ignores the autosave setting.
function saveCheckpoint(force) {
  if (!force && !settings.autosave) return; // autosave off: menu saves only
  try { localStorage.setItem(slotKey(activeSlot), JSON.stringify(snapshot())); } catch { /* private mode */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(slotKey(activeSlot));
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
  for (const k of ['fish', 'egg', 'milk', 'meal']) if (inv[k] === undefined) inv[k] = 0;
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
  if (s.fishSource) fishSource = s.fishSource;
  if (s.meta && typeof s.meta.playtime === 'number') playtime = s.meta.playtime;
  if (Array.isArray(s.pos)) {
    playerPos.fromArray(s.pos);
    const n0 = playerPos.clone().normalize();
    playerPos.copy(n0).multiplyScalar(R + heightFor(n0) + 0.1);
  }
  if (Array.isArray(s.facing)) facing.fromArray(s.facing);
  if (Array.isArray(s.heading)) moveDirSmooth.fromArray(s.heading);
  restoreBoatState(s.boat || null);
  questLoad(s.quest);
  renderCollection(); renderJournal(); renderStats();
  if (started) questResume();
  return true;
}
// ---------- input state (declared early: boot/startGame touch orbitYaw) ----------
let dragging = false, px = 0, py = 0, orbitYaw = 0, orbitPitch = 0;
let downX = 0, downY = 0, downT = 0, downOnCanvas = false;
let moveTargetN = null; // click-to-move destination (surface normal)

// ---------- Pocket-RPG engine: click/E-once auto-act, dash, levels, telegraphs ----------
// One click (or one E press) locks a target; the hero walks over and performs the
// whole job automatically: chop → fell → split → loot, or pursue → auto-swing.
let activeTask = null; // { interact, timer, kind }
let dashT = 0, dashCd = 0, dashIFrames = 0;
let dashDir = new THREE.Vector3(1, 0, 0);
let critBuff = 0; // next N auto-swings crit after a Clean Dodge
const RPG_WEAPONS = [
  { name: 'Rusty Hatchet', chop: 1, dmg: 1, swing: 0.62 },
  { name: 'Iron Broadaxe', chop: 1.4, dmg: 1.35, swing: 0.55 },
  { name: 'Sunstone Greataxe', chop: 1.8, dmg: 1.7, swing: 0.48 },
  { name: 'Starforged Blade', chop: 2.2, dmg: 2.1, swing: 0.4 },
];
const RPG = { level: 1, xp: 0, xpNext: 35, weapon: 0, perkChop: 1, perkRun: 1, perkTame: 1 };
window.__rpgChopMult = 1;
window.__rpgDmgMult = 1;
window.__rpgSwing = 0.62;
function rpgWeaponDef() { return RPG_WEAPONS[Math.min(RPG.weapon, RPG_WEAPONS.length - 1)]; }
function rpgRefreshMults() {
  const w = rpgWeaponDef();
  window.__rpgChopMult = w.chop * (RPG.perkChop || 1);
  window.__rpgDmgMult = w.dmg;
  window.__rpgSwing = w.swing;
}
rpgRefreshMults();
function spawnPopup(worldPos, text, color = '#ffe596', big = false) {
  try {
    const box = document.getElementById('popups');
    if (!box || !worldPos || !worldPos.clone) return;
    const v = worldPos.clone().project(camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'rpg-popup';
    el.textContent = text;
    el.style.color = color;
    if (big) el.style.fontSize = '19px';
    el.style.left = `${((v.x * 0.5 + 0.5) * innerWidth + (Math.random() * 36 - 18)) | 0}px`;
    el.style.top = `${((-v.y * 0.5 + 0.5) * innerHeight - 30) | 0}px`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 1150);
    while (box.children.length > 24) box.firstChild.remove();
  } catch { /* headless */ }
}
onPopup = (pos, text, color) => spawnPopup(pos, text, color || '#ffe596');
const RPG_PERKS = [
  { id: 'chop', name: "Lumberjack's Rhythm", desc: '+30% work speed', apply: () => { RPG.perkChop = (RPG.perkChop || 1) * 1.3; } },
  { id: 'run', name: 'Fleetfoot', desc: '+12% move speed, faster dash', apply: () => { RPG.perkRun = (RPG.perkRun || 1) * 1.12; } },
  { id: 'tame', name: 'Beast Friend', desc: 'dog + battles, +25 max HP', apply: () => { RPG.perkTame = (RPG.perkTame || 1) + 1; meters.health = Math.min(150, meters.health + 25); } },
];
onGainXp = (amount, pos) => {
  if (!amount || playerDead) return;
  RPG.xp += amount;
  if (pos) spawnPopup(pos, `+${Math.round(amount)} XP`, '#9df0a8');
  let leveled = false;
  while (RPG.xp >= RPG.xpNext && RPG.level < 20) {
    RPG.xp -= RPG.xpNext;
    RPG.level++;
    RPG.xpNext = Math.round(35 + (RPG.level - 1) * 28);
    leveled = true;
    const perk = RPG_PERKS[(RPG.level - 2) % RPG_PERKS.length];
    try { perk.apply(); } catch { /* noop */ }
    rpgRefreshMults();
    const wBefore = RPG.weapon;
    if (RPG.level >= 10) RPG.weapon = 3;
    else if (RPG.level >= 6) RPG.weapon = 2;
    else if (RPG.level >= 3) RPG.weapon = 1;
    rpgRefreshMults();
    meters.health = Math.min(150, meters.health + 40);
    meters.energy = Math.min(100, meters.energy + 40);
    burst(player.position.clone(), 0xffd97a, 30, 3);
    chime(880); setTimeout(() => chime(1170), 150);
    toast(`⭐ Level ${RPG.level}! Perk: ${perk.name} (${perk.desc})${RPG.weapon > wBefore ? ` + NEW WEAPON: ${rpgWeaponDef().name}!` : ''}`);
    if (player.position) spawnPopup(player.position.clone(), `LEVEL ${RPG.level}!`, '#ffd97a', true);
    try { renderStats(); } catch { /* noop */ }
    try { saveCheckpoint(); } catch { /* noop */ }
  }
  if (!leveled) { try { renderStats(); } catch { /* noop */ } }
};
// glowing target ring under the locked RPG target
const targetRing = new THREE.Mesh(
  new THREE.RingGeometry(1.15, 1.5, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
);
targetRing.visible = false;
scene.add(targetRing);
function taskColor(kind) {
  if (kind === 'BEAR' || kind === 'WOLF' || (kind || '').includes('BEAR') || (kind || '').includes('WOLF')) return 0xff6b6b;
  if ((kind || '').includes('WONDER') || (kind || '').includes('HOMESTEAD') || (kind || '').includes('BUILD')) return 0xffd97a;
  return 0x7dff9a;
}
function setAutoTask(it) {
  if (!it || playerDead) return false;
  if (activeTask && activeTask.interact === it) { clearAutoTask(); return true; } // toggle off
  activeTask = { interact: it, timer: 0.35, kind: it.kind || '' };
  moveTargetN = it.pos.clone().normalize();
  try {
    targetRing.visible = true;
    targetRing.material.color.setHex(taskColor(it.kind));
    const n = it.pos.clone().normalize();
    targetRing.position.copy(n).multiplyScalar(R + heightFor(n) + 0.25);
    targetRing.lookAt(0, 0, 0);
    targetRing.rotateX(Math.PI / 2);
  } catch { /* noop */ }
  return true;
}
function clearAutoTask() {
  activeTask = null;
  try { targetRing.visible = false; } catch { /* noop */ }
}
function taskIsCombat(it) {
  if (!it) return false;
  if (it.bear || it.wolf) return true;
  const k = (it.kind || '');
  return k.includes('BEAR') || k.includes('WOLF');
}
function taskIsGather(it) { return !!(it && it.node); }
function taskIsWonder(it) { return !!(it && it.id && ['flame', 'harvest', 'oasis', 'bell', 'light', 'scan', 'aurora', 'plant'].includes(it.id)); }
// per-frame auto-action driver (called from updatePlayer when in range)
function updateAutoTask(dt) {
  if (!activeTask || playerDead || inBoat) return;
  const it = activeTask.interact;
  // target went away: node fully cleared + regrowing, bear dead + looted, etc.
  if (!it || !interactables.includes(it)) { clearAutoTask(); return; }
  if (it.node && it.node.depleted && !(it.node.fallRoot && it.node.trunkStock > 0)) {
    // let regrow nodes release the hero; trunk-splitting keeps going
    if (it.node.respawnT > 0) { clearAutoTask(); return; }
  }
  if ((it.bear && it.bear.dead) || (it.wolf && it.wolf.hp <= 0)) { clearAutoTask(); return; }
  if (taskIsWonder(it) && byId(it.id)?.done && it.id !== 'plant') { clearAutoTask(); return; }
  const d = player.position.distanceTo(it.pos);
  const reach = (it.radius || 3.6) + 0.6;
  if (d > reach) {
    // walk into range
    moveTargetN = it.pos.clone().normalize();
    try {
      const n = it.pos.clone().normalize();
      targetRing.position.copy(n).multiplyScalar(R + heightFor(n) + 0.25);
    } catch { /* noop */ }
    return;
  }
  // in range: face the target and work it on cooldown
  try {
    const n = playerPos.clone().normalize();
    const want = it.pos.clone().sub(player.position).addScaledVector(n, -it.pos.clone().sub(player.position).dot(n));
    if (want.lengthSq() > 1e-6) {
      facing.lerp(want.normalize(), 1 - Math.exp(-10 * dt)).normalize();
      moveDirSmooth.lerp(facing, 1 - Math.exp(-8 * dt));
    }
  } catch { /* noop */ }
  moveTargetN = null;
  activeTask.timer -= dt;
  if (activeTask.timer > 0) return;
  if (taskIsCombat(it)) {
    activeTask.timer = Math.max(0.3, window.__rpgSwing || 0.55);
    if (it.bear) attackBear(it.bear);
    else if (it.wolf) attackWolf(it.wolf);
  } else if (taskIsGather(it)) {
    activeTask.timer = Math.max(0.3, 0.62 / (window.__rpgChopMult || 1));
    gatherHit(it.node);
    if (it.node.depleted && !(it.node.fallRoot && it.node.trunkStock > 0)) clearAutoTask();
  } else if (taskIsWonder(it)) {
    activeTask.timer = 1.0;
    (it.onUse || onUse)(it);
  } else {
    // talk / cook / plot / build / board: single interaction, then release
    try { (it.onUse || onUse)(it); } catch { /* noop */ }
    clearAutoTask();
  }
}
function tryDash() {
  if (playerDead || inBoat || dashCd > 0 || meters.energy < 6) return false;
  const n = playerPos.clone().normalize();
  const dir = facing.clone().addScaledVector(n, -facing.dot(n));
  if (dir.lengthSq() < 1e-6) return false;
  dir.normalize();
  dashDir.copy(dir);
  dashT = 0.2; dashCd = 1.1 / (RPG.perkRun || 1); dashIFrames = 0.32;
  meters.energy = Math.max(0, meters.energy - 6);
  burst(player.position.clone(), 0xffffff, 8, 1.4);
  chime(900);
  return true;
}
// soft blob shadow to ground the hero + weapon visuals that grow with RPG tier
const heroShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x0d1f14, transparent: true, opacity: 0.3, depthWrite: false })
);
scene.add(heroShadow);
function updateHeroGear() {
  try {
    const axe = player?.userData?.axe;
    if (axe) {
      const tier = Math.min(RPG.weapon, 3);
      axe.scale.setScalar(0.8 + tier * 0.18);
      axe.traverse((o) => {
        if (o.isMesh && o.material && o.material.metalness > 0.3) {
          o.material.emissive = o.material.emissive || new THREE.Color(0);
          o.material.emissive.setHex([0x000000, 0x1a0d00, 0x6b3a00, 0x3a6bff][tier]);
          o.material.emissiveIntensity = tier * 0.35;
        }
      });
    }
  } catch { /* noop */ }
}
tickers.push(() => {
  try {
    const n = playerPos.clone().normalize();
    heroShadow.position.copy(n).multiplyScalar(R + heightFor(n) + 0.06);
    heroShadow.lookAt(0, 0, 0);
    heroShadow.rotateX(Math.PI / 2);
    const air = THREE.MathUtils.clamp(hopH * 2, 0, 1);
    heroShadow.material.opacity = 0.3 * (1 - air * 0.6);
    heroShadow.scale.setScalar(1 + air * 0.4);
  } catch { /* noop */ }
});
// drifting ambient motes: dandelion seeds over the farm, heat dust over the oasis
{
  const moteGeo = new THREE.BufferGeometry();
  const MN = 90;
  const mp = new Float32Array(MN * 3), mSeed = [];
  for (let i = 0; i < MN; i++) {
    const farm = i < 55;
    const la = farm ? rand(-6, 20) : rand(-2, 18), lo = farm ? rand(28, 66) : rand(94, 124);
    const n = latLonToVec3(la, lo, 0).normalize();
    const p = n.clone().multiplyScalar(R + heightFor(n) + rand(0.8, 3.2));
    mp[i * 3] = p.x; mp[i * 3 + 1] = p.y; mp[i * 3 + 2] = p.z;
    mSeed.push({ la, lo, ph: rand(6), sp: rand(0.2, 0.7), farm });
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const moteMat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.32, transparent: true, opacity: 0.55, depthWrite: false });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);
  tickers.push((t) => {
    const arr = moteGeo.attributes.position;
    for (let i = 0; i < MN; i++) {
      const s = mSeed[i];
      const n = latLonToVec3(s.la + Math.sin(t * s.sp + s.ph) * 1.2, s.lo + t * s.sp * 0.6, 0).normalize();
      const p = n.clone().multiplyScalar(R + heightFor(n) + 1.6 + Math.sin(t * 0.9 + s.ph) * 1.1);
      arr.array[i * 3] = p.x; arr.array[i * 3 + 1] = p.y; arr.array[i * 3 + 2] = p.z;
    }
    arr.needsUpdate = true;
    moteMat.opacity = 0.4 + Math.sin(t * 0.7) * 0.12;
  });
}
// ---------- menus: title, pause, settings, save slots ----------
let started = false, paused = true;
function fmtPlaytime(sec) {
  const m = Math.floor((sec || 0) / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
function houseName(t) { return t >= 2 ? `Farmhouse T${t - 1}` : (t === 1 ? 'Hut' : 'Tent'); }
function slotSummary(i) {
  const s = readSlot(i);
  if (!s) return { empty: true, name: `Slot ${i + 1}`, meta: 'Empty — a fresh start' };
  const m = s.meta || {};
  const day = s.life?.day ?? m.day ?? 1;
  const season = m.season || SEASONS[seasonOf(day)];
  const gen = s.life?.gen ?? m.gen ?? 1;
  const house = houseName(s.life?.home?.build?.target ?? s.life?.home?.house ?? m.house ?? 0);
  return { empty: false, name: `Slot ${i + 1}`, meta: `Day ${day} · ${season} · Gen ${gen} · ${house} · ${fmtPlaytime(m.playtime)}` };
}
function startGame(fresh) {
  document.getElementById('title-overlay').style.display = 'none';
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
  started = true; paused = false;
  orbitYaw = 0; // title-vista drift must not lean the first walk into a curve
  renderStats();
  if (fresh) {
    questNew();
    saveCheckpoint(true);
    toast('🌱 A new life begins! Follow the trail objective.');
    chime(660);
  }
  questResume();
}
function showTitle() {
  started = false; paused = true;
  questHide();
  closeTrade(); closeBuild(); toggleJournal(false);
  document.getElementById('help-overlay').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
  document.getElementById('slot-picker').classList.add('hidden');
  document.getElementById('title-buttons').classList.remove('hidden');
  document.getElementById('title-overlay').style.display = 'flex';
  refreshTitleButtons();
}
function refreshTitleButtons() {
  document.getElementById('btn-continue').disabled = !anySaves();
}
let slotMode = 'load', armSlot = -1, armDelete = -1;
function openSlots(mode) {
  slotMode = mode; armSlot = -1; armDelete = -1;
  document.getElementById('slot-title').textContent = mode === 'new' ? 'START A NEW LIFE IN…' : 'CONTINUE FROM…';
  document.getElementById('title-buttons').classList.add('hidden');
  document.getElementById('slot-picker').classList.remove('hidden');
  renderSlots();
  chime(520);
}
function renderSlots() {
  const box = document.getElementById('slot-list');
  box.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const info = slotSummary(i);
    const row = document.createElement('div');
    row.className = 'slot-row';
    const b = document.createElement('button');
    b.className = 'slot-btn';
    const cantLoad = slotMode === 'load' && info.empty;
    b.disabled = !!cantLoad;
    b.innerHTML = `<div class="slot-name">${info.name}</div><div class="slot-meta">${
      slotMode === 'new' && !info.empty ? (armSlot === i ? 'Tap again to OVERWRITE ⚠️' : info.meta) : info.meta
    }</div>`;
    b.onclick = () => {
      if (slotMode === 'load') {
        sessionStorage.setItem('lp-boot-load', String(i));
        location.reload();
      } else {
        if (!info.empty && armSlot !== i) { armSlot = i; renderSlots(); return; }
        try { localStorage.removeItem(slotKey(i)); } catch { /* private mode */ }
        sessionStorage.setItem('lp-boot-new', String(i));
        location.reload();
      }
    };
    row.appendChild(b);
    if (!info.empty) {
      const del = document.createElement('button');
      del.className = 'slot-del' + (armDelete === i ? ' armed' : '');
      del.title = 'Delete save';
      del.textContent = armDelete === i ? '⁉️' : '×';
      del.onclick = () => {
        if (armDelete !== i) { armDelete = i; renderSlots(); return; }
        try { localStorage.removeItem(slotKey(i)); } catch { /* private mode */ }
        armDelete = -1; armSlot = -1;
        toast('🗑️ Save deleted.');
        renderSlots(); refreshTitleButtons();
      };
      row.appendChild(del);
    }
    box.appendChild(row);
  }
}
function openPause() {
  if (!started) return;
  paused = true;
  closeTrade(); closeBuild(); toggleJournal(false);
  const m = slotSummary(activeSlot);
  document.getElementById('pause-sub').textContent = `${m.meta} · Autosave ${settings.autosave ? 'on 💾' : 'off ✋'}`;
  document.getElementById('pause-overlay').classList.remove('hidden');
  chime(440);
}
function resumeGame() {
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
  paused = false;
  orbitYaw = 0; // pause-menu drift must not angle the next walk
  chime(520);
}
function manualSave() {
  saveCheckpoint(true);
  toast(`💾 Saved to Slot ${activeSlot + 1}.`);
  const m = slotSummary(activeSlot);
  document.getElementById('pause-sub').textContent = `${m.meta} · Autosave ${settings.autosave ? 'on 💾' : 'off ✋'}`;
}
function quitToTitle() {
  saveCheckpoint(true);
  showTitle();
  toast('🏠 Saved. See you soon, traveler.');
}
let settingsReturn = 'title'; // where the Back button goes
function openSettings(from) {
  settingsReturn = from || 'title';
  renderSettings();
  document.getElementById('settings-overlay').classList.remove('hidden');
  chime(520);
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}
function renderSettings() {
  const box = document.getElementById('settings-list');
  box.innerHTML = '';
  for (const d of SETTINGS_DEFS) {
    const b = document.createElement('button');
    b.className = 'set-row';
    b.innerHTML = `<span class="set-name">${d.name}<span class="set-desc">${d.desc}</span></span><span class="set-val">${d.labels[settings[d.id]]}</span>`;
    b.onclick = () => {
      const i = d.opts.indexOf(settings[d.id]);
      settings[d.id] = d.opts[(i + 1) % d.opts.length];
      persistSettings(); applySettings(); renderSettings();
      chime(600);
    };
    box.appendChild(b);
  }
  const eb = document.getElementById('btn-erase-saves');
  eb.classList.toggle('armed', !!eb.dataset.armed);
  eb.textContent = eb.dataset.armed ? 'Tap again to ERASE EVERYTHING ⚠️' : 'Erase ALL saves 🗑️';
}
function handleEscape() {
  if (!started) return; // title screen: nothing to do
  if (npcOpen || buildOpen) { closeTrade(); closeBuild(); return; }
  if (!document.getElementById('settings-overlay').classList.contains('hidden')) { closeSettings(); return; }
  if (!document.getElementById('help-overlay').classList.contains('hidden')) { document.getElementById('help-overlay').classList.add('hidden'); return; }
  toggleJournal(false);
  if (!document.getElementById('pause-overlay').classList.contains('hidden')) resumeGame();
  else openPause();
}
// Boot: pending new/load flags (set before reload) win; otherwise show the title.
migrateLegacySave();
try {
  const bootNew = sessionStorage.getItem('lp-boot-new');
  const bootLoad = sessionStorage.getItem('lp-boot-load');
  sessionStorage.removeItem('lp-boot-new'); sessionStorage.removeItem('lp-boot-load');
  applySettings();
  if (bootNew !== null && bootNew !== undefined) {
    activeSlot = Math.min(SLOT_COUNT - 1, Math.max(0, parseInt(bootNew) || 0));
    startGame(true);
  } else if (bootLoad !== null && bootLoad !== undefined) {
    activeSlot = Math.min(SLOT_COUNT - 1, Math.max(0, parseInt(bootLoad) || 0));
    const prev = loadSave();
    if (prev && prev.v === 1) {
      // defer one frame: wonders/bridges/reef visuals all exist by now
      setTimeout(() => {
        if (applySave(prev, false)) { startGame(false); toast('🧭 Welcome back — save restored.'); }
        else showTitle();
      }, 50);
    } else showTitle();
  } else showTitle();
} catch { try { showTitle(); } catch { /* no DOM */ } }
Object.assign(window.__lp, {
  bears, animals, wolves, meters, useRemedy, attackBear, saveCheckpoint, loadSave, applySave,
  spawnAnimal, spawnDog, spawnWolves,
  npcs: NPCS, openTrade, closeTrade, doTrade,
  slots: { readSlot, slotSummary, openSlots, manualSave, quitToTitle },
  settings, applySettings, openSettings, openPause, resumeGame, showTitle,
});
// Live read-only views (defineProperties — NOT inside assign, which would freeze values)
Object.defineProperties(window.__lp, {
  playerDead: { get() { return playerDead; } },
  paused: { get() { return paused; } },
  started: { get() { return started; } },
  activeSlot: { get() { return activeSlot; } },
  dog: { get() { return dogEnt; } },
});

 // ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM', 'KeyF', 'KeyR', 'KeyH', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    moveTargetN = null; // manual steering cancels click-to-move
    if (activeTask && !taskIsCombat(activeTask.interact)) clearAutoTask();
  }
  if (e.code === 'Escape') { handleEscape(); return; }
  if (!started || paused) return;
  if (e.code === 'KeyE' && !playerDead && !npcOpen && !buildOpen) {
    // RPG style: one press locks the nearby target and the hero does the whole job.
    const t = currentTarget || activeTask?.interact;
    if (t && setAutoTask(t)) return;
    if (currentTarget) (currentTarget.onUse || onUse)(currentTarget);
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (!playerDead) tryDash(); return; }
  if (e.code === 'KeyF' && !playerDead) eatFood();
  if (e.code === 'KeyR' && !playerDead) useRemedy();
  if (e.code === 'KeyH' && !playerDead && !npcOpen) { buildOpen ? closeBuild() : openBuild(); }
  if (e.code === 'KeyM') toggleGlobe();
  if (e.code === 'KeyJ') toggleJournal();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
const clickRay = new THREE.Raycaster();
function clickToMove(x, y) {
  if (!planetMesh || !started || paused) return;
  clickRay.setFromCamera({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, camera);
  // globe view: click a far shore to fast-travel there (the debug goto, now a feature)
  if (globeMode) {
    const hits = clickRay.intersectObjects([planetMesh, ocean], false);
    if (!hits.length) return;
    const p = hits[0].point.clone().normalize();
    const lat = Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) / DEG;
    let lon = Math.atan2(p.z, p.x) / DEG;
    if (lon < 0) lon += 360;
    playerPos = p.clone().multiplyScalar(R + heightFor(p) + 0.1);
    moveDirSmooth.copy(latLonToVec3(lat, lon + 8, 0)).sub(playerPos);
    moveDirSmooth.addScaledVector(p, -moveDirSmooth.dot(p)).normalize();
    facing.copy(moveDirSmooth);
    lastBehind.copy(moveDirSmooth);
    burst(player.position.clone(), 0x9fdcff, 18, 2);
    chime(760);
    toast('🧭 Fast travel — the planet turns beneath you.');
    toggleGlobe();
    renderStats();
    return;
  }
  // RPG priority: clicking near a person, tree, beast, or wonder locks it as a task.
  let best = null, bestAlong = 1e9;
  const origin = clickRay.ray.origin, dir = clickRay.ray.direction;
  for (const it of interactables) {
    if (!it.pos) continue;
    const to = it.pos.clone().sub(origin);
    const along = to.dot(dir);
    if (along < 0) continue;
    const perp = to.addScaledVector(dir, -along).length();
    const tol = (it.radius || 3.6) + 1.6;
    if (perp < tol && along < bestAlong) { best = it; bestAlong = along; }
  }
  if (best) {
    if (setAutoTask(best)) {
      burst(best.pos.clone(), 0x7dff9a, 6, 1.0);
      return;
    }
  }
  clearAutoTask();
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
  const yawDelta = (e.clientX - px) * 0.005 * camFactor();
  orbitPitch += (e.clientY - py) * 0.005 * camFactor();
  orbitPitch = THREE.MathUtils.clamp(orbitPitch, -0.5, 0.7);
  // Drag turns the traveler (not just the camera): rotate the shared heading
  // around the local surface normal so W stays straight-on-screen. Rotating
  // only the camera offset would feed back into steering and spiral.
  try {
    const n0 = (inBoat ? boatN : playerPos).clone().normalize();
    moveDirSmooth.applyAxisAngle(n0, yawDelta);
    moveDirSmooth.addScaledVector(n0, -moveDirSmooth.dot(n0));
    if (moveDirSmooth.lengthSq() > 1e-6) moveDirSmooth.normalize();
    facing.applyAxisAngle(n0, yawDelta);
    facing.addScaledVector(n0, -facing.dot(n0));
    if (facing.lengthSq() > 1e-6) facing.normalize();
    lastBehind.applyAxisAngle(n0, yawDelta);
    lastBehind.addScaledVector(n0, -lastBehind.dot(n0));
    if (lastBehind.lengthSq() > 1e-6) lastBehind.normalize();
    if (inBoat) {
      boatHeading.applyAxisAngle(n0, yawDelta);
      boatHeading.addScaledVector(n0, -boatHeading.dot(n0));
      if (boatHeading.lengthSq() > 1e-6) boatHeading.normalize();
    }
  } catch { /* heading not ready yet */ }
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
  hold('btn-act', () => {
    if (!started || paused || npcOpen || buildOpen) return;
    const t = currentTarget || activeTask?.interact;
    if (t && setAutoTask(t)) return;
    if (currentTarget) (currentTarget.onUse || onUse)(currentTarget);
  });
  hold('btn-hop', () => { if (started && !paused) keys.Space = true; }, () => (keys.Space = false));
  hold('btn-eat', () => { if (started && !paused) eatFood(); });
  hold('btn-heal', () => { if (started && !paused) useRemedy(); });
  hold('btn-run', () => { if (started && !paused) keys.KeyQ = true; }, () => (keys.KeyQ = false));
}
let globeMode = false;
function toggleGlobe() { globeMode = !globeMode; toast(globeMode ? '🌐 Globe view — the patchwork planet' : '🧭 Back to traveler view'); }
document.getElementById('btn-globe').onclick = toggleGlobe;
document.getElementById('btn-sound').onclick = () => {
  settings.sound = !settings.sound;
  persistSettings(); applySettings();
  toast(settings.sound ? 'Sound on — wind and bells' : 'Sound off');
};
document.getElementById('btn-help').onclick = () => document.getElementById('help-overlay').classList.remove('hidden');
document.getElementById('btn-close-help').onclick = () => document.getElementById('help-overlay').classList.add('hidden');
document.getElementById('btn-close-journal').onclick = () => toggleJournal(false);
document.getElementById('wonder-tracker').onclick = () => toggleJournal();
document.getElementById('btn-pause').onclick = () => { if (started && !paused) openPause(); };
// title / pause / settings menus
document.getElementById('btn-continue').onclick = () => openSlots('load');
document.getElementById('btn-newgame').onclick = () => openSlots('new');
document.getElementById('btn-slot-back').onclick = () => {
  document.getElementById('slot-picker').classList.add('hidden');
  document.getElementById('title-buttons').classList.remove('hidden');
};
document.getElementById('btn-title-help').onclick = () => document.getElementById('help-overlay').classList.remove('hidden');
document.getElementById('btn-title-settings').onclick = () => openSettings('title');
document.getElementById('btn-resume').onclick = () => resumeGame();
document.getElementById('btn-save').onclick = () => manualSave();
document.getElementById('btn-pause-help').onclick = () => document.getElementById('help-overlay').classList.remove('hidden');
document.getElementById('btn-pause-settings').onclick = () => openSettings('pause');
document.getElementById('btn-quit-title').onclick = () => quitToTitle();
document.getElementById('btn-close-settings').onclick = () => closeSettings();
document.getElementById('btn-settings-back').onclick = () => closeSettings();
document.getElementById('btn-erase-saves').onclick = (e) => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; renderSettings(); return; }
  delete b.dataset.armed;
  try {
    for (let i = 0; i < SLOT_COUNT; i++) localStorage.removeItem(slotKey(i));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* private mode */ }
  toast('🗑️ All saves erased. A clean horizon.');
  chime(200);
  renderSettings(); refreshTitleButtons();
  if (!document.getElementById('slot-picker').classList.contains('hidden')) renderSlots();
};
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

function updateBoatControl(dt) {
  const n = boatN.clone().normalize();
  // Straight-line helm: derive the basis from the heading itself, never add a
  // per-frame yaw offset here (that fed back into boatHeading and spiralled).
  // Drag-to-turn rotates boatHeading directly in the pointer handler.
  tmpF.copy(boatHeading).addScaledVector(n, -boatHeading.dot(n));
  if (tmpF.lengthSq() < 0.01) tmpF.copy(lastBehind);
  else tmpF.normalize();
  tmpR.crossVectors(tmpF, n).normalize();
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  let jx = touchMove.x, jy = touchMove.y;
  if (Math.hypot(jx, jy) < 0.15) { jx = 0; jy = 0; }
  ix += jx; iz += -jy;
  if (jx || jy) moveTargetN = null;
  const trimmed = keys.KeyQ && meters.energy > 0;
  let speed = 5.4 * (trimmed ? 1.4 : 1) * moraleSpeed() * (meters.hunger <= 0 ? 0.82 : 1);
  if (meters.energy <= 0) speed *= 0.55;
  let moved = false;
  if (ix || iz) {
    tmpM.set(0, 0, 0).addScaledVector(tmpF, iz).addScaledVector(tmpR, ix).normalize();
    axis.crossVectors(n, tmpM).normalize();
    const next = boatN.clone().applyAxisAngle(axis, (speed * dt) / R).normalize();
    if (heightFor(next) < 0.12) { boatN.copy(next); moved = true; }
    else moveTargetN = null; // keel scrapes the shallows: turn back to open water
    boatHeading.lerp(tmpM, 1 - Math.exp(-4.5 * dt));
    boatHeading.addScaledVector(n, -boatHeading.dot(n));
    if (boatHeading.lengthSq() > 1e-6) boatHeading.normalize();
    facing.lerp(tmpM, 1 - Math.exp(-10 * dt)).normalize();
    moveDirSmooth.lerp(boatHeading, 1 - Math.exp(-6 * dt));
    moveDirSmooth.addScaledVector(n, -moveDirSmooth.dot(n));
    if (moveDirSmooth.lengthSq() > 1e-6) moveDirSmooth.normalize();
  } else if (moveTargetN) {
    if (heightFor(moveTargetN) >= 0.12) moveTargetN = null;
    else {
      const ang = n.angleTo(moveTargetN);
      if (ang < 1.4 / R) moveTargetN = null;
      else {
        axis.crossVectors(n, moveTargetN);
        if (axis.lengthSq() < 1e-8) moveTargetN = null;
        else {
          axis.normalize();
          tmpM.crossVectors(axis, n).normalize();
          const next = boatN.clone().applyAxisAngle(axis, Math.min((speed * dt) / R, ang)).normalize();
          if (heightFor(next) < 0.12) { boatN.copy(next); moved = true; }
          else moveTargetN = null;
          boatHeading.lerp(tmpM, 1 - Math.exp(-4.5 * dt));
          boatHeading.addScaledVector(n, -boatHeading.dot(n));
          if (boatHeading.lengthSq() > 1e-6) boatHeading.normalize();
          moveDirSmooth.lerp(boatHeading, 1 - Math.exp(-6 * dt));
          moveDirSmooth.addScaledVector(n, -moveDirSmooth.dot(n));
          if (moveDirSmooth.lengthSq() > 1e-6) moveDirSmooth.normalize();
        }
      }
    }
  }
  const nn = boatN.clone();
  const bob = boatBob(clock.elapsedTime);
  playerPos.copy(nn).multiplyScalar(R + 0.64 + bob);
  player.position.copy(playerPos);
  if (trimmed && moved) meters.energy = Math.max(0, meters.energy - 1.5 * dt);
  else if (!(ix || iz)) meters.energy = Math.min(100, meters.energy + 7 * dt);
  coldTick(dt, nn);
  meterAlerts();
  renderStats();
  if (moved && clock.elapsedTime - (updateBoatControl._wakeT || 0) > 0.6) {
    updateBoatControl._wakeT = clock.elapsedTime;
    const wake = player.position.clone().addScaledVector(nn, -0.1);
    burst(wake, 0x9fdcff, 5, 1.3);
  }
  return nn;
}

function updatePlayer(dt) {
  const n = playerPos.clone().normalize();
  if (playerDead) {
    // fallen: stay where death found you while the game-over card shows
    const nn0 = playerPos.clone().normalize();
    player.position.copy(nn0).multiplyScalar(R + heightFor(nn0) + 0.1);
    player.rotation.z += dt * 0.4; // crumple gently
    return nn0;
  }
  if (inBoat) return updateBoatControl(dt);
  // Straight-line walk: steer from the heading itself with no per-frame yaw
  // offset. The old code rotated the smoothed heading by orbitYaw every frame
  // then lerped the heading toward that rotated vector — a feedback loop, so
  // holding W with any camera offset walked you in a circle.
  // Drag-to-turn rotates the heading directly (see pointermove).
  tmpF.copy(moveDirSmooth).addScaledVector(n, -moveDirSmooth.dot(n));
  if (tmpF.lengthSq() < 0.01) tmpF.copy(lastBehind); // mid-flip: hold last good heading
  else tmpF.normalize();
  tmpR.crossVectors(tmpF, n).normalize();
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  // touch joystick feeds the same axes (analog)
  let jx = touchMove.x, jy = touchMove.y;
  if (Math.hypot(jx, jy) < 0.15) { jx = 0; jy = 0; }
  ix += jx; iz += -jy;
  if (jx || jy) moveTargetN = null; // joystick steers, cancels click-to-move
  if (jx || jy) { if (activeTask && !taskIsCombat(activeTask.interact)) clearAutoTask(); }
  const running = keys.KeyQ && meters.energy > 0 ? 1.7 : 1;
  const inWater = heightFor(n) < 0.12; // lagoon floor + reef shelf lie below the ocean skin
  let speed = (inWater ? 3.2 : 6.2) * running * moraleSpeed() * (meters.hunger <= 0 ? 0.8 : 1) * (RPG.perkRun || 1);
  if (meters.energy <= 0) speed *= 0.5; // exhausted: trudge; eat (F) or stand still to recover
  // dash: a short Fleetfoot tumble with i-frames, on a cooldown
  if (dashCd > 0) dashCd -= dt;
  if (dashIFrames > 0) dashIFrames -= dt;
  if (critBuff < 0) critBuff = 0;
  if (dashT > 0) {
    dashT -= dt;
    axis.crossVectors(n, dashDir).normalize();
    if (axis.lengthSq() > 1e-6) playerPos.applyAxisAngle(axis, ((speed * 2.6 + 6) * dt) / R);
    facing.lerp(dashDir, 1 - Math.exp(-14 * dt)).normalize();
    moveDirSmooth.lerp(dashDir, 1 - Math.exp(-10 * dt));
    if ((dashT * 10 | 0) % 2 === 0) burst(player.position.clone(), 0xffffff, 2, 0.8);
  }
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
  // RPG auto-action: walk into range, then work/fight on cooldown
  try { updateAutoTask(dt); } catch { /* noop */ }
  // target ring pulse
  try {
    if (targetRing.visible) {
      const s = 1 + Math.sin(performance.now() * 0.006) * 0.12;
      targetRing.scale.set(s, 1, s);
    }
  } catch { /* noop */ }
  const nn = playerPos.clone().normalize();
  const surfH = heightFor(nn) + 0.1 + hopH + (inWater ? -0.35 : 0);
  // survival meters: sprinting burns energy, standing still restores, arctic chills
  const sprinting = !!(ix || iz) && keys.KeyQ && meters.energy > 0;
  if (sprinting) meters.energy = Math.max(0, meters.energy - 5 * dt);
  else if (!(ix || iz)) meters.energy = Math.min(100, meters.energy + 7 * dt);
  // footstep dust / wading splash: the world answers every step
  updatePlayer._dustT = (updatePlayer._dustT || 0) - dt;
  if ((ix || iz || autoMove) && updatePlayer._dustT <= 0) {
    updatePlayer._dustT = inWater ? 0.3 : 0.45;
    const feet = player.position.clone().addScaledVector(nn, inWater ? 0.1 : 0.05);
    burst(feet, inWater ? 0x9fdcff : 0xd9c9a8, inWater ? 6 : 3, inWater ? 1.2 : 0.6);
  }
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
    tmpM.copy(n).multiplyScalar(R * 3.1).add(V3(Math.cos(t) * 18 * S, 10 * S, Math.sin(t) * 18 * S));
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
  // an active auto-task keeps its bar pinned even at the edge of range
  const show = (activeTask && interactables.includes(activeTask.interact)) ? activeTask.interact : best;
  currentTarget = best;
  if (show) {
    interactBar.classList.remove('hidden');
    const auto = activeTask && activeTask.interact === show;
    interactKind.textContent = (auto ? '⚙️ AUTO · ' : '') + (show.kind || 'INTERACT');
    try {
      interactLabel.textContent = (typeof show.label === 'function' ? show.label() : show.label) + (auto ? ' — working…' : ' — click / E to auto');
    } catch { interactLabel.textContent = show.label || ''; }
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
  if (paused) { orbitYaw += dt * 0.04; renderer.render(scene, camera); return; } // menu vista: slow drift
  if (started) playtime += dt;
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
  updateBoatVisual(t);
  updateCamera(dt, n);
  updateInteract();
  updateBiomeLabel(n);
  // ocean shader clock + sun; old shimmer bob removed (waves live in the vertex shader)
  try {
    oceanUniforms.uTime.value = t;
    oceanUniforms.uSunDir.value.copy(sun.position).normalize();
  } catch { /* headless */ }
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
updateBoatVisual(0);
animate();
