// Legacy single-file game, moved here unchanged from the original index.html (Phase 0).
// It is being split into modules in Phase 1; see docs/REFACTOR_PLAN.md. Excluded from lint.
import {
  BOT_MAKER,
  bendPoint,
  classicBuild,
  bendUp,
  CIRC,
  clamp,
  damp,
  FT,
  HALF_L,
  HUB_L,
  HUB_R,
  LEN,
  lerp,
  mulberry,
  OMEGA,
  R_IN,
  R_OUT,
  RPM,
  smooth,
  TAU,
  unbend,
  wrapD,
} from '@saber-side/shared';
import * as THREE from 'three';
import { createFlightMode } from '../app/flight';
import { buildBotMaker } from '../world/bot-maker';
import { buildRobot, disposeRobot } from '../avatar/robot';
import { createRenderer } from '../render/renderer';
import { bendMaterial } from '../render/ring/bend';
import { makeCanvas, textureKit, wrapX } from '../render/textures';
import { dot } from '../render/kit';

/** Hooks the new modules call into (see app/aboard.ts). Filled in below, once the scene exists. */
export const legacy = { robotKit: null, setRobotBuild(_build) {}, rollOutOfBotMaker() {}, world: null, frameHooks: [] };

(() => {
const V3 = THREE.Vector3;
// Cosmetic randomness (glances, dust, sparks, tumbles) has its own seeded stream. three.js draws every object's id
// from Math.random, so sharing it would make these effects shift whenever anything adds or removes an object, or
// when fonts finish loading a moment sooner on one machine than another (signs redraw into new textures).
const fx = mulberry(0x5eed);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;


// ---------- renderer / scene ----------
const renderer = createRenderer(document.getElementById('stage'));   // render/renderer.ts
// the procedural texture painters (render/textures.ts)
const { toTex, drawTex, paintTex, glowTex, groundTex, crateTex } = textureKit(renderer.capabilities.getMaxAnisotropy());

// ---------- habitat scale ----------
// The bot stands 4 ft tall (about 3.35 scene units). The ring is 800 ft across outside with an 85 ft hull,
// so the floor sits on a 315 ft radius, and it runs 400 ft along its axis (scene x).
// (FT, R_IN, R_OUT, LEN, HALF_L, CIRC, wrapD, OMEGA, and RPM now live in @saber-side/shared ring-space.)

// Everything that lives on the floor is simulated on a flat strip (x across, z around the ring, y up)
// and bent onto the cylinder in the vertex shader (bendMaterial, render/ring/bend.ts); the CPU uses the same
// mapping for the camera and lights.

const scene = new THREE.Scene();
const HAZE = 0xb3bcc4;
scene.background = new THREE.Color(0x020306);
scene.fog = new THREE.Fog(HAZE, 70, 950);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.2, 4000);

// light comes from the sun-line on the axis, so it always falls straight "down" onto the floor
scene.add(new THREE.AmbientLight(0xfff4e6, 0.72));
const axisLight = new THREE.PointLight(0xfff1dc, 1.05, 0, 0);
scene.add(axisLight);

// ---------- procedural textures ----------
// (makeCanvas, toTex, wrapX, dot, paintTex, glowTex, groundTex, and crateTex live in render/textures.ts)
const GLOW = glowTex();

// ---------- materials ----------
const T = {
  shell: paintTex({ seed: 11, base: '#ddd4c4', light: '#f2ece2', shade: '#9f9283',
    seamsV: [0.11, 0.31, 0.52],
    seamsU: [...[0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map(u => ({ u, v0: 0.11, v1: 0.31 })), ...[0.0, 0.2, 0.4, 0.6, 0.8].map(u => ({ u: u + 0.1, v0: 0.31, v1: 0.52 })), ...[0.05, 0.3, 0.55, 0.8].map(u => ({ u, v0: 0.52, v1: 0.69 }))],
    stripes: [{ u0: 0.0, u1: 0.17, v0: 0.31, v1: 0.335 }, { u0: 0.33, u1: 0.55, v0: 0.31, v1: 0.335 }, { u0: 0.62, u1: 1.0, v0: 0.31, v1: 0.335 }, { u0: 0.47, u1: 0.5, v0: 0.33, v1: 0.5 }, { u0: 0.04, u1: 0.075, v0: 0.36, v1: 0.52 }, { u0: 0.7, u1: 0.74, v0: 0.12, v1: 0.3 }],
    patches: 22, patchV0: 0.1, patchV1: 0.68, rivets: true, speck: 7000, grime: [0.5, 0.7] }),
  head: paintTex({ seed: 23, base: '#ddd4c4', light: '#f2ece2', shade: '#9f9283',
    seamsV: [0.1, 0.27, 0.47, 0.63],
    seamsU: [...[0.12, 0.38, 0.62, 0.88].map(u => ({ u, v0: 0.1, v1: 0.27 })), ...[0.0, 0.18, 0.33, 0.5, 0.67, 0.82].map(u => ({ u, v0: 0.47, v1: 0.63 }))],
    stripes: [{ u0: 0.15, u1: 0.45, v0: 0.1, v1: 0.13 }, { u0: 0.55, u1: 0.9, v0: 0.27, v1: 0.3 }, { u0: 0.4, u1: 0.44, v0: 0.48, v1: 0.62 }, { u0: 0.0, u1: 0.2, v0: 0.6, v1: 0.63 }],
    patches: 16, patchV0: 0.05, patchV1: 0.7, rivets: true, speck: 6000, grime: [0.6, 0.85] }),
  limb: paintTex({ w: 512, h: 256, seed: 5, base: '#d8cfbf', light: '#efe9de', shade: '#9a8d7e', mottle: 400, patches: 9, speck: 2500, clusters: 22 }),
  band: paintTex({ w: 1024, h: 256, seed: 41, base: '#7c766f', light: '#a39c93', shade: '#4f4944', mottle: 600,
    seamsU: [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(u => ({ u: u + 0.06, v0: 0, v1: 1 })), rivets: false, speck: 9000 }),
  drive: paintTex({ w: 512, h: 256, seed: 9, base: '#5e5852', light: '#8a837a', shade: '#3a3531', mottle: 400,
    seamsV: [0.25, 0.5, 0.75], seamsU: [0, 0.25, 0.5, 0.75].map(u => ({ u: u + 0.12, v0: 0, v1: 1 })), rivets: true, speck: 6000 }),
};
const M = {
  shell: new THREE.MeshStandardMaterial({ map: T.shell.map, bumpMap: T.shell.bump, bumpScale: 0.012, roughness: 0.66, metalness: 0.12, side: THREE.DoubleSide }),
  head: new THREE.MeshStandardMaterial({ map: T.head.map, bumpMap: T.head.bump, bumpScale: 0.012, roughness: 0.62, metalness: 0.12 }),
  limb: new THREE.MeshStandardMaterial({ map: T.limb.map, bumpMap: T.limb.bump, bumpScale: 0.01, roughness: 0.66, metalness: 0.12 }),
  band: new THREE.MeshStandardMaterial({ map: T.band.map, bumpMap: T.band.bump, bumpScale: 0.01, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide }),
  drive: new THREE.MeshStandardMaterial({ map: T.drive.map, bumpMap: T.drive.bump, bumpScale: 0.01, roughness: 0.55, metalness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x48413b, roughness: 0.4, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.5, metalness: 0.7 }),
  tip: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.45, metalness: 0.6 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x2a0202, emissive: 0x7a0000, emissiveIntensity: 1.0, roughness: 0.08, metalness: 0.2 }),
  core: new THREE.MeshBasicMaterial({ color: 0xff7a5a }),
  led: new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2a14, emissiveIntensity: 2.2, roughness: 0.2 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xc0662a, roughness: 0.55, metalness: 0.3 }),
  carrot: new THREE.MeshStandardMaterial({ color: 0xe0701e, roughness: 0.7 }),
  carrotDark: new THREE.MeshStandardMaterial({ color: 0xb4521a, roughness: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4f8a2b, roughness: 0.75 }),
};

function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function glow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}
// place obj on a sphere of radius r: lat up from equator, lon from +z toward +x; obj +z faces outward
function onSphere(obj, r, lat, lon) {
  obj.position.set(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
  obj.rotation.set(-lat, lon, 0, 'YXZ');
  return obj;
}
const Cyl = (a, b, h, s = 20) => new THREE.CylinderGeometry(a, b, h, s);
const Sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const zCyl = (a, b, h, s = 24) => { const g = Cyl(a, b, h, s); g.rotateX(Math.PI / 2); return g; };

// ---------- robot ----------
// Built from parts by avatar/robot.ts. The player's own robot gets the eye light. It starts as the classic build, and
// is rebuilt (setRobotBuild, below) when the player comes aboard as a robot of their own.
const robotKit = { materials: M, mesh, glow, toTex };
legacy.robotKit = robotKit;
const bot = buildRobot(robotKit, classicBuild(), { eyeLight: true });
scene.add(bot.root);
// what other modules need to add robots of their own (app/presence.ts)
legacy.world = { scene, bot, kit: robotKit, drawTex };

// ---------- habitat: Ring Seven ----------
// Layout across the ring (x): promenade |x|<46 with shops facing it from 26..40, parks to 115, carrot farms to 161.
// four lift tubes, a quarter turn apart, run from the promenade straight up to the zero-g hub on the axis
const RIDE = 9;   // seconds up or down a lift (the hub's HUB_R and HUB_L now live in @saber-side/shared)
const REAL_OFF = 10000;   // anything parked this high is drawn as-is (unbent) after subtracting the offset
const Y_AXIS = new V3(0, 1, 0), X_AXIS = new V3(1, 0, 0);
const LIFTS = [0, 1, 2, 3].map(k => {
  const th = Math.PI / 4 + k * Math.PI / 2;
  return { k, th, z: wrapD(-th * R_IN), u: new V3(0, -Math.cos(th), -Math.sin(th)), q: new THREE.Quaternion().setFromAxisAngle(X_AXIS, th) };
});
const nearLift = p => LIFTS.find(L => Math.hypot(p.x, wrapD(p.z - L.z)) < 6);
const colliders = [];   // flat-space obstacles: boxes { x, z, hw, hd } or circles { x, z, r }
const spinners = [];    // things that turn on their own every frame
const signJobs = [];    // canvas signs to redraw once the display font arrives
const css = hex => '#' + new THREE.Color(hex).getHexString();

function floorStrip(x0, x1, tex, tile, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, CIRC, 1, 1024); g.rotateX(-Math.PI / 2);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((x1 - x0) / tile, Math.round(CIRC / tile));
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  if (y > 0) Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, y, 0); scene.add(m);
}
const grassTex = () => drawTex(256, 256, (g, w, h) => {
  const R = mulberry(5);
  g.fillStyle = '#6a8744'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.globalAlpha = 0.08; g.fillStyle = R() < 0.5 ? '#88a557' : '#4d6832'; dot(g, R() * w, R() * h, 4 + R() * 18); }
  g.globalAlpha = 1;
  for (let i = 0; i < 5000; i++) { g.fillStyle = ['#587636', '#7f9c4f', '#9ab566', '#44602b'][R() * 4 | 0]; g.fillRect(R() * w, R() * h, 1, 2 + R() * 3); }
});
const farmTex = () => drawTex(256, 256, (g, w, h) => {
  const R = mulberry(9);
  g.fillStyle = '#6b4a32'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) { g.fillStyle = R() < 0.5 ? '#5a3d29' : '#7d5a3e'; g.fillRect(R() * w, R() * h, 2, 2); }
  for (let r = 0; r < 8; r++) {
    const x = r * 32 + 16;
    for (let i = 0; i < 26; i++) { g.fillStyle = '#e0701e'; dot(g, x + (R() - 0.5) * 4, R() * h, 2.2); }
    for (let i = 0; i < 140; i++) {
      g.save(); g.translate(x + (R() - 0.5) * 8, R() * h); g.rotate((R() - 0.5) * 1.4);
      g.fillStyle = ['#5f8f34', '#77a83f', '#4c7a2a'][R() * 3 | 0]; g.fillRect(-1.5, -7, 3, 14); g.restore();
    }
  }
});
const stuccoTex = () => drawTex(256, 256, (g, w, h) => {
  const R = mulberry(17);
  g.fillStyle = '#e9e4da'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.globalAlpha = 0.12; g.fillStyle = R() < 0.5 ? '#ffffff' : '#a39a8c'; dot(g, R() * w, R() * h, 1 + R() * 3); }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(80,70,60,0.18)'; g.lineWidth = 2;
  for (let y = 64; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(70,52,38,0)'); gr.addColorStop(1, 'rgba(70,52,38,0.3)');
  g.fillStyle = gr; g.fillRect(0, h * 0.75, w, h * 0.25);
});
const stripeTex = () => drawTex(256, 64, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c9c2b6'; g.fillRect(i * 32, 0, 32, h); }
});

// instanced batches: one draw per kind of part, tinted per instance
const UNIT = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), cone: new THREE.ConeGeometry(0.5, 1, 8),
  ico: new THREE.IcosahedronGeometry(0.5, 1), sph: new THREE.SphereGeometry(0.5, 14, 10) };
const batches = new Map(), _dummy = new THREE.Object3D(), _col = new THREE.Color();
function part(key, geo, mat, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  let b = batches.get(key);
  if (!b) batches.set(key, b = { geo, mat, list: [] });
  b.list.push([x, y, z, sx, sy, sz, rx, ry, rz, color]);
}
function flushParts() {
  for (const b of batches.values()) {
    const im = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
    const tinted = b.list.some(e => e[9] !== undefined);
    b.list.forEach((e, i) => {
      _dummy.position.set(e[0], e[1], e[2]); _dummy.rotation.set(e[6], e[7], e[8]); _dummy.scale.set(e[3], e[4], e[5]);
      _dummy.updateMatrix(); im.setMatrixAt(i, _dummy.matrix);
      if (tinted) im.setColorAt(i, _col.set(e[9] === undefined ? 0xffffff : e[9]));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  }
}
const W = {
  wall: new THREE.MeshStandardMaterial({ map: stuccoTex(), roughness: 0.9 }),
  paint: new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.15 }),
  door: new THREE.MeshStandardMaterial({ color: 0x2b2522, roughness: 0.5, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x24303a, emissive: 0xffc982, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.3 }),
  awning: new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.85 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x77716b, roughness: 0.5, metalness: 0.6 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0xa9a399, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.85 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3f86a3, roughness: 0.06, metalness: 0.4, emissive: 0x0d2f40, emissiveIntensity: 0.7 }),
  glowWarm: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
  neon: new THREE.MeshBasicMaterial({ color: 0xff5fb1 }),
  lantern: new THREE.MeshBasicMaterial({ color: 0xff6a3d }),
  redLight: new THREE.MeshBasicMaterial({ color: 0xff3326 }),
  greenhouse: new THREE.MeshStandardMaterial({ color: 0xd8efe2, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
};

// ---- floors ----
floorStrip(-HALF_L - 3, HALF_L + 3, grassTex(), 6, 0);
floorStrip(-46, 46, groundTex(), 5, 0.015);
floorStrip(116, 161, farmTex(), 4.5, 0.015);
floorStrip(-161, -116, farmTex(), 4.5, 0.015);

// ---- shops ----
const SHOP_TYPES = [
  { name: 'SPROCKET & SONS', sub: 'ROBOT PARTS · EST. RING DAY 1', wall: 0x7c93a0, trim: 0x2f3a40, awn: 0xd0702c, prop: 'gear' },
  { name: 'THE OIL CAN', sub: 'BAR · OPEN LATE', wall: 0x8a5844, trim: 0x2a1d18, awn: 0x2f6f63, prop: 'barrels' },
  { name: 'CARROTS', sub: 'FRESH FROM THE RING FARMS', wall: 0xe0d2ad, trim: 0x55652b, awn: 0xe0701e, prop: 'carrots' },
  { name: 'BOLT BAZAAR', sub: 'JUNK · SALVAGE · TRADES', wall: 0x96876a, trim: 0x3b3326, awn: 0xb8a24a, prop: 'junk' },
  { name: 'COG COFFEE', sub: 'ESPRESSO · CRANK BREW', wall: 0x5a443b, trim: 0x1f1714, awn: 0xc9b79c, prop: 'cup' },
  { name: 'SPIN CYCLE', sub: 'LAUNDRY · ALWAYS SPINNING', wall: 0x6b9cbc, trim: 0x23384a, awn: 0xe8e2d6, prop: 'washer' },
  { name: 'AXLE ARCADE', sub: 'GAMES · HIGH SCORES', wall: 0x4a3b6b, trim: 0x17122a, awn: 0xd94a8c, prop: 'neon' },
  { name: 'RUST & RELAX', sub: 'POLISH · OIL BATHS', wall: 0xa6bcae, trim: 0x3d5246, awn: 0xf0e6d2, prop: 'plants' },
  { name: 'MEMORY BANK', sub: 'DATA · SAVINGS · LOANS', wall: 0xd2cbbb, trim: 0x55504a, awn: 0x46607a, prop: 'columns' },
  { name: 'ORBIT NOODLES', sub: 'HOT BOWLS · ZERO-G NOT INCLUDED', wall: 0xb2443a, trim: 0x3b1310, awn: 0xf2c14e, prop: 'lanterns' },
  { name: 'VOLT BOOKS', sub: 'MANUALS · NOVELS · MAPS', wall: 0x667a55, trim: 0x262e1f, awn: 0xd6c49a, prop: 'books' },
  { name: 'SPARE PARTS CLINIC', sub: 'REPAIRS WHILE U WAIT', wall: 0xe6e3dc, trim: 0x8a2a24, awn: 0x8a2a24, prop: 'cross' },
];
function makeSign(w, h, main, sub, bg, accent, mainSize) {
  const c = makeCanvas(w, h), tex = toTex(c, true);
  const draw = () => {
    const g = c.getContext('2d');
    g.fillStyle = css(bg); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(accent); g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f4ecdc';
    let fs = mainSize;
    do { g.font = `700 ${fs}px "Chakra Petch", "Arial Narrow", sans-serif`; fs -= 2; } while (g.measureText(main).width > w - 50 && fs > 12);
    g.fillText(main, w / 2, h * 0.42);
    g.font = `500 ${Math.round(h * 0.15)}px "IBM Plex Mono", monospace`; g.fillStyle = css(accent);
    g.fillText(sub, w / 2, h * 0.78);
    tex.needsUpdate = true;
  };
  draw(); signJobs.push(draw);
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.6 });
}
for (const t of SHOP_TYPES) t.signMat = makeSign(512, 128, t.name, t.sub, t.trim, t.awn, 58);
const SIGN_GEO = new THREE.PlaneGeometry(7.6, 1.9);
const GEAR_GEO = (() => {
  const s = new THREE.Shape(), teeth = 12, ro = 2.4, ri = 2.0;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = i / (teeth * 2) * TAU, a1 = (i + 1) / (teeth * 2) * TAU, r = i % 2 ? ri : ro;
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.8, 0, TAU, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }); g.translate(0, 0, -0.2); g.rotateY(Math.PI / 2);
  return g;
})();

const SHOP_FRONT = 26;
const PROPS = {
  gear(f, n, z, w, h, s) {
    const gm = new THREE.Mesh(GEAR_GEO, M.orange); gm.position.set(f + n * 0.5, h + 2.6, z); scene.add(gm);
    spinners.push(dt => { gm.rotation.x += dt * 0.8 * s; });
    part('steel', UNIT.box, W.steel, f + n * 0.5, h + 0.9, z, 0.3, 1.4, 0.3);
  },
  barrels(f, n, z, w) { for (const dz of [-1, 1]) for (let k = 0; k < 2; k++) part('barrel', UNIT.cyl, W.paint, f + n * (1 + k * 1.1), 0.75, z + dz * (w / 2 - 1.2), 1, 1.5, 1, k ? 0x2f6f63 : 0x8a4b2c); },
  carrots(f, n, z, w, h, s, R) {
    const cx = f + n * 3.5;
    part('wood', UNIT.box, W.wood, cx, 1, z, 1.8, 2, w * 0.6);
    colliders.push({ x: cx, z, hw: 1, hd: w * 0.3 });
    for (let i = 0; i < 26; i++) part('carrotI', UNIT.cone, M.carrot, cx + (R() - 0.5) * 1.3, 2.2 + R() * 0.2, z + (R() - 0.5) * w * 0.55, 0.28, 1, 0.28, undefined, 0, R() * TAU, Math.PI / 2);
    part('carrotI', UNIT.cone, M.carrot, f + n * 1, h + 3.2, z, 1.6, 6.5, 1.6, undefined, 0.5, 0, Math.PI / 2 + 0.4 * s);
    part('leafI', UNIT.cone, M.leaf, f + n * 1 - 3.2 * s, h + 3.2 + 1.4, z, 0.9, 2.4, 0.9, undefined, 0, 0, -0.9 * s);
  },
  junk(f, n, z, w, h, s, R) {
    for (let i = 0; i < 9; i++) {
      const big = 0.6 + R() * 1.1, round = R() < 0.4, col = [0x8a5a3a, 0x6b6560, 0x9a7b4a, 0x4f5a5e][R() * 4 | 0];
      part(round ? 'junkC' : 'junkB', round ? UNIT.cyl : UNIT.box, W.paint, f + n * (1 + R() * 2.2), big / 2 + (i > 5 ? big * 0.7 : 0), z + (R() - 0.5) * (w - 3), big, big, big * (0.8 + R() * 0.6), col, R() * 0.3, R() * TAU, R() * 0.3);
    }
  },
  cup(f, n, z, w, h) {
    part('paintCyl', UNIT.cyl, W.paint, f + n * 1.5, h + 0.2, z, 4.4, 0.4, 4.4, 0xf4efe6);
    part('paintCyl', UNIT.cyl, W.paint, f + n * 1.5, h + 2, z, 3, 3.2, 3, 0xf4efe6);
    part('paintCyl', UNIT.cyl, W.paint, f + n * 1.5, h + 3.55, z, 2.7, 0.1, 2.7, 0x3b2418);
  },
  washer(f, n, z, w) {
    for (const dz of [-1, 1]) {
      part('paintCyl', UNIT.cyl, W.paint, f + n * 0.12, 2.8, z + dz * (w / 4 + 0.4), 2.8, 0.3, 2.8, 0xdddddd, 0, 0, Math.PI / 2);
      part('glassCyl', UNIT.cyl, W.glass, f + n * 0.2, 2.8, z + dz * (w / 4 + 0.4), 2, 0.3, 2, undefined, 0, 0, Math.PI / 2);
    }
  },
  neon(f, n, z, w, h) {
    for (let i = 0; i < 5; i++) part('neon', UNIT.box, W.neon, f + n * 0.2, 3.2 + (i % 2) * 0.7, z - w * 0.35 + i * w * 0.175, 0.12, 0.12, w * 0.19, undefined, (i % 2 ? 0.6 : -0.6), 0, 0);
  },
  plants(f, n, z, w, h, s, R) {
    for (const dz of [-1, 1]) {
      part('pot', UNIT.cyl, W.paint, f + n * 1.2, 0.5, z + dz * (w / 2 - 1.3), 1.2, 1, 1.2, 0xb4643c);
      part('bush', UNIT.ico, W.leaf, f + n * 1.2, 1.7, z + dz * (w / 2 - 1.3), 1.8, 2, 1.8, 0x4f8a3b);
    }
  },
  columns(f, n, z, w, h) {
    for (let i = 0; i < 4; i++) part('column', UNIT.cyl, W.paint, f + n * 1.6, 3, z - w * 0.36 + i * w * 0.24, 0.8, 6, 0.8, 0xf2eee6);
    part('trim', UNIT.box, W.paint, f + n * 1.6, 6.3, z, 1.6, 0.6, w * 0.92, 0xf2eee6);
  },
  lanterns(f, n, z, w) { for (let i = 0; i < 5; i++) part('lantern', UNIT.sph, W.lantern, f + n * 2.5, 3.5, z - w * 0.34 + i * w * 0.17, 0.6, 0.75, 0.6); },
  books(f, n, z, w, h) {
    [0x8a2a24, 0x2f5a7a, 0xd6c49a].forEach((c, i) => part('paint', UNIT.box, W.paint, f + n * 2, h + 0.5 + i * 0.9, z + (i - 1) * 0.3, 3.2, 0.8, 4.4 - i * 0.4, c, 0, i * 0.2, 0));
  },
  cross(f, n, z, w, h) {
    part('redLight', UNIT.box, W.redLight, f + n * 0.2, h - 2.8, z + w * 0.32, 0.12, 2.4, 0.8);
    part('redLight', UNIT.box, W.redLight, f + n * 0.2, h - 2.8, z + w * 0.32, 0.12, 0.8, 2.4);
  },
};
function buildShop(z, s, w, T, R) {
  const depth = 10 + R() * 4, h = 7.5 + R() * 6;
  const cx = s * (SHOP_FRONT + depth / 2), f = s * SHOP_FRONT, n = -s;  // n points out toward the promenade
  part('wall', UNIT.box, W.wall, cx, h / 2, z, depth, h, w, T.wall);
  part('trim', UNIT.box, W.paint, cx, h + 0.3, z, depth + 0.4, 0.6, w + 0.4, T.trim);
  part('trim', UNIT.box, W.paint, cx, 0.4, z, depth + 0.1, 0.8, w + 0.1, T.trim);
  part('door', UNIT.box, W.door, f + n * 0.1, 1.7, z, 0.3, 3.4, 2.2);
  const ww = Math.min(3.6, w / 2 - 2.2);
  for (const dz of [-1, 1]) part('glass', UNIT.box, W.glass, f + n * 0.08, 2.6, z + dz * (1.1 + 0.4 + ww / 2), 0.2, 2.4, ww);
  if (h > 10.5) for (const dz of [-1, 0, 1]) part('glass', UNIT.box, W.glass, f + n * 0.08, h - 2.4, z + dz * w / 3.3, 0.2, 1.5, 2.2);
  part('awning', UNIT.box, W.awning, f + n * 1.35, 4.5, z, 2.9, 0.12, w * 0.86, T.awn, 0, 0, s * 0.35);
  const sy = Math.min(h - 1.3, 6.6);
  part('trim', UNIT.box, W.paint, f + n * 0.12, sy, z, 0.25, 2.1, 8, T.trim);
  const sign = new THREE.Mesh(SIGN_GEO, T.signMat); sign.position.set(f + n * 0.27, sy, z); sign.rotation.y = -s * Math.PI / 2; scene.add(sign);
  part('steel', UNIT.box, W.steel, cx + s * (R() - 0.3) * depth * 0.3, h + 1.2, z + (R() - 0.5) * w * 0.4, 2.2, 1.4, 2.6);
  part('steelCyl', UNIT.cyl, W.steel, cx + s * depth * 0.3, h + 1, z - w * 0.3, 0.7, 1.4, 0.7);
  colliders.push({ x: cx, z, hw: depth / 2 + 0.1, hd: w / 2 + 0.1 });
  PROPS[T.prop](f, n, z, w, h, s, R);
}
const RESERVED = [[-36, 36], [CIRC / 4 - 20, CIRC / 4 + 20], [-CIRC / 4 - 14, -CIRC / 4 + 14]];
const reserved = (a, b) => RESERVED.some(([r0, r1]) => b > r0 && a < r1);
for (const s of [-1, 1]) {
  const R = mulberry(s > 0 ? 71 : 113);
  let zc = -CIRC / 2 + 4, last = -1;
  while (zc < CIRC / 2 - 14) {
    const w = 11 + (R() * 4 | 0) * 2;
    if (reserved(zc, zc + w)) { zc += 6; continue; }
    let ti; do { ti = R() * SHOP_TYPES.length | 0; } while (ti === last);
    last = ti;
    buildShop(zc + w / 2, s, w, SHOP_TYPES[ti], R);
    zc += w + 3 + R() * 7;
  }
}

// ---- promenade furniture: lamps, benches, center planters ----
for (const s of [-1, 1]) for (let z = -CIRC / 2 + 8; z < CIRC / 2; z += 16) {
  part('lampPost', UNIT.cyl, W.steel, s * 23, 2.6, z, 0.28, 5.2, 0.28);
  part('lampArm', UNIT.box, W.steel, s * 22.4, 5.1, z, 1.3, 0.14, 0.14);
  part('lampHead', UNIT.sph, W.glowWarm, s * 21.8, 4.95, z, 0.55, 0.4, 0.55);
  colliders.push({ x: s * 23, z, r: 0.3 });
  if (Math.round(z / 16) % 3 === 0 && !reserved(z - 3, z + 3)) {
    part('wood', UNIT.box, W.wood, s * 20.6, 0.55, z + 6, 0.7, 0.12, 2.6);
    part('wood', UNIT.box, W.wood, s * 20.95, 0.9, z + 6, 0.12, 0.6, 2.6);
  }
}
for (let z = -CIRC / 2 + 30; z < CIRC / 2 - 20; z += 64) {
  if (reserved(z - 8, z + 8)) continue;
  if (LIFTS.some(L => Math.abs(wrapD(z - L.z)) < 14)) continue;
  part('stone', UNIT.box, W.stone, 0, 0.5, z, 3, 1, 8);
  for (const dz of [-2.5, 0, 2.5]) part('bush', UNIT.ico, W.leaf, 0, 1.6, z + dz, 2.2, 2, 2.2, 0x5a9a3f);
  colliders.push({ x: 0, z, hw: 1.6, hd: 4.1 });
}

// ---- welcome arch over the start plaza ----
{
  const z = -36;
  for (const s of [-1, 1]) { part('trim', UNIT.box, W.paint, s * 20, 6.5, z, 1.6, 13, 1.6, 0x2f3a40); colliders.push({ x: s * 20, z, hw: 0.9, hd: 0.9 }); }
  part('trim', UNIT.box, W.paint, 0, 13.3, z, 42, 2.6, 1.6, 0x2f3a40);
  const mat = makeSign(1024, 128, 'RING SEVEN', `POP. 1 ROBOT · ${RPM.toFixed(2)} RPM · 1 G`, 0x2f3a40, 0xd0702c, 70);
  for (const side of [1, -1]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(24, 3), mat);
    sg.position.set(0, 13.3, z + side * 0.82); sg.rotation.y = side > 0 ? 0 : Math.PI; scene.add(sg);
  }
}

// ---- landmarks ----
const landmarkZones = [];  // keep trees out: [x, z, radius]
// fountain plaza a quarter of the way round
{
  const z = CIRC / 4, g = new THREE.Group(); g.position.set(0, 0, z); scene.add(g);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 1, 48), W.stone); basin.position.y = 0.5; g.add(basin);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.1, 48), W.water); pool.position.y = 0.95; g.add(pool);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 3, 16), W.stone); ped.position.y = 2; g.add(ped);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3, 1.4, 0.7, 32), W.stone); bowl.position.y = 3.6; g.add(bowl);
  const bowlW = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.1, 32), W.water); bowlW.position.y = 3.95; g.add(bowlW);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 2.6, 12), M.orange); spire.position.y = 5.2; g.add(spire);
  const jets = [];
  for (let i = 0; i < 18; i++) { const sp = glow(0xcfe9ff, 0.7, 0.6); sp.material.blending = THREE.NormalBlending; g.add(sp); jets.push({ sp, a: i / 18 * TAU, k: i / 18 }); }
  spinners.push((dt, t) => { for (const j of jets) { const q = (t * 0.7 + j.k) % 1; j.sp.position.set(Math.cos(j.a) * (0.6 + q * 2.4), 6.4 + q * 1.2 - q * q * 3.4, Math.sin(j.a) * (0.6 + q * 2.4)); j.sp.material.opacity = 0.7 * (1 - q); } });
  colliders.push({ x: 0, z, r: 7.3 });
}
// ferris wheel on the far side of the ring, overhead from the start
{
  const z = CIRC / 2 - 30, x = 76, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  for (const sx of [-3.2, 3.2]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 22, 0.6), W.steel); leg.position.set(sx, 10.5, sz * 3.6); leg.rotation.x = sz * 0.34; g.add(leg);
  }
  const wheel = new THREE.Group(); wheel.position.y = 20.5; g.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7.4, 16), W.steel); hub.rotation.z = Math.PI / 2; wheel.add(hub);
  for (const sx of [-1.6, 1.6]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(16, 0.32, 8, 96), M.orange); rim.rotation.y = Math.PI / 2; rim.position.x = sx; wheel.add(rim);
    for (let i = 0; i < 12; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 32, 0.18), W.steel); sp.position.x = sx; sp.rotation.x = i / 12 * Math.PI; wheel.add(sp); }
  }
  const bulbs = new THREE.InstancedMesh(UNIT.sph, W.glowWarm, 48);
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; _dummy.position.set(i % 2 ? 1.6 : -1.6, Math.cos(a) * 16, Math.sin(a) * 16); _dummy.rotation.set(0, 0, 0); _dummy.scale.setScalar(0.45); _dummy.updateMatrix(); bulbs.setMatrixAt(i, _dummy.matrix); }
  wheel.add(bulbs);
  const cars = [], carCols = [0xd0702c, 0x2f6f63, 0xd94a8c, 0x46607a, 0xf2c14e, 0x8a2a24];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, pivot = new THREE.Group(); pivot.position.set(0, Math.cos(a) * 16, Math.sin(a) * 16); wheel.add(pivot);
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.2), new THREE.MeshStandardMaterial({ color: carCols[i % 6], roughness: 0.6 })); car.position.y = -1.6; pivot.add(car);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 2.5), W.steel); roof.position.y = -0.5; pivot.add(roof);
    cars.push(pivot);
  }
  spinners.push(dt => { wheel.rotation.x += dt * 0.12; for (const c of cars) c.rotation.x = -wheel.rotation.x; });
  colliders.push({ x, z, hw: 4, hd: 8 });
  landmarkZones.push([x, z, 22]);
}
// observation tower three quarters of the way round
{
  const z = -CIRC / 4, x = -80, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 40, 20), W.stone); shaft.position.y = 20; g.add(shaft);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, 3, 32), W.steel); pod.position.y = 40; g.add(pod);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 1.4, 32), W.glass); band.position.y = 42.2; g.add(band);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(7.2, 3, 32), M.orange); cap.position.y = 44.4; g.add(cap);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6, 8), W.steel); mast.position.y = 48.9; g.add(mast);
  const beacon = new THREE.Mesh(UNIT.sph, W.redLight); beacon.scale.setScalar(0.8); beacon.position.y = 52; g.add(beacon);
  spinners.push((dt, t) => { beacon.visible = (t % 1.6) < 0.5; });
  colliders.push({ x, z, r: 3 });
  landmarkZones.push([x, z, 10]);
}
// greenhouse dome
{
  const z = 140, x = -80, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 20, 0, TAU, 0, Math.PI / 2), W.greenhouse); g.add(dome);
  for (let i = 0; i < 6; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(14, 0.14, 6, 48, Math.PI), W.steel); rib.rotation.y = i / 6 * Math.PI; g.add(rib); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.3, 6, 64), W.steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  const R = mulberry(31);
  for (let i = 0; i < 40; i++) {
    const a = R() * TAU, r = R() * 11, hgt = 1.5 + R() * 4;
    part('greenTree', UNIT.cone, W.leaf, x + Math.cos(a) * r, hgt / 2, z + Math.sin(a) * r, 1.4, hgt, 1.4, [0x3f8a4b, 0x5fae55, 0xc65b8f, 0xe8b23a][R() * 4 | 0]);
  }
  colliders.push({ x, z, r: 14.2 });
  landmarkZones.push([x, z, 18]);
}
// ponds in the parks
{
  const R = mulberry(57);
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1, r = 6 + R() * 6, x = s * (62 + R() * 40), z = -CIRC / 2 + (i + 0.5) * CIRC / 8 + (R() - 0.5) * 60;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(r, 48), W.water); pond.rotation.x = -Math.PI / 2; pond.position.set(x, 0.05, z); scene.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.45, 6, 48), W.stone); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.1, z); scene.add(rim);
    landmarkZones.push([x, z, r + 3]);
  }
}
// park trees
{
  const R = mulberry(23);
  const greens = [0x4f8a3b, 0x5f9a45, 0x3f7a35, 0x6fa84e, 0x7a9a3a];
  for (const s of [-1, 1]) for (let ax = 51; ax < 113; ax += 8.5) for (let z = -CIRC / 2; z < CIRC / 2; z += 8.5) {
    if (R() > 0.45) continue;
    const x = s * (ax + R() * 5), zz = z + R() * 6;
    if (landmarkZones.some(([lx, lz, lr]) => Math.hypot(x - lx, wrapD(zz - lz)) < lr)) continue;
    const hgt = 2.5 + R() * 3, fall = R() < 0.07;
    part('trunk', UNIT.cyl, W.bark, x, hgt / 2, zz, 0.6, hgt, 0.6);
    if (R() < 0.3) part('conifer', UNIT.cone, W.leaf, x, hgt + 2.6, zz, 4, 7 + R() * 3, 4, 0x2f6a3a);
    else part('canopy', UNIT.ico, W.leaf, x, hgt + 2, zz, 5 + R() * 2.5, 4.5 + R() * 2, 5 + R() * 2.5, fall ? 0xd9862e : greens[R() * greens.length | 0]);
    colliders.push({ x, z: zz, r: 0.5 });
  }
}
// farm silos and barns out by the end caps
{
  const R = mulberry(61);
  for (const s of [-1, 1]) for (let z = -CIRC / 2 + 40; z < CIRC / 2; z += 140) {
    const zz = z + R() * 30;
    part('silo', UNIT.cyl, W.paint, s * 152, 7, zz, 7, 14, 7, 0xcfc8bb);
    part('siloDome', UNIT.sph, W.steel, s * 152, 14, zz, 7, 4, 7);
    colliders.push({ x: s * 152, z: zz, r: 3.7 });
    const bz = zz + 22;
    part('barn', UNIT.box, W.paint, s * 140, 3.5, bz, 10, 7, 14, 0x9b3328);
    for (const k of [-1, 1]) part('barnRoof', UNIT.box, W.paint, s * 140 + k * 2.6, 8.1, bz, 6.4, 0.3, 14.6, 0x3b3330, 0, 0, -k * 0.6);
    part('door', UNIT.box, W.door, s * 140 - s * 5.05, 2.4, bz, 0.2, 4.6, 4);
    colliders.push({ x: s * 140, z: bz, hw: 5.1, hd: 7.1 });
  }
}
flushParts();

// ---- end caps (real space, not bent): steel discs with window bands looking out at the stars ----
const capTex = drawTex(1024, 1024, (g, w) => {
  const c = w / 2, R = mulberry(88);
  g.fillStyle = '#5b6168'; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
  for (let i = 0; i < 900; i++) { g.globalAlpha = 0.06; g.fillStyle = R() < 0.5 ? '#ffffff' : '#000000'; dot(g, R() * w, R() * w, 4 + R() * 30); }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(20,24,28,0.55)'; g.lineWidth = 3;
  for (let r = 0.1; r < 1; r += 0.05) { g.beginPath(); g.arc(c, c, r * c, 0, TAU); g.stroke(); }
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 0.82 * c, c + Math.sin(a) * 0.82 * c); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 12; i++) {
    const a0 = i / 12 * TAU + 0.06, a1 = (i + 1) / 12 * TAU - 0.06;
    g.beginPath(); g.arc(c, c, 0.79 * c, a0, a1); g.arc(c, c, 0.4 * c, a1, a0, true); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle = '#2b3036'; g.lineWidth = 9;
  g.beginPath(); g.arc(c, c, 0.6 * c, 0, TAU); g.stroke();
  for (let i = 0; i < 24; i++) { if (i % 2 === 0) continue; const a = i / 24 * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 0.4 * c, c + Math.sin(a) * 0.4 * c); g.lineTo(c + Math.cos(a) * 0.79 * c, c + Math.sin(a) * 0.79 * c); g.stroke(); }
  g.fillStyle = '#3b4148'; g.beginPath(); g.arc(c, c, 0.17 * c, 0, TAU); g.fill();
  g.strokeStyle = '#ffd9a0'; g.lineWidth = 7; g.beginPath(); g.arc(c, c, 0.21 * c, 0, TAU); g.stroke();
  g.fillStyle = '#ffcf7a';
  for (let i = 0; i < 72; i++) { const a = i / 72 * TAU; dot(g, c + Math.cos(a) * 0.9 * c, c + Math.sin(a) * 0.9 * c, 3.5); }
});
const capMat = new THREE.MeshBasicMaterial({ map: capTex, alphaTest: 0.5, side: THREE.DoubleSide });
for (const s of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R_IN + 2, 256), capMat);
  cap.rotation.y = -s * Math.PI / 2; cap.position.x = s * HALF_L;
  cap.userData.noBend = true; scene.add(cap);
}
// the sun-line down the axis
{
  const g = new THREE.Group(); g.userData.noBend = true; scene.add(g);
  // two segments, one each side of the hub
  const segLen = HALF_L - HUB_L / 2, coreMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false, toneMapped: false });
  for (const s of [-1, 1]) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, segLen, 20, 1, true), coreMat);
    core.rotation.z = Math.PI / 2; core.position.x = s * (HUB_L / 2 + segLen / 2); g.add(core);
    for (const [r, op] of [[3, 0.3], [8, 0.08]]) {
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, segLen, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6b8, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      halo.rotation.z = Math.PI / 2; halo.position.x = core.position.x; g.add(halo);
    }
  }
}
// space outside: it turns past the windows because the ring (and everyone on it) is spinning
const sky = new THREE.Group(); sky.userData.noBend = true; scene.add(sky);
{
  const R = mulberry(99), n = 6000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1; const l = Math.hypot(x, y, z) || 1;
    pos.set([x / l * 2800, y / l * 2800, z / l * 2800], i * 3);
    const tint = R(); col.set(tint < 0.15 ? [1, 0.85, 0.7] : tint < 0.3 ? [0.75, 0.85, 1] : [1, 1, 1], i * 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sky.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, fog: false })));
  const planetTex = drawTex(512, 256, (g, w, h) => {
    const P = mulberry(4);
    g.fillStyle = '#1f4f86'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const cx = P() * w, cy = h * 0.2 + P() * h * 0.6; for (let k = 0; k < 30; k++) { g.fillStyle = P() < 0.6 ? '#4f7a3a' : '#a08a5a'; dot(g, cx + (P() - 0.5) * 60, cy + (P() - 0.5) * 30, 4 + P() * 10); } }
    g.fillStyle = '#e8eef2'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    for (let i = 0; i < 300; i++) { g.globalAlpha = 0.25; g.fillStyle = '#ffffff'; g.fillRect(P() * w, P() * h, 20 + P() * 50, 3 + P() * 4); }
    g.globalAlpha = 1;
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(520, 48, 32), new THREE.MeshBasicMaterial({ map: planetTex, fog: false }));
  planet.position.set(-2200, 1200, 600); sky.add(planet);
  const sunSprite = glow(0xfff0d0, 700, 1); sunSprite.material.fog = false; sunSprite.position.set(2300, -900, -900); sky.add(sunSprite);
}

// ---- blob shadows (there is no sun to cast real ones) ----
const blobTex = drawTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
const BLOB_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeBlob(size) {
  const m = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8 }));
  m.scale.set(size, 1, size); scene.add(m); return m;
}
bot.blob = makeBlob(2.6);

function collideWorld(p, rad) {
  for (const c of colliders) {
    const dx = p.x - c.x; if (Math.abs(dx) > 30) continue;
    const dz = wrapD(p.z - c.z); if (Math.abs(dz) > 30) continue;
    if (c.r !== undefined) {
      const d = Math.hypot(dx, dz), m = c.r + rad;
      if (d < m && d > 1e-4) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
    } else {
      const ex = dx - clamp(dx, -c.hw, c.hw), ez = dz - clamp(dz, -c.hd, c.hd), d = Math.hypot(ex, ez);
      if (d >= rad) continue;
      if (d > 1e-4) { p.x += ex / d * (rad - d); p.z += ez / d * (rad - d); }
      else { const ox = c.hw - Math.abs(dx), oz = c.hd - Math.abs(dz); if (ox < oz) p.x += Math.sign(dx || 1) * (ox + rad); else p.z += Math.sign(dz || 1) * (oz + rad); }
    }
  }
}

const ARENA = 21;
function paintRing(r0, r1, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; scene.add(m);
}
paintRing(ARENA + 0.6, ARENA + 1.0, 0xc8692a, 0.55);
paintRing(2.6, 2.8, 0xe0d6c6, 0.35);
paintRing(0.0, 0.2, 0xc8692a, 0.5);

const hazardC = makeCanvas(256, 64), hz = hazardC.getContext('2d');
hz.fillStyle = '#d4a02c'; hz.fillRect(0, 0, 256, 64); hz.fillStyle = '#2a2420';
for (let x = -64; x < 320; x += 48) { hz.beginPath(); hz.moveTo(x, 0); hz.lineTo(x + 24, 0); hz.lineTo(x - 8, 64); hz.lineTo(x - 32, 64); hz.fill(); }
const hazard = new THREE.MeshStandardMaterial({ map: toTex(hazardC, true), roughness: 0.8 });

// ---------- weapon table + items ----------
const TABLE = { x: -4, z: -3, w: 3.0, d: 1.2, top: 0.95 };
{
  const tg = new THREE.Group(); tg.position.set(TABLE.x, 0, TABLE.z); scene.add(tg);
  const top = mesh(new THREE.BoxGeometry(TABLE.w, 0.1, TABLE.d), M.band); top.position.y = TABLE.top - 0.05; tg.add(top);
  const lip = mesh(new THREE.BoxGeometry(TABLE.w + 0.04, 0.06, 0.04), hazard); lip.position.set(0, TABLE.top - 0.06, TABLE.d / 2 + 0.01); tg.add(lip);
  const lip2 = lip.clone(); lip2.position.z = -TABLE.d / 2 - 0.01; tg.add(lip2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(0.1, TABLE.top - 0.1, 0.1), M.metal);
    leg.position.set(sx * (TABLE.w / 2 - 0.1), (TABLE.top - 0.1) / 2, sz * (TABLE.d / 2 - 0.1)); tg.add(leg);
  }
  const shelf = mesh(new THREE.BoxGeometry(TABLE.w - 0.2, 0.05, TABLE.d - 0.2), M.dark); shelf.position.y = 0.25; tg.add(shelf);
}
// ---- the Bot Maker, where new robots roll out onto the promenade (world/bot-maker.ts) ----
{
  const botMaker = buildBotMaker({ makeSign, glow, steel: W.steel, glass: W.glass, lamp: W.glowWarm, hazard });
  scene.add(botMaker.root);
  colliders.push(...botMaker.colliders);
}

// height of whatever is under (x, z) for something falling from height y
function surfaceY(x, z, y) {
  return y > TABLE.top - 0.25 && Math.abs(x - TABLE.x) < TABLE.w / 2 && Math.abs(z - TABLE.z) < TABLE.d / 2 ? TABLE.top : 0;
}

// every item is built pointing along +y with the grip point at its origin
function makeSaber(color, name) {
  const g = new THREE.Group();
  g.add(mesh(Cyl(0.034, 0.034, 0.3, 16), M.metal));
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 16), M.dark); r.rotation.x = Math.PI / 2; r.position.y = -0.1 + i * 0.045; g.add(r); }
  const emitter = mesh(Cyl(0.045, 0.038, 0.07, 16), M.metal); emitter.position.y = 0.17; g.add(emitter);
  const emitRing = mesh(Cyl(0.047, 0.047, 0.015, 16), M.dark); emitRing.position.y = 0.2; g.add(emitRing);
  const pommel = mesh(Cyl(0.03, 0.04, 0.05, 16), M.dark); pommel.position.y = -0.17; g.add(pommel);
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.02), new THREE.MeshBasicMaterial({ color })); btn.position.set(0, 0.11, 0.036); g.add(btn);
  const blade = new THREE.Group(); blade.position.y = 0.2; g.add(blade);
  const BL = 1.3;
  const bladeGeo = r => { const b = Cyl(r, r * 0.92, BL, 16); b.translate(0, BL / 2, 0); return b; };
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  coreMat.color.set(color).lerp(new THREE.Color(0xffffff), 0.85);
  blade.add(new THREE.Mesh(bladeGeo(0.019), coreMat));
  const tipCap = new THREE.Mesh(Sph(0.018, 12, 8), coreMat); tipCap.position.y = BL; blade.add(tipCap);
  const glow = [[0.042, 0.6], [0.085, 0.24], [0.15, 0.09]].map(([r, op]) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    blade.add(new THREE.Mesh(bladeGeo(r), m));
    return { m, op };
  });
  const light = new THREE.PointLight(color, 1.6, 4.5, 2); light.position.y = BL / 2; blade.add(light);
  return { kind: 'saber', name, group: g, blade, glow, light, color, lit: 0, target: 0, rest: 0.05 };
}
function makeBlaster() {
  // grip along the hand; held with the grip flipped, so the body sits at -y and the barrel points -z
  const g = new THREE.Group();
  const handle = mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), M.dark); handle.rotation.x = -0.2; g.add(handle);
  const body = mesh(new THREE.BoxGeometry(0.11, 0.13, 0.38), M.limb); body.position.set(0, -0.16, -0.08); g.add(body);
  const barrel = mesh(zCyl(0.035, 0.035, 0.34, 14), M.metal); barrel.position.set(0, -0.17, -0.42); g.add(barrel);
  for (let i = 0; i < 3; i++) { const fin = mesh(zCyl(0.05, 0.05, 0.025, 14), M.dark); fin.position.set(0, -0.17, -0.34 - i * 0.07); g.add(fin); }
  const muzzle = mesh(zCyl(0.048, 0.04, 0.05, 14), M.dark); muzzle.position.set(0, -0.17, -0.6); g.add(muzzle);
  const scope = mesh(zCyl(0.03, 0.03, 0.17, 12), M.dark); scope.position.set(0, -0.26, -0.06); g.add(scope);
  const stripe = mesh(new THREE.BoxGeometry(0.115, 0.03, 0.2), M.orange); stripe.position.set(0, -0.12, -0.1); g.add(stripe);
  const coil = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.035, 0.18), M.led); coil.position.set(0.058, -0.17, -0.08); g.add(coil);
  const tip = new THREE.Object3D(); tip.position.set(0, -0.17, -0.66); g.add(tip);
  return { kind: 'gun', name: 'blaster', group: g, muzzle: tip, cd: 0, rest: 0.06 };
}
function makeCarrot() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const cone = mesh(new THREE.ConeGeometry(0.075, 0.55, 14, 6), M.carrot); cone.position.y = 0.22; body.add(cone);
  for (const [y, r] of [[0.05, 0.068], [0.17, 0.056], [0.29, 0.042], [0.39, 0.03]]) {
    const ring = mesh(new THREE.TorusGeometry(r, 0.005, 5, 18), M.carrotDark); ring.rotation.x = Math.PI / 2; ring.position.y = y; body.add(ring);
  }
  for (let i = 0; i < 4; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.025, 0.22, 6), M.leaf);
    leaf.position.y = -0.14; leaf.rotation.set(Math.PI + Math.cos(i * 1.7) * 0.35, 0, Math.sin(i * 1.7) * 0.35); body.add(leaf);
  }
  return { kind: 'carrot', name: 'carrot', group: g, body, bites: 0, rest: 0.075 };
}
const items = [
  Object.assign(makeSaber(0xff2414, 'red saber'), { home: null }),
  Object.assign(makeSaber(0x2a8cff, 'blue saber'), { home: [TABLE.x - 0.95, TABLE.top + 0.05, TABLE.z + 0.1, 0.15] }),
  Object.assign(makeBlaster(), { home: [TABLE.x + 0.05, TABLE.top + 0.06, TABLE.z, -0.1] }),
  Object.assign(makeCarrot(), { home: [TABLE.x + 0.95, TABLE.top + 0.075, TABLE.z - 0.1, 0.3] }),
];
for (const it of items) { it.vel = new V3(); it.av = new V3(); it.state = 'loose'; it.respawn = 0; }
let held = null;
function placeOnTable(it) {
  scene.add(it.group);
  it.group.position.set(it.home[0], it.home[1], it.home[2]);
  it.group.rotation.set(0, it.home[3], Math.PI / 2);
  it.group.scale.setScalar(1.2);  // the hand that holds it is scaled 1.2
  it.group.visible = true;
  it.vel.set(0, 0, 0); it.av.set(0, 0, 0); it.state = 'loose'; it.settled = true;
}
function hold(it) {
  held = it; it.state = 'held';
  bot.grip.add(it.group);
  it.group.position.set(0, 0, 0); it.group.rotation.set(0, 0, 0); it.group.scale.setScalar(1);
  it.vel.set(0, 0, 0); it.av.set(0, 0, 0);
  if (it.kind === 'saber') it.target = 1;
}
function dropHeld() {
  if (!held) return;
  const it = held; held = null; it.state = 'loose'; it.settled = false;
  scene.attach(it.group);
  it.vel.set(Math.sin(st.yaw) * (2 + st.vel * 0.6), 2.5, Math.cos(st.yaw) * (2 + st.vel * 0.6));
  it.av.set((fx() - 0.5) * 8, (fx() - 0.5) * 6, (fx() - 0.5) * 8);
  if (it.kind === 'saber') it.target = 0;
}
function resetItems() {
  if (held) { scene.attach(held.group); held = null; }
  for (const it of items) {
    if (it.kind === 'carrot') { it.bites = 0; it.body.scale.y = 1; }
    if (it.kind === 'saber') it.lit = it.target = 0;
    if (it.home) placeOnTable(it);
  }
  hold(items[0]);
  items[0].lit = 1;
}

// ---------- cargo crates (they drift in the hub) ----------
const crateMats = [
  new THREE.MeshStandardMaterial({ map: crateTex(101, '#b8642c', 'R-7'), roughness: 0.7, metalness: 0.25 }),
  new THREE.MeshStandardMaterial({ map: crateTex(202, '#5d6a72', 'BOLTS'), roughness: 0.7, metalness: 0.3 }),
  new THREE.MeshStandardMaterial({ map: crateTex(303, '#cbc1b0', 'SPARE'), roughness: 0.75, metalness: 0.15 }),
];
resetItems();

// ---------- particles ----------
function makePool(n, additive) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.visible = false; scene.add(s);
    list.push({ s, vel: new V3(), life: 0, max: 1, size: 1, grow: 1, grav: 0, drag: 0, alpha: 1 });
  }
  return { list, i: 0 };
}
const dustPool = makePool(120, false), sparkPool = makePool(140, true);
function spawn(pool, pos, vel, o) {
  const p = pool.list[pool.i = (pool.i + 1) % pool.list.length];
  p.s.position.copy(pos); p.vel.copy(vel);
  p.life = p.max = o.life; p.size = o.size; p.grow = o.grow; p.grav = o.grav || 0; p.drag = o.drag || 0; p.alpha = o.alpha;
  p.s.material.color.set(o.color); p.s.visible = true;
}
function updatePool(pool, dt) {
  for (const p of pool.list) {
    if (!p.s.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    const k = p.life / p.max;
    p.vel.y -= p.grav * dt; p.vel.multiplyScalar(Math.exp(-p.drag * dt));
    p.s.position.addScaledVector(p.vel, dt);
    if (p.s.position.y < 0.05) { p.s.position.y = 0.05; p.vel.y *= -0.4; }
    p.s.scale.setScalar(p.size * lerp(p.grow, 1, k));
    p.s.material.opacity = p.alpha * k;
  }
}
const tmp = new V3(), tmp2 = new V3(), tmp3 = new V3();
function dustBurst(x, z, count, power) {
  for (let i = 0; i < count; i++) {
    const a = fx() * TAU, sp = power * (0.5 + fx());
    spawn(dustPool, tmp.set(x + Math.cos(a) * 0.7, 0.15, z + Math.sin(a) * 0.7), tmp2.set(Math.cos(a) * sp, 0.6 + fx() * 1.2, Math.sin(a) * sp),
      { life: 0.6 + fx() * 0.5, size: 0.5 + fx() * 0.4, grow: 2.4, drag: 3, color: 0xc7b9a6, alpha: 0.5 });
  }
}

// ---------- input ----------
const keys = {}, pressed = {};
const keymap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', KeyX: 'spin', ShiftLeft: 'boost', ShiftRight: 'boost', KeyR: 'reset',
  KeyQ: 'camL', KeyE: 'camR', KeyC: 'camReset', KeyF: 'use', KeyG: 'grab', Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut' };
const hint = document.getElementById('hint');
const dismissHint = () => hint.classList.add('gone');
let legendTimer = 0;
function press(k) { if (!keys[k]) pressed[k] = true; keys[k] = true; dismissHint(); if (!legendTimer) legendTimer = setTimeout(() => { document.getElementById('keysbox').open = false; }, 12000); }
addEventListener('keydown', e => { const k = keymap[e.code]; if (!k) return; e.preventDefault(); press(k); document.getElementById('touch').hidden = true; });
addEventListener('keyup', e => { const k = keymap[e.code]; if (!k) return; e.preventDefault(); keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// camera: drag to orbit, wheel or pinch to zoom, double-click to reset
const cam = { yaw: 0, pitch: 0, zoom: 1, lastInput: -99, dragging: false };
const ZOOM_MIN = 0.45, ZOOM_MAX = 7;
const camTouched = () => { cam.lastInput = performance.now() / 1000; };
function resetCam() { cam.yaw = 0; cam.pitch = 0; cam.zoom = 1; camTouched(); }
{
  const cv = renderer.domElement, ptrs = new Map();
  let pinch0 = 0, zoom0 = 1;
  const spread = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  cv.addEventListener('pointerdown', e => {
    cv.focus(); cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cam.dragging = true; camTouched();
    if (ptrs.size === 2) { pinch0 = spread(); zoom0 = cam.zoom; }
  });
  cv.addEventListener('pointermove', e => {
    const pt = ptrs.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    pt.x = e.clientX; pt.y = e.clientY;
    if (ptrs.size === 1) { cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.005, -0.45, 1.0); }
    else if (ptrs.size === 2) cam.zoom = clamp(zoom0 * pinch0 / spread(), ZOOM_MIN, ZOOM_MAX);
    camTouched();
  });
  const up = e => { ptrs.delete(e.pointerId); cam.dragging = ptrs.size > 0; camTouched(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX); camTouched(); }, { passive: false });
  cv.addEventListener('dblclick', resetCam);
}
document.getElementById('reset').addEventListener('click', () => { resetItems(); renderer.domElement.focus(); });

const isTouch = matchMedia('(pointer: coarse) and (hover: none)').matches;
if (isTouch) {
  document.getElementById('touch').hidden = false;
  hint.textContent = 'Pads to move · drag to look · pinch to zoom';
  setTimeout(dismissHint, 4000);
  document.querySelectorAll('#touch .tb').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); press(k); };
    const off = () => { b.classList.remove('on'); keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  });
}

// ---------- simulation ----------
const MAX = 7, ACC = 16, DRAG = 9, TURN = 2.7, G = 28, JUMP_V = 10.5, SPIN_DUR = 0.72;
const st = { vel: 0, prevVel: 0, yaw: 0, angVel: 0, y: 0, vy: 0, grounded: true, crouch: 0, jumpBuf: 0, land: 0,
  mode: 'floor', boostAmt: 0, lift: null, rideT: 0, boardNext: null, spin: -1, spinCD: 0, phase: 0, saberA: 1.25, reach: 0, bite: 0, bitten: false, recoil: 0, idle: 3.6, still: 9, wave: -1, sy: 1, syV: 0, leanX: 0, leanZ: 0,
  glanceT: 0, glanceYaw: 0, glancePitch: 0, hYaw: 0, hPitch: 0, hRoll: 0,
  camOrbit: Math.PI * 0.8, shake: 0, dustAcc: 0, rollout: 0 };
const camPos = new V3();
let started = false;

function sparkBurst(pos, n, color) {
  for (let i = 0; i < n; i++) spawn(sparkPool, pos, tmp2.set((fx() - 0.5) * 7, fx() * 5, (fx() - 0.5) * 7),
    { life: 0.25 + fx() * 0.25, size: 0.2, grow: 0.3, grav: 16, drag: 1.5, color, alpha: 1 });
}
function nearestItem(p) {
  let best = null, bd = 2.0;
  for (const it of items) {
    if (it.state !== 'loose') continue;
    const ip = it.group.position, d = Math.hypot(ip.x - p.x, ip.z - p.z);
    if (d < bd && ip.y < st.y + 2.4) { best = it; bd = d; }
  }
  return best;
}
function biteCarrot(it) {
  it.bites++;
  it.body.scale.y = Math.max(0.05, 1 - it.bites * 0.3);
  it.group.localToWorld(tmp.set(0, 0.45 * it.body.scale.y, 0));
  for (let i = 0; i < 12; i++) spawn(dustPool, tmp, tmp2.set((fx() - 0.5) * 3, fx() * 2.5, (fx() - 0.5) * 3),
    { life: 0.5 + fx() * 0.3, size: 0.07, grow: 0.6, grav: 12, drag: 0.5, color: 0xe0701e, alpha: 1 });
  if (it.bites >= 3) { scene.attach(it.group); it.group.visible = false; it.state = 'gone'; it.respawn = 3; held = null; }
}
function updateItems(dt) {
  for (const it of items) {
    if (it.state === 'gone') { it.respawn -= dt; if (it.respawn <= 0) { it.bites = 0; it.body.scale.y = 1; placeOnTable(it); } continue; }
    if (it.state !== 'loose' || it.settled) continue;
    const g = it.group, ip = g.position;
    const floor = surfaceY(ip.x, ip.z, ip.y) + it.rest;
    it.vel.y -= G * dt;
    ip.addScaledVector(it.vel, dt);
    g.rotation.x += it.av.x * dt; g.rotation.y += it.av.y * dt; g.rotation.z += it.av.z * dt;
    if (ip.y < floor) { ip.y = floor; if (it.vel.y < -2) { it.vel.y *= -0.3; it.av.multiplyScalar(0.5); } else it.vel.y = 0; }
    if (ip.y <= floor + 0.002) {
      const k = Math.exp(-6 * dt);
      it.vel.x *= k; it.vel.z *= k; it.av.multiplyScalar(Math.exp(-8 * dt));
      // settle lying flat on its side
      const xT = Math.round(g.rotation.x / Math.PI) * Math.PI, zT = Math.round((g.rotation.z - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      g.rotation.x = damp(g.rotation.x, xT, 10, dt); g.rotation.z = damp(g.rotation.z, zT, 10, dt);
      if (it.vel.lengthSq() < 4e-4 && it.av.lengthSq() < 4e-4 && Math.abs(g.rotation.x - xT) < 0.01 && Math.abs(g.rotation.z - zT) < 0.01) {
        it.vel.set(0, 0, 0); it.av.set(0, 0, 0); it.settled = true;
      }
    }
    if (Math.abs(ip.x) > HALF_L - 2) ip.x = Math.sign(ip.x) * (HALF_L - 2);
  }
}

// blaster bolts
const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8); boltGeo.rotateX(Math.PI / 2);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const bolts = Array.from({ length: 28 }, () => {
  const m = new THREE.Mesh(boltGeo, boltMat); m.visible = false; m.add(glow(0xff4020, 0.6, 0.7)); scene.add(m);
  return { m, vel: new V3(), life: 0 };
});
let boltI = 0;
const AXIS_Z = new V3(0, 0, 1), tq = new THREE.Quaternion();
function fireBolt(gun) {
  const b = bolts[boltI = (boltI + 1) % bolts.length];
  gun.muzzle.getWorldPosition(b.m.position);
  gun.muzzle.getWorldQuaternion(tq);
  tmp.set(0, 0, -1).applyQuaternion(tq);
  b.vel.copy(tmp).multiplyScalar(30);
  b.m.quaternion.setFromUnitVectors(AXIS_Z, tmp);
  b.m.visible = true; b.life = 1.1;
  st.recoil = 1;
  for (let i = 0; i < 5; i++) spawn(sparkPool, b.m.position, tmp2.set(tmp.x * 3 + (fx() - 0.5) * 2, tmp.y * 3 + fx(), tmp.z * 3 + (fx() - 0.5) * 2),
    { life: 0.15, size: 0.28, grow: 0.3, color: 0xffb080, alpha: 1 });
}
function updateBolts(dt) {
  for (const b of bolts) {
    if (!b.m.visible) continue;
    b.life -= dt;
    const bp = b.m.position;
    bp.addScaledVector(b.vel, dt);
    let dead = b.life <= 0;
    if (bp.y < 0.05) { dead = true; sparkBurst(bp, 6, 0xffa060); }
    if (dead) b.m.visible = false;
  }
}

const promptEl = document.getElementById('prompt');
let promptText = '';
function updatePrompt(p, override, hintOnly) {
  const lift = override === undefined ? nearLift(p) : null, near = override === undefined && !lift ? nearestItem(p) : null;
  const txt = override !== undefined ? override : lift ? `Ride lift ${lift.k + 1} up to the hub` : near ? `${held ? 'Swap for' : 'Pick up'} the ${near.name}` : '';
  if (txt === promptText) return;
  promptText = txt;
  if (txt) promptEl.innerHTML = hintOnly ? txt : `<span class="cap">${isTouch ? 'GRAB' : 'G'}</span> ${txt}`;
  promptEl.classList.toggle('gone', !txt);
}

function startSpin() {
  st.spin = 0;
  if (!st.grounded) st.vy = Math.max(st.vy, 4);
}

function update(dt, t) {
  if (st.boardNext) { boardLift(st.boardNext); st.boardNext = null; }
  if (st.mode === 'ship') {   // flying: see apps/client/src/app/flight.ts
    ships.update(dt, t);
    if (ships.inStation) { for (const f of spinners) f(dt, t); sky.rotation.x = -OMEGA * t; syncLights(); }
    for (const k in pressed) pressed[k] = false;
    return;
  }
  if (st.mode !== 'floor') { updateReal(dt, t); for (const k in pressed) pressed[k] = false; return; }
  // a new robot drives itself out of the Bot Maker before it's handed over
  const rolling = st.rollout > 0;
  if (rolling) {
    st.rollout = bot.root.position.x >= BOT_MAKER.spawn.rollToX ? 0 : st.rollout - dt;
    for (const k in pressed) pressed[k] = false;
  }
  const fwd = rolling ? 1 : (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  const turn = rolling ? 0 : (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const spinning = st.spin >= 0;
  if (pressed.reset) resetItems();

  // drive
  const air = !st.grounded;
  // Shift: hold for 5x top speed; easing back down when it is let go
  const boost = keys.boost && !rolling ? 5 : 1;
  st.boostAmt = damp(st.boostAmt, boost > 1 && fwd ? 1 : 0, 4, dt);
  if (fwd) st.vel += fwd * ACC * boost * (air ? 0.5 : 1) * dt;
  else st.vel -= Math.sign(st.vel) * Math.min(Math.abs(st.vel), DRAG * (air ? 0.3 : 1) * dt);
  const vTop = MAX * boost * (spinning ? 1.2 : 1), vBack = MAX * 0.55 * boost;
  if (st.vel > vTop) st.vel = boost > 1 ? vTop : Math.max(vTop, damp(st.vel, vTop, 4, dt) - ACC * dt);
  if (st.vel < -vBack) st.vel = boost > 1 ? -vBack : Math.min(-vBack, damp(st.vel, -vBack, 4, dt) + ACC * dt);
  st.angVel = damp(st.angVel, turn * TURN * (spinning ? 1.3 : 1), 10, dt);
  st.yaw += st.angVel * dt;
  const p = bot.root.position;
  p.x += Math.sin(st.yaw) * st.vel * dt;
  p.z += Math.cos(st.yaw) * st.vel * dt;
  if (Math.abs(p.x) > HALF_L - 3) { p.x = Math.sign(p.x) * (HALF_L - 3); st.vel *= 0.6; }
  // keep z on one lap of the ring so numbers stay small; the camera rides along
  if (p.z > CIRC / 2) { p.z -= CIRC; camPos.z -= CIRC; } else if (p.z < -CIRC / 2) { p.z += CIRC; camPos.z += CIRC; }
  collideWorld(p, 0.95);
  { // the weapon table is solid
    const tx = clamp(p.x, TABLE.x - TABLE.w / 2, TABLE.x + TABLE.w / 2), tz = clamp(p.z, TABLE.z - TABLE.d / 2, TABLE.z + TABLE.d / 2);
    const dx = p.x - tx, dz = p.z - tz, d = Math.hypot(dx, dz);
    if (d < 0.95 && d > 1e-4 && st.y < TABLE.top) { p.x += dx / d * (0.95 - d); p.z += dz / d * (0.95 - d); st.vel *= 0.85; }
  }
  bot.root.rotation.y = st.yaw;
  const accel = (st.vel - st.prevVel) / Math.max(dt, 1e-4);
  st.prevVel = st.vel;

  // jump
  if (pressed.jump) st.jumpBuf = 0.15;
  st.jumpBuf -= dt;
  if (st.jumpBuf > 0 && st.grounded && st.crouch <= 0) { st.crouch = 0.09; st.jumpBuf = 0; }
  if (st.crouch > 0) {
    st.crouch -= dt;
    if (st.crouch <= 0) { st.vy = JUMP_V; st.grounded = false; st.syV += 7; dustBurst(p.x, p.z, 8, 1.6); }
  }
  if (!st.grounded) {
    st.vy -= G * (spinning && st.vy < 0 ? 0.35 : 1) * dt;
    st.y += st.vy * dt;
    if (st.y <= 0) {
      const impact = -st.vy;
      st.y = 0; st.vy = 0; st.grounded = true; st.land = 0.28;
      st.syV -= impact * 0.45;
      dustBurst(p.x, p.z, 10 + impact | 0, 1.2 + impact * 0.18);
      if (!reduceMotion) st.shake += impact * 0.012;
    }
  }
  st.land = Math.max(0, st.land - dt);
  p.y = st.y;

  // spin attack
  st.spinCD -= dt;
  if (pressed.spin && !spinning && st.spinCD <= 0) startSpin();
  let spinAmt = 0;
  if (st.spin >= 0) {
    st.spin += dt;
    const q = Math.min(st.spin / SPIN_DUR, 1);
    bot.spinner.rotation.y = q * q * (3 - 2 * q) * TAU * 3;
    spinAmt = Math.sin(q * Math.PI);
    // sparks off the fists
    for (const A of bot.arms) {
      A.wrist.getWorldPosition(tmp);
      if (fx() < spinAmt) spawn(sparkPool, tmp, tmp2.set((fx() - 0.5) * 2, fx() * 2.5, (fx() - 0.5) * 2),
        { life: 0.3 + fx() * 0.25, size: 0.16, grow: 0.2, grav: 9, drag: 2, color: 0xff9a4a, alpha: 0.9 });
    }
    // a blaster sprays bolts all the way round
    if (held && held.kind === 'gun' && held.cd <= 0 && q > 0.1 && q < 0.92) { fireBolt(held); held.cd = 0.05; }
    if (q >= 1) { st.spin = -1; bot.spinner.rotation.y = 0; st.spinCD = 0.22; }
  }
  bot.swooshMat.opacity = spinAmt;
  const trailSaber = held && held.kind === 'saber' ? held : null;
  bot.saberTrailMat.opacity = trailSaber ? spinAmt * trailSaber.lit : 0;
  if (trailSaber) bot.saberTrailMat.color.set(trailSaber.color);
  bot.swoosh.rotation.z = Math.sin(t * 9) * 0.06;

  // idle / wave
  const moving = Math.abs(st.vel) > 0.3 || Math.abs(st.angVel) > 0.3 || !st.grounded || st.spin >= 0 || st.crouch > 0;
  if (moving) { st.idle = 0; st.still = 0; st.wave = -1; } else { st.idle += dt; st.still += dt; }
  if (st.wave < 0 && st.idle > 3.4) st.wave = 0;
  if (st.wave >= 0) { st.wave += dt; if (st.wave > 2.5) { st.wave = -1; st.idle = -1.5 - fx() * 3; } }

  // ---- pose targets ----
  const sn = Math.min(Math.abs(st.vel) / MAX, 1), dirS = Math.sign(st.vel);
  const tn = clamp(st.angVel / TURN, -1, 1);
  st.phase += st.vel * dt * 1.5;
  const isSpin = st.spin >= 0;
  for (const A of bot.arms) {
    const s = A.s;
    let ab = 0.36 + 0.035 * Math.sin(t * 1.7 + s), sw = 0.06 * Math.sin(t * 1.3 + s * 1.1), el = 0.45 + 0.05 * Math.sin(t * 1.7), ez = 0, wr = 0.1, wz = 0, curl = 0.3;
    // rolling: pump the arms opposite each other
    sw += s * Math.sin(st.phase) * 0.85 * sn + 0.25 * sn * dirS;
    el += 0.4 * sn + 0.3 * sn * Math.max(0, -s * Math.sin(st.phase));
    ab += 0.1 * sn;
    curl += 0.3 * sn;
    // turning: outside arm flares for balance, inside arm tucks
    const outer = Math.max(0, -s * tn), inner = Math.max(0, s * tn);
    ab += outer * 0.75; el += outer * 0.15; wz += outer * 0.3;
    sw += inner * 0.25; ab -= inner * 0.12;
    if (st.crouch > 0) { ab = 0.6; sw = 0.75; el = 1.0; curl = 0.6; }
    else if (!st.grounded) {
      if (st.vy > 1) { ab = 2.45 + 0.08 * Math.sin(t * 10 + s); sw = -0.25; el = 0.25; curl = 0; wr = -0.3; }
      else { ab = 1.45 + 0.35 * Math.sin(t * 17 + s * 1.7); sw = 0.18 * Math.sin(t * 13 + s); el = 0.5; curl = 0.1; }
    }
    if (st.land > 0) { const k = st.land / 0.28; ab = lerp(ab, 1.15, k); el = lerp(el, 0.95, k); sw = lerp(sw, -0.2, k); }
    if (st.wave >= 0 && s === -1) {
      const w = st.wave, env = smooth(0, 0.35, w) * (1 - smooth(2.1, 2.5, w));
      ab = lerp(ab, 2.2, env); sw = lerp(sw, -0.3, env); el = lerp(el, 0.2, env);
      ez = env * s * (0.7 + 0.45 * Math.sin(w * 13)); curl = lerp(curl, 0, env); wz = env * 0.25 * Math.sin(w * 13 - 0.6);
    }
    if (isSpin) { ab = 1.55; sw = 0.05; el = 0.06; ez = 0; curl = 0.95; wr = 0; wz = 0; }
    if (s === 1) {
      if (held && held.kind === 'gun' && !isSpin && st.grounded && st.crouch <= 0) { ab = 0.22; sw = -0.75 + 0.08 * Math.sin(st.phase) * sn + st.recoil * 0.35; el = 0.5 + st.recoil * 0.5; wr = 0; }
      if (st.reach > 0) { const k = Math.sin(st.reach / 0.35 * Math.PI); ab = lerp(ab, 0.3, k); sw = lerp(sw, -1.0, k); el = lerp(el, 0.1, k); curl = lerp(curl, 0, k); }
      if (st.bite > 0 && !isSpin) { const k = Math.sin(Math.min(st.bite / 0.5, 1) * Math.PI); ab = lerp(ab, 0.45, k); sw = lerp(sw, -1.45, k); el = lerp(el, 1.75, k); }
      if (held) curl = Math.max(curl, 0.8);  // keep a grip on whatever it's holding
    }

    const r = isSpin ? 30 : (!st.grounded || st.crouch > 0 || st.land > 0 ? 16 : 10), c = A.cur;
    c.ab = damp(c.ab, ab, r, dt); c.sw = damp(c.sw, sw, r, dt); c.el = damp(c.el, el, r, dt); c.ez = damp(c.ez, ez, r, dt);
    c.wr = damp(c.wr, wr, r, dt); c.wz = damp(c.wz, wz, r, dt); c.curl = damp(c.curl, curl, r, dt);
    A.shoulder.rotation.set(c.sw, 0, s * c.ab);
    A.elbow.rotation.set(-c.el, 0, c.ez);
    A.wrist.rotation.set(c.wr, 0, s * c.wz);
    for (const f of A.fingers) { f.root.rotation.set(-c.curl * 1.1, 0, f.spread * (1 - c.curl)); f.joint.rotation.x = -c.curl * 1.4; }
    A.thumb.rotation.set(-c.curl * 0.9, 0, s * (0.5 - c.curl * 0.35));
  }

  // held item: G picks up / swaps / drops, F uses it (ignite, fire, bite)
  st.reach = Math.max(0, st.reach - dt);
  st.recoil = damp(st.recoil, 0, 12, dt);
  if (pressed.grab && nearLift(p)) st.boardNext = nearLift(p);
  else if (pressed.grab) {
    const near = nearestItem(p);
    if (near) { dropHeld(); hold(near); st.reach = 0.35; }
    else dropHeld();
  }
  if (held) {
    if (held.kind === 'saber' && pressed.use) held.target = held.target ? 0 : 1;
    if (held.kind === 'gun') { held.cd -= dt; if (keys.use && held.cd <= 0 && !isSpin) { fireBolt(held); held.cd = 0.16; } }
    if (held && held.kind === 'carrot') {
      if (pressed.use && st.bite <= 0) { st.bite = 0.5; st.bitten = false; }
      if (st.bite > 0) { st.bite -= dt; if (!st.bitten && st.bite < 0.25) { st.bitten = true; biteCarrot(held); } }
    }
  } else st.bite = 0;
  const hum = 1 + 0.06 * Math.sin(t * 57) + 0.04 * Math.sin(t * 23);
  for (const it of items) {
    if (it.kind !== 'saber') continue;
    it.lit = damp(it.lit, it.target, it.target ? 9 : 12, dt);
    it.blade.scale.y = Math.max(0.001, it.lit);
    it.blade.visible = it.lit > 0.01;
    for (const g of it.glow) g.m.opacity = g.op * hum * (1 + (it === held ? spinAmt * 0.4 : 0));
    it.light.intensity = 1.6 * it.lit * hum;
  }
  // grip angle: forward-up at rest, raised on the jump, extended like a sword arm in the spin; a blaster stays level
  const c0 = bot.arms[0] ? bot.arms[0].cur : { sw: 0, el: 0.45, wr: 0 }, gunAim = held && held.kind === 'gun' && !isSpin;
  let sa = 1.25 - 0.3 * sn;
  if (!st.grounded && st.vy > 1) sa = Math.PI;
  if (isSpin) sa = Math.PI;
  if (held && held.kind === 'carrot' && st.bite > 0) sa = 0.4;
  if (gunAim) sa = Math.PI - (c0.sw - c0.el + c0.wr);
  st.saberA = gunAim ? sa : damp(st.saberA, sa, isSpin ? 30 : 10, dt);
  bot.grip.rotation.x = st.saberA;
  updateItems(dt);
  updateBolts(dt);
  updatePrompt(p);

  // body lean, tilt, squash
  let leanX = st.vel / MAX * 0.13 + clamp(accel * 0.012, -0.12, 0.12);
  let leanZ = -tn * (0.08 + 0.2 * sn);
  if (isSpin) { leanX = Math.sin(st.spin * 31) * 0.05; leanZ = Math.cos(st.spin * 31) * 0.05; }
  if (!st.grounded) leanX += clamp(-st.vy * 0.008, -0.1, 0.1);
  st.leanX = damp(st.leanX, leanX, 8, dt); st.leanZ = damp(st.leanZ, leanZ, 8, dt);
  bot.lean.rotation.set(st.leanX, 0, st.leanZ);
  let syT = 1;
  if (st.crouch > 0) syT = 0.8;
  else if (!st.grounded && st.vy > 0) syT = 1 + Math.min(st.vy * 0.012, 0.12);
  st.syV += ((syT - st.sy) * 220 - st.syV * 15) * dt;
  st.sy = clamp(st.sy + st.syV * dt, 0.62, 1.3);
  const sx = 1 / Math.sqrt(st.sy);
  bot.squash.scale.set(sx, st.sy, sx);

  // rolling drive ball
  if (st.grounded) bot.drive.rotation.x += st.vel * dt / 0.95;

  // head: leads turns, glances around while idle, tilts while waving
  if (!moving && st.wave < 0) {
    st.glanceT -= dt;
    if (st.glanceT < 0) { st.glanceYaw = (fx() - 0.5) * 1.0; st.glancePitch = (fx() - 0.5) * 0.3; st.glanceT = 1.4 + fx() * 2.4; }
  } else { st.glanceYaw = 0; st.glancePitch = 0; }
  const waving = st.wave >= 0 ? smooth(0, 0.35, st.wave) * (1 - smooth(2.1, 2.5, st.wave)) : 0;
  st.hYaw = damp(st.hYaw, tn * 0.5 + st.glanceYaw - waving * 0.15, 7, dt);
  st.hPitch = damp(st.hPitch, -st.leanX * 0.9 + st.glancePitch + (st.grounded ? 0 : clamp(st.vy * 0.015, -0.15, 0.15)), 7, dt);
  st.hRoll = damp(st.hRoll, -st.leanZ * 0.7 + waving * 0.16 * Math.sin(st.wave * 3), 7, dt);
  bot.head.rotation.set(st.hPitch, st.hYaw, st.hRoll, 'YXZ');
  bot.head.position.y = 0.1 + 0.015 * Math.sin(t * 2.3) + 0.035 * sn * Math.abs(Math.sin(st.phase));


  // eye + chest LED
  const eyeI = 0.9 + 0.2 * Math.sin(t * 3.1) + spinAmt * 1.8;
  M.lens.emissiveIntensity = eyeI;
  if (bot.eyeGlow) {   // (robots built without a head have no eye)
    bot.eyeGlow.material.opacity = 0.4 + 0.12 * Math.sin(t * 3.1) + spinAmt * 0.5;
    bot.eyeGlow.scale.setScalar(0.75 + spinAmt * 0.5);
    bot.eyeCore.position.x = st.glanceYaw * 0.05;
    bot.eyeHot.position.x = st.glanceYaw * 0.05;
  }
  if (bot.eyeLight) bot.eyeLight.intensity = 1 + spinAmt * 2.5;
  const blink = (t % 1.4) < 0.9 ? 1 : 0.25;
  M.led.emissiveIntensity = 2.4 * blink; if (bot.ledGlow) bot.ledGlow.material.opacity = 0.9 * blink;

  // rolling dust
  if (st.grounded && sn > 0.45) {
    st.dustAcc += dt * sn * 18 * (1 + st.boostAmt * 2);
    while (st.dustAcc > 1) {
      st.dustAcc--;
      const bx = p.x - Math.sin(st.yaw) * 0.5 * dirS, bz = p.z - Math.cos(st.yaw) * 0.5 * dirS;
      spawn(dustPool, tmp.set(bx + (fx() - 0.5) * 0.6, 0.12, bz + (fx() - 0.5) * 0.6),
        tmp2.set(-Math.sin(st.yaw) * dirS * 0.8 + (fx() - 0.5), 0.5 + fx() * 0.6, -Math.cos(st.yaw) * dirS * 0.8 + (fx() - 0.5)),
        { life: 0.5 + fx() * 0.4, size: 0.35, grow: 2.2, drag: 2.5, color: 0xc7b9a6, alpha: 0.4 });
    }
  }

  updatePool(dustPool, dt); updatePool(sparkPool, dt);

  // camera: chase from behind, drift round to the front when idle, plus the viewer's own orbit and zoom
  if (keys.camL || keys.camR) { cam.yaw += ((keys.camL ? 1 : 0) - (keys.camR ? 1 : 0)) * 2.2 * dt; camTouched(); }
  if (keys.zoomIn || keys.zoomOut) { cam.zoom = clamp(cam.zoom * Math.exp(((keys.zoomOut ? 1 : 0) - (keys.zoomIn ? 1 : 0)) * 1.4 * dt), ZOOM_MIN, ZOOM_MAX); camTouched(); }
  if (pressed.camReset) resetCam();
  const camIdle = performance.now() / 1000 - cam.lastInput, camBusy = cam.dragging || camIdle < 0.25;
  // once the viewer lets go, swing back behind the bot while it drives (or after a long idle)
  if (!cam.dragging && ((moving && camIdle > 2) || camIdle > 6)) {
    cam.yaw = damp(cam.yaw, Math.round(cam.yaw / TAU) * TAU, 1.6, dt);
    cam.pitch = damp(cam.pitch, 0, 1.6, dt);
  }
  const orbitT = st.still > 1.8 && camIdle > 6 ? Math.PI * 0.8 : 0;
  st.camOrbit = damp(st.camOrbit, orbitT, orbitT ? 0.9 : 3.2, dt);
  const f = st.camOrbit / (Math.PI * 0.8), a = st.yaw + st.camOrbit + cam.yaw;
  let d = lerp(8, 6.2, f), h = lerp(3.5, 2.2, f);
  if (camera.aspect < 0.8) { d *= 1.5; h *= 1.25; }
  const D = Math.hypot(d, h - 1.4) * cam.zoom;
  const elev = clamp(Math.atan2(h - 1.4, d) + cam.pitch, 0.03, 1.4);
  tmp.set(p.x - Math.sin(a) * D * Math.cos(elev), Math.max(0.35, 1.4 + st.y * 0.4 + D * Math.sin(elev)), p.z - Math.cos(a) * D * Math.cos(elev));
  if (rolling) { const c = BOT_MAKER.spawn.camera; tmp.set(c.x, c.y, c.z); }   // watching it roll out from the walkway
  if (!started) { camPos.copy(tmp); started = true; } else camPos.lerp(tmp, 1 - Math.exp(-(camBusy ? 14 : 5) * dt));
  // the camera works on the flat strip too, then gets bent onto the ring with "up" pointing at the axis
  tmp.copy(camPos);
  st.shake = Math.max(0, st.shake - dt * 1.6);
  if (st.shake > 0) tmp.add(tmp2.set(fx() - 0.5, fx() - 0.5, fx() - 0.5).multiplyScalar(st.shake));
  bendPoint(tmp, camera.position);
  bendUp(tmp.z, camera.up);
  camera.lookAt(bendPoint(tmp2.set(p.x, 1.4 + st.y * 0.6, p.z), tmp3));
  const fov = 50 + 14 * st.boostAmt;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  axisLight.position.set(p.x, 0, 0);

  // blob shadows
  bot.blob.position.set(p.x, 0.04, p.z);
  bot.blob.scale.setScalar(2.6 * (1 - Math.min(st.y / 14, 0.6)));
  bot.blob.material.opacity = 1 - Math.min(st.y / 10, 0.7);
  for (const f of spinners) f(dt, t);
  sky.rotation.x = -OMEGA * t;
  syncLights();
  updateWhere(p);

  for (const k in pressed) pressed[k] = false;
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  update(dt, clock.elapsedTime);
  for (const f of legacy.frameHooks) f(dt);
  renderer.render(ships.scene || scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// redraw crate labels once the display font arrives
document.fonts?.ready.then(() => { crateMats.forEach((m, i) => { m.map = crateTex([101, 202, 303][i], ['#b8642c', '#5d6a72', '#cbc1b0'][i], ['R-7', 'BOLTS', 'SPARE'][i]); m.needsUpdate = true; }); signJobs.forEach(f => f()); });
// ---- lifts: stations on the floor (bent), tubes + hub + cab in real space ----
for (const L of LIFTS) {
  const g = new THREE.Group(); g.position.set(0, 0, L.z); scene.add(g);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.5, 0.3, 40), W.stone); base.position.y = 0.15; g.add(base);
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 5, 40, 1, true), W.greenhouse); walls.position.y = 2.8; g.add(walls);
  for (const y of [0.35, 5.3]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.16, 6, 48), W.steel); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.5, 40), M.orange); roof.position.y = 5.6; g.add(roof);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.1, 1.4, 32), W.steel); collar.position.y = 6.5; g.add(collar);
  const signMat = makeSign(256, 64, `LIFT ${L.k + 1}`, 'TO THE HUB · 0 G', 0x2f3a40, 0xd0702c, 34);
  for (const side of [1, -1]) {
    for (const dx of [-1.1, 1.1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.9, 0.22), W.steel); post.position.set(dx, 2.75, side * 3.45); g.add(post); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.3), W.glowWarm); lintel.position.set(0, 4.3, side * 3.45); g.add(lintel);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), signMat); sg.position.set(0, 4.85, side * 3.56); sg.rotation.y = side > 0 ? 0 : Math.PI; g.add(sg);
  }
  colliders.push({ x: 0, z: L.z, r: 3.7 });
}
const liftWorld = new THREE.Group(); liftWorld.userData.noBend = true; scene.add(liftWorld);
const realGroup = new THREE.Group(); realGroup.position.y = REAL_OFF; scene.add(realGroup);
const tubeGlass = new THREE.MeshStandardMaterial({ color: 0xcfe6ef, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
const steelR = new THREE.MeshStandardMaterial({ color: 0x8a847e, roughness: 0.45, metalness: 0.7 });
const stripR = new THREE.MeshBasicMaterial({ color: 0xffd28a });
{
  const r0 = R_IN - 7.2, r1 = HUB_R, len = r0 - r1, mid = (r0 + r1) / 2;
  const ringGeo = new THREE.TorusGeometry(2.75, 0.18, 6, 28).rotateX(Math.PI / 2);
  for (const L of LIFTS) {
    const t = new THREE.Group(); t.quaternion.setFromUnitVectors(Y_AXIS, L.u); t.position.copy(L.u).multiplyScalar(mid); liftWorld.add(t);
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, len, 28, 1, true), tubeGlass));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, len, 0.28), steelR); rail.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75); t.add(rail); }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, len, 0.12), stripR); strip.position.set(Math.cos(1) * 2.8, 0, Math.sin(1) * 2.8); t.add(strip);
    const n = Math.floor(len / 14), rings = new THREE.InstancedMesh(ringGeo, steelR, n);
    for (let i = 0; i < n; i++) { _dummy.position.set(0, -len / 2 + (i + 0.5) * len / n, 0); _dummy.rotation.set(0, 0, 0); _dummy.scale.setScalar(1); _dummy.updateMatrix(); rings.setMatrixAt(i, _dummy.matrix); }
    t.add(rings);
  }
  // the hub: a glass drum around the axis where the four tubes meet
  const hub = new THREE.Group(); liftWorld.add(hub);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_L, 56, 1, true).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd6ecf2, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }));
  hub.add(drum);
  for (const x of [-20, -10, 0, 10, 20]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(HUB_R, 0.45, 8, 72).rotateY(Math.PI / 2), steelR); ring.position.x = x; hub.add(ring); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; const st8 = new THREE.Mesh(new THREE.BoxGeometry(HUB_L, 0.3, 0.3), steelR); st8.position.set(0, Math.cos(a) * HUB_R, Math.sin(a) * HUB_R); hub.add(st8); }
  for (const s of [-1, 1]) {
    const capG = new THREE.Mesh(new THREE.RingGeometry(3.2, HUB_R, 56).rotateY(Math.PI / 2), tubeGlass); capG.position.x = s * HUB_L / 2; hub.add(capG);
    const capHub = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 32).rotateZ(Math.PI / 2), steelR); capHub.position.x = s * HUB_L / 2; hub.add(capHub);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.2, 6, 40).rotateY(Math.PI / 2), stripR); glowRing.position.x = s * (HUB_L / 2 - 0.7); hub.add(glowRing);
  }
  for (const L of LIFTS) {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.4, 8, 32), M.orange); mouth.quaternion.setFromUnitVectors(new V3(0, 0, 1), L.u); mouth.position.copy(L.u).multiplyScalar(HUB_R - 0.2); hub.add(mouth);
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 32), stripR); lamp.quaternion.copy(mouth.quaternion); lamp.position.copy(L.u).multiplyScalar(HUB_R - 0.8); hub.add(lamp);
  }
  const hubLight = new THREE.PointLight(0xfff0dc, 0.9, 60, 1.2); hub.add(hubLight);
}
// the elevator car that carries the bot
const cab = new THREE.Group(); cab.visible = false; liftWorld.add(cab);
{
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 28), steelR); floor.position.y = -0.12; cab.add(floor);
  const glowF = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.08, 6, 32).rotateX(Math.PI / 2), stripR); cab.add(glowF);
  const roofR = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.14, 6, 32).rotateX(Math.PI / 2), steelR); roofR.position.y = 4.3; cab.add(roofR);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.3, 0.16), steelR); post.position.set(Math.cos(a) * 2.3, 2.15, Math.sin(a) * 2.3); cab.add(post); }
}
// a few things drifting in the hub (real space via the offset group, so they share the bent materials)
{
  const R = mulberry(202), drifters = [];
  const add = (mesh) => { realGroup.add(mesh); drifters.push({ m: mesh, v: new V3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.6), w: new V3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.5) }); mesh.position.set((R() - 0.5) * 24, (R() - 0.5) * 16, (R() - 0.5) * 16); };
  for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crateMats[i % 3]));
  for (let i = 0; i < 6; i++) { const c = new THREE.Group(); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 10), M.carrot); c.add(cone); const lf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), M.leaf); lf.position.y = -0.4; lf.rotation.x = Math.PI; c.add(lf); c.scale.setScalar(1.6); add(c); }
  spinners.push(dt => {
    for (const d of drifters) {
      const P = d.m.position; P.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      const rho = Math.hypot(P.y, P.z), lim = HUB_R - 1.5;
      if (rho > lim) { const ny = P.y / rho, nz = P.z / rho; P.y = ny * lim; P.z = nz * lim; const vn = d.v.y * ny + d.v.z * nz; d.v.y -= 2 * vn * ny; d.v.z -= 2 * vn * nz; }
      if (Math.abs(P.x) > HUB_L / 2 - 1.5) { P.x = Math.sign(P.x) * (HUB_L / 2 - 1.5); d.v.x *= -1; }
    }
  });
}

// ---- riding the lifts and floating in the hub ----
const fl = { V: new V3(), startPos: new V3(), startQ: new THREE.Quaternion(), cam: new V3() };
const qYaw = new THREE.Quaternion(), qTmp = new THREE.Quaternion();
function boardLift(L) {
  st.mode = 'up'; st.lift = L; st.rideT = 0;
  st.vel = 0; st.angVel = 0; st.y = 0; st.vy = 0; st.grounded = true; st.spin = -1; bot.spinner.rotation.y = 0;
  realGroup.add(bot.root);
  bot.root.quaternion.copy(L.q).multiply(qYaw.setFromAxisAngle(Y_AXIS, st.yaw));
  bot.root.position.copy(L.u).multiplyScalar(R_IN);
  bot.blob.visible = false; cab.visible = true;
  fl.cam.copy(camera.position);
}
function landLift(L) {
  st.mode = 'floor';
  scene.add(bot.root);
  bot.root.quaternion.identity();
  bot.root.position.set(Math.sin(st.yaw) * 4.9, 0, L.z + Math.cos(st.yaw) * 4.9);
  st.y = 0; st.vy = 0; st.grounded = true; st.still = 0; st.idle = 0;
  bot.blob.visible = true; cab.visible = false;
  unbend(camera.position, camPos); camPos.z = L.z + wrapD(camPos.z - L.z);
}
function updateReal(dt, t) {
  const L = st.lift, R0 = bot.root, P = R0.position;
  const fwd = (keys.up ? 1 : 0) - (keys.down ? 1 : 0), turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  let g = 0, prompt = '', where = '';
  if (st.mode === 'up' || st.mode === 'down') {
    st.rideT += dt;
    if (st.mode === 'down' && st.rideT < 0.8) {   // line up with the tube before dropping
      const k = smooth(0, 0.8, st.rideT);
      P.lerpVectors(fl.startPos, tmp.copy(L.u).multiplyScalar(HUB_R - 1.5), k);
      R0.quaternion.slerpQuaternions(fl.startQ, qTmp.copy(L.q).multiply(qYaw.setFromAxisAngle(Y_AXIS, st.yaw)), k);
    } else {
      const s = Math.min((st.mode === 'up' ? st.rideT : st.rideT - 0.8) / RIDE, 1), e = smooth(0, 1, s);
      const r = st.mode === 'up' ? lerp(R_IN, HUB_R - 1.5, e) : lerp(HUB_R - 1.5, R_IN, e);
      P.copy(L.u).multiplyScalar(r);
      g = r / R_IN;
      where = `Lift ${L.k + 1} · ${Math.round((r - HUB_R) / FT)} ft to the hub · ${g.toFixed(2)} g`;
      if (s >= 1) {
        if (st.mode === 'up') { st.mode = 'hub'; fl.V.copy(L.u).multiplyScalar(-1.2); }
        else { landLift(L); updatePrompt(bot.root.position); return; }
      }
    }
    cab.position.copy(P); cab.quaternion.copy(L.q);
  } else {
    // zero g: thrust along the bot's own axes, drift, bounce off the drum
    const q = R0.quaternion;
    if (turn) { q.multiply(qYaw.setFromAxisAngle(Y_AXIS, turn * 1.8 * dt)); st.yaw += turn * 1.8 * dt; }
    const boost = keys.boost ? 5 : 1;
    fl.V.addScaledVector(tmp.set(0, 0, 1).applyQuaternion(q), fwd * 5 * boost * dt);
    if (keys.jump) fl.V.addScaledVector(tmp.set(0, 1, 0).applyQuaternion(q), 5 * boost * dt);
    fl.V.multiplyScalar(Math.exp(-0.35 * dt));
    if (fl.V.length() > 9 * boost) fl.V.setLength(Math.max(9 * boost, fl.V.length() * Math.exp(-3 * dt)));
    P.addScaledVector(fl.V, dt);
    const rho = Math.hypot(P.y, P.z), lim = HUB_R - 2.4;
    if (rho > lim) {
      const ny = P.y / rho, nz = P.z / rho, vn = fl.V.y * ny + fl.V.z * nz;
      P.y = ny * lim; P.z = nz * lim;
      if (vn > 0) { fl.V.y -= 1.6 * vn * ny; fl.V.z -= 1.6 * vn * nz; }
    }
    if (Math.abs(P.x) > HUB_L / 2 - 2.4) { P.x = Math.sign(P.x) * (HUB_L / 2 - 2.4); fl.V.x *= -0.6; }
    let best = null, bd = 5.5;
    for (const M2 of LIFTS) { const d = P.distanceTo(tmp.copy(M2.u).multiplyScalar(HUB_R - 1.5)); if (d < bd) { bd = d; best = M2; } }
    if (best) prompt = `Ride lift ${best.k + 1} down to the floor`;
    const ship = ships.nearestCradle(P);
    if (ship && (!best || ship.dist < bd)) {
      if (pressed.grab) { st.mode = 'ship'; bot.root.visible = false; cab.visible = false; ships.board(ship.cradle); return; }
      prompt = 'Board the ship and fly out the airlock'; best = null;
    }
    where = 'Hub · zero g · floating';
    if (best && pressed.grab) {
      st.mode = 'down'; st.lift = best; st.rideT = 0;
      fl.startPos.copy(P); fl.startQ.copy(R0.quaternion); fl.V.set(0, 0, 0);
      cab.visible = true;
    }
  }

  // spin attack still works up here
  st.spinCD -= dt;
  if (pressed.spin && st.spin < 0 && st.spinCD <= 0) st.spin = 0;
  let spinAmt = 0;
  if (st.spin >= 0) {
    st.spin += dt;
    const q = Math.min(st.spin / SPIN_DUR, 1);
    bot.spinner.rotation.y = q * q * (3 - 2 * q) * TAU * 3; spinAmt = Math.sin(q * Math.PI);
    for (const A of bot.arms) { A.wrist.getWorldPosition(tmp); if (fx() < spinAmt) spawn(sparkPool, tmp, tmp2.set((fx() - 0.5) * 2, (fx() - 0.5) * 2, (fx() - 0.5) * 2), { life: 0.4, size: 0.16, grow: 0.2, drag: 2, color: 0xff9a4a, alpha: 0.9 }); }
    if (q >= 1) { st.spin = -1; bot.spinner.rotation.y = 0; st.spinCD = 0.22; }
  }
  bot.swooshMat.opacity = spinAmt;
  const trailSaber = held && held.kind === 'saber' ? held : null;
  bot.saberTrailMat.opacity = trailSaber ? spinAmt * trailSaber.lit : 0;

  // arms drift up and out as gravity fades
  const isSpin = st.spin >= 0, float = 1 - g;
  for (const A of bot.arms) {
    const s = A.s, c = A.cur;
    let ab = lerp(0.36, 1.25 + 0.25 * Math.sin(t * 2.2 + s), float), sw = lerp(0.05, 0.35 * Math.sin(t * 1.6 + s * 1.3), float);
    let el = lerp(0.45, 0.7 + 0.2 * Math.sin(t * 1.9 + s), float), curl = 0.25;
    if (isSpin) { ab = 1.55; sw = 0.05; el = 0.06; curl = 0.95; }
    if (s === 1 && held) curl = Math.max(curl, 0.8);
    const r = isSpin ? 30 : 6;
    c.ab = damp(c.ab, ab, r, dt); c.sw = damp(c.sw, sw, r, dt); c.el = damp(c.el, el, r, dt); c.ez = damp(c.ez, 0, r, dt);
    c.wr = damp(c.wr, 0.1, r, dt); c.wz = damp(c.wz, 0, r, dt); c.curl = damp(c.curl, curl, r, dt);
    A.shoulder.rotation.set(c.sw, 0, s * c.ab);
    A.elbow.rotation.set(-c.el, 0, c.ez);
    A.wrist.rotation.set(c.wr, 0, s * c.wz);
    for (const f of A.fingers) { f.root.rotation.set(-c.curl * 1.1, 0, f.spread * (1 - c.curl)); f.joint.rotation.x = -c.curl * 1.4; }
    A.thumb.rotation.set(-c.curl * 0.9, 0, s * (0.5 - c.curl * 0.35));
  }
  st.leanX = damp(st.leanX, 0, 6, dt); st.leanZ = damp(st.leanZ, 0, 6, dt); bot.lean.rotation.set(st.leanX, 0, st.leanZ);
  st.sy = damp(st.sy, 1, 8, dt); st.syV = 0; bot.squash.scale.set(1, 1, 1);
  st.hYaw = damp(st.hYaw, 0.35 * Math.sin(t * 0.7), 3, dt); st.hPitch = damp(st.hPitch, 0.12 * Math.sin(t * 0.9), 3, dt);
  bot.head.rotation.set(st.hPitch, st.hYaw, 0.1 * Math.sin(t * 0.6) * float, 'YXZ');
  st.saberA = damp(st.saberA, isSpin ? Math.PI : 1.25, isSpin ? 30 : 8, dt); bot.grip.rotation.x = st.saberA;

  // F still works on whatever it holds
  const hum = 1 + 0.06 * Math.sin(t * 57) + 0.04 * Math.sin(t * 23);
  if (held && held.kind === 'saber' && pressed.use) held.target = held.target ? 0 : 1;
  if (held && held.kind === 'gun') { held.cd -= dt; if (keys.use && held.cd <= 0) { fireBolt(held); held.cd = 0.16; } }
  for (const it of items) if (it.kind === 'saber') {
    it.lit = damp(it.lit, it.target, it.target ? 9 : 12, dt);
    it.blade.scale.y = Math.max(0.001, it.lit); it.blade.visible = it.lit > 0.01;
    for (const gl of it.glow) gl.m.opacity = gl.op * hum; it.light.intensity = 1.6 * it.lit * hum;
  }

  updateItems(dt); updateBolts(dt);
  updatePool(dustPool, dt); updatePool(sparkPool, dt);

  // camera rides in the bot's own frame
  if (keys.camL || keys.camR) { cam.yaw += ((keys.camL ? 1 : 0) - (keys.camR ? 1 : 0)) * 2.2 * dt; camTouched(); }
  if (keys.zoomIn || keys.zoomOut) { cam.zoom = clamp(cam.zoom * Math.exp(((keys.zoomOut ? 1 : 0) - (keys.zoomIn ? 1 : 0)) * 1.4 * dt), ZOOM_MIN, ZOOM_MAX); camTouched(); }
  if (pressed.camReset) resetCam();
  const q = R0.quaternion, D = 9 * Math.min(cam.zoom, 1.6), el = clamp(0.3 + cam.pitch, -1.2, 1.45);
  tmp.set(-Math.sin(cam.yaw) * D * Math.cos(el), 1.6 + D * Math.sin(el), -Math.cos(cam.yaw) * D * Math.cos(el)).applyQuaternion(q).add(P);
  tmp.x = clamp(tmp.x, -(HUB_L / 2 - 3), HUB_L / 2 - 3);   // stay out of the airlock doors at the ends
  fl.cam.lerp(tmp, 1 - Math.exp(-(cam.dragging ? 14 : 4) * dt));
  camera.position.copy(fl.cam);
  camera.up.set(0, 1, 0).applyQuaternion(q);
  camera.lookAt(tmp2.set(0, 1.6, 0).applyQuaternion(q).add(P));
  axisLight.position.set(P.x, 0, 0);

  for (const f of spinners) f(dt, t);
  sky.rotation.x = -OMEGA * t;
  syncLights();
  if (where !== whereTxt) { whereTxt = where; whereEl.textContent = where; }
  updatePrompt(P, prompt);
}

// ---- ships: cradles and airlocks in the hub, and flying out to space (apps/client/src/app/flight.ts) ----
const ships = createFlightMode({
  camera, hub: liftWorld, steel: steelR, hazardMap: hazard.map, capMap: capTex, orbit: cam, keys, pressed, drawTex, makeSign, glow,
  setWhere: txt => { if (txt !== whereTxt) { whereTxt = txt; whereEl.textContent = txt; } },
  setPrompt: txt => updatePrompt(bot.root.position, txt, true),
  onDocked: c => {
    st.mode = 'hub'; bot.root.visible = true;
    bot.root.position.set(c.pos.x, c.pos.y, c.pos.z).multiplyScalar(0.45); bot.root.quaternion.identity(); fl.V.set(0, 0, 0);
    fl.cam.copy(bot.root.position).add(tmp.set(-c.end * 9, 2.5, 3));
  },
});

// bend everything that lives on the floor onto the ring; real point lights follow their flat stand-ins
const lightPairs = [];
function bendTree(o) {
  if (o.userData.noBend) return;
  if (o.isMesh || o.isSprite || o.isPoints) { o.frustumCulled = false; (Array.isArray(o.material) ? o.material : [o.material]).forEach(bendMaterial); }
  if (o.isPointLight && o !== axisLight) lightPairs.push({ src: o });
  o.children.forEach(bendTree);
}
bendTree(scene);
for (const L of lightPairs) { L.real = new THREE.PointLight(L.src.color, 0, L.src.distance, L.src.decay); L.src.visible = false; scene.add(L.real); }
function chainVisible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function syncLights() {
  for (const L of lightPairs) {
    L.src.getWorldPosition(tmp);
    if (tmp.y > REAL_OFF / 2) L.real.position.set(tmp.x, tmp.y - REAL_OFF, tmp.z); else bendPoint(tmp, L.real.position);
    L.real.intensity = chainVisible(L.src.parent) ? L.src.intensity : 0;
  }
}
document.getElementById('spec').textContent = `800 ft ring · 85 ft hull · 400 ft long · ${RPM.toFixed(2)} rpm = 1 g`;
const whereEl = document.getElementById('where');
let whereTxt = '';
function updateWhere(p) {
  const deg = Math.round(((p.z / R_IN) * 180 / Math.PI % 360 + 360) % 360), ft = Math.round(Math.abs(p.x) / FT);
  const txt = `${deg}° around the ring · ${ft < 3 ? 'on the center line' : `${ft} ft toward the ${p.x > 0 ? 'east' : 'west'} cap`}`;
  if (txt !== whereTxt) { whereTxt = txt; whereEl.textContent = txt; }
}

// ---- coming aboard as your own robot (app/aboard.ts): rebuilt from its parts, then rolled out of the Bot Maker ----
const eyePair = lightPairs.find(L => L.src === bot.eyeLight);
let noEye = null;   // stands in for the eye light of a robot built without an eye
legacy.setRobotBuild = build => {
  const old = { ...bot }, parent = old.root.parent;
  const next = buildRobot(robotKit, build, { eyeLight: true });
  next.root.position.copy(old.root.position); next.root.quaternion.copy(old.root.quaternion); next.root.rotation.copy(old.root.rotation);
  next.root.visible = old.root.visible;
  next.root.traverse(o => { if (o.isMesh || o.isSprite) { o.frustumCulled = false; bendMaterial(o.material); } });
  if (next.eyeLight) next.eyeLight.visible = false;   // its stand-in in the scene does the lighting (syncLights)
  eyePair.src = next.eyeLight || (noEye ||= new THREE.PointLight(0, 0));
  next.arms.forEach((A, i) => { if (old.arms[i]) Object.assign(A.cur, old.arms[i].cur); });
  if (held) next.grip.add(held.group);
  parent.remove(old.root); parent.add(next.root);
  Object.assign(bot, next);
  disposeRobot(old, Object.values(M));
};
legacy.rollOutOfBotMaker = () => {
  if (st.mode === 'ship') return;   // out flying a ship: it carries on from where it docks
  if (st.mode !== 'floor') {   // up in the hub or on a lift: back down to the floor
    scene.add(bot.root); bot.root.quaternion.identity(); bot.root.visible = true;
    bot.blob.visible = true; cab.visible = false;
  }
  const S = BOT_MAKER.spawn;
  st.mode = 'floor'; st.boardNext = null;
  bot.root.position.set(S.x, 0, S.z); st.yaw = S.yaw; bot.root.rotation.y = S.yaw;
  st.vel = 0; st.prevVel = 0; st.angVel = 0; st.y = 0; st.vy = 0; st.grounded = true; st.crouch = 0; st.land = 0;
  st.spin = -1; bot.spinner.rotation.y = 0;
  st.idle = 0; st.still = 0; st.wave = -1; st.camOrbit = 0;
  st.rollout = S.maxSeconds;
  camPos.set(S.camera.x, S.camera.y, S.camera.z); started = true;
};

// Test/debug hook (added in Phase 0): exposes live state when the page is opened with ?debug.
if (new URLSearchParams(location.search).has('debug')) window.__saber = { st, bot, cam, camera, camPos, keys, clock, lifts: LIFTS, ships };

frame();
})();
