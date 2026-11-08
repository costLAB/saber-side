import * as THREE from 'three';
import { makeCanvas } from '../../render/textures';
import { catLook, INK, linear } from './cat-look';
import type { BodyMounts, PartKit, RobotKit } from './kit';
import { ellipsoid, type HeadShape, headShape, superGeometry, superSurface } from './sketch-shapes';

// Astro, the sketchbook astronaut, as robot parts (docs/initiatives/sketchbook-characters.md): a round-cornered cream
// helmet with a big glossy navy visor, an antenna, and ear discs; a small cream box of a body with a slate chest panel
// of four lit orange squares and a backpack; and cream-and-orange striped arms with round white C grabbers. Drawn the
// way Snatch is (cat-look.ts): cel-shaded on a stepped ramp, with thick outlines. Paint covers the cream shell only.
//
// The head and body are in model units, inside groups scaled ASTRO_SCALE. The arms are in the game's units, since
// their joints are the same as every other arm's.

export const ASTRO_SCALE = 0.9;

/** The owner's close-up's colors, as sRGB hex. */
export const ASTRO = {
  cream: '#f7dfbf',
  orange: '#f7931e',
  white: '#fdf6ee',
  slate: '#6f7a8a',
  frame: '#525b69',
  pack: '#a2a7b0',
  socket: '#3a2d29',
  light: '#ffa21f',
  lightCore: '#ffe27a',
  shine: '#fff3e0',
} as const;

// ---------- the head: a round-cornered helmet with a visor ----------

/** The helmet: wide, a little boxy, and barely narrower at the top. The same generator as Snatch's head. */
const HEAD = { a: 1.3, b: 0.98, c: 1.0, p: 3.0, taper: 0.04 } as const;
/** The helmet's middle, above the head group (which sits just over the neck mount). */
const HEAD_Y = 0.84;
const HW = 128;
const HH = 96;

const helmet = superSurface(HEAD);

let astroShape: HeadShape | undefined;
/** The helmet, with its jaw in the cream chin under the visor. */
function astroHeadShape(): HeadShape {
  astroShape ??= headShape(HEAD, { top: -0.76, bottom: -0.95, half: 0.45 }, HW, HH);
  return astroShape;
}

/** The visor: a rounded rectangle across most of the face, in the helmet's frame. */
const VISOR = { x: 0, y: -0.05, rx: 0.96, ry: 0.66, n: 5 } as const;

/** The visor's glass: a squircle laid onto the helmet's face and domed a little, so it bulges like glass. */
function visorGeometry(): THREE.BufferGeometry {
  const rings = 24;
  const segs = 128;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const e = 2 / VISOR.n;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const lift = 0.012 + 0.05 * (1 - t * t);
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const x = t * VISOR.rx * Math.sign(c) * Math.abs(c) ** e;
      const y = t * VISOR.ry * Math.sign(s) * Math.abs(s) ** e;
      const { p, n } = helmet.surfaceAt(VISOR.x + x, VISOR.y + y);
      p.addScaledVector(n, lift);
      pos.push(p.x, p.y, p.z);
      uv.push(x / (2 * VISOR.rx) + 0.5, y / (2 * VISOR.ry) + 0.5);
      if (i < rings && j < segs) {
        const a = i * (segs + 1) + j;
        const b = a + segs + 1;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The visor's picture: deep navy glass with lighter streaks across it, white shines, and an inked, peachy rim. */
function drawVisor(g: CanvasRenderingContext2D, w: number, h: number) {
  const edge = (inset: number) => {
    g.beginPath();
    const steps = 160;
    const e = 2 / VISOR.n;
    for (let j = 0; j <= steps; j++) {
      const phi = (j / steps) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const x = w / 2 + (w / 2 - inset) * Math.sign(c) * Math.abs(c) ** e;
      const y = h / 2 - (h / 2 - inset) * Math.sign(s) * Math.abs(s) ** e;
      if (j) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  };
  // the glass: lighter at the top left, deepest at the bottom right
  const glass = g.createLinearGradient(0, 0, w, h);
  glass.addColorStop(0, '#34558f');
  glass.addColorStop(0.45, '#22396b');
  glass.addColorStop(1, '#101b38');
  g.fillStyle = glass;
  g.fillRect(0, 0, w, h);
  // soft streaks of reflected light, slanting down to the right
  g.save();
  edge(0);
  g.clip();
  g.fillStyle = 'rgba(122, 160, 222, 0.22)';
  for (const [x0, wide] of [
    [0.36, 0.13],
    [0.6, 0.06],
  ] as const) {
    g.beginPath();
    g.moveTo(w * x0, 0);
    g.lineTo(w * (x0 + wide), 0);
    g.lineTo(w * (x0 + wide + 0.32), h);
    g.lineTo(w * (x0 + 0.32), h);
    g.closePath();
    g.fill();
  }
  // the shines: a big oval at the top left, a dot under it, a faint one low on the right
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(w * 0.22, h * 0.28, w * 0.085, h * 0.15, -0.5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(w * 0.13, h * 0.55, w * 0.032, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.beginPath();
  g.ellipse(w * 0.84, h * 0.8, w * 0.05, h * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the rim: a thin peach line round the edge, then the ink inside it
  g.lineJoin = 'round';
  g.strokeStyle = '#f3a46e';
  g.lineWidth = w * 0.03;
  edge(w * 0.015);
  g.stroke();
  g.strokeStyle = '#120c0e';
  g.lineWidth = w * 0.022;
  edge(w * 0.036);
  g.stroke();
}

const visorCache = new WeakMap<RobotKit['materials'], THREE.Texture>();
/** The visor's texture, drawn once and shared by every Astro. */
function visorTexture(kit: RobotKit): THREE.Texture {
  let t = visorCache.get(kit.materials);
  if (!t) {
    const c = makeCanvas(768, 528);
    drawVisor(c.getContext('2d') as CanvasRenderingContext2D, c.width, c.height);
    t = kit.toTex(c, true);
    visorCache.set(kit.materials, t);
  }
  return t;
}

/** An upright drum turned to lie along x, for the ear discs. */
const xDrum = (r: number, h: number) => {
  const g = new THREE.CylinderGeometry(r, r, h, 40);
  g.rotateZ(Math.PI / 2);
  return g;
};

export interface BuiltAstroHead {
  head: THREE.Group;
  jaw: { hinge: THREE.Group; open: number; amount: number };
}

/** Astro's helmet, on a neck at `neckY` (the helmet sits right on the body, as in the drawing). */
export function astroHead(kit: PartKit, core: THREE.Group, paint: string, neckY: number): BuiltAstroHead {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const skull = new THREE.Group();
  skull.position.y = HEAD_Y;
  skull.scale.setScalar(ASTRO_SCALE);
  head.add(skull);

  const shape = astroHeadShape();
  const shell = look.fur(ASTRO.cream);
  skull.add(look.ink(mesh(shape.kept, shell), INK.thick, shape.full));
  // The jaw swings down from a hinge across its top back corners, and the dark of the mouth sits behind it.
  const hinge = new THREE.Group();
  hinge.position.copy(shape.hinge);
  skull.add(hinge);
  const jaw = mesh(shape.jaw, shell);
  jaw.position.copy(shape.hinge).negate();
  hinge.add(jaw);
  const mouth = mesh(ellipsoid(0.36, 0.12, 0.22, 20, 14), kit.materials.dark, false);
  mouth.position.copy(shape.mouth);
  skull.add(mouth);

  // the visor, glossy navy glass across the face
  skull.add(mesh(visorGeometry(), look.painted(visorTexture(kit)), false));

  // the ear discs: cream, with an orange cup, a dark ring, and an orange middle
  const earY = 0.02;
  for (const side of [1, -1] as const) {
    const x = helmet.sideX(earY, 0, side);
    const ear = new THREE.Group();
    ear.position.set(x, earY, 0);
    skull.add(ear);
    for (const [r, h, at, mat, ink] of [
      [0.3, 0.2, 0.02, shell, INK.thick],
      [0.21, 0.1, 0.15, look.toon(ASTRO.orange), INK.thin],
      [0.12, 0.04, 0.21, look.toon(ASTRO.socket), INK.thin * 0.6],
      [0.055, 0.05, 0.23, look.toon(ASTRO.orange), 0],
    ] as const) {
      const disc = mesh(xDrum(r, h), mat);
      disc.position.x = side * at;
      ear.add(ink ? look.ink(disc, ink) : disc);
    }
  }

  // the antenna: a cream foot, a thin orange rod, and an orange ball with a shine
  const top = helmet.topY(0, 0);
  const foot = look.ink(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 24), shell), INK.thin);
  foot.position.y = top + 0.02;
  skull.add(foot);
  const orange = look.toon(ASTRO.orange);
  const rod = look.ink(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.46, 12), orange), INK.thin);
  rod.position.y = top + 0.28;
  skull.add(rod);
  const ball = look.ink(mesh(new THREE.SphereGeometry(0.12, 24, 16), orange), INK.thin);
  ball.position.y = top + 0.56;
  skull.add(ball);
  const shine = mesh(ellipsoid(0.04, 0.03, 0.02, 12, 8), look.toon(ASTRO.shine), false);
  shine.position.set(-0.05, 0.05, 0.09);
  ball.add(shine);

  return { head, jaw: { hinge, open: 0.45, amount: 0 } };
}

// ---------- the body: a small cream box with a chest panel and a backpack ----------

/** Where the body's bottom sits, above the wheel's middle: on the drive ball, covering its top. */
const BODY_Y = 0.62;
/** The body: a box with soft corners, a touch narrower at the top. */
const BODY = { a: 0.72, b: 0.52, c: 0.58, p: 4, taper: 0.06 } as const;

/** In the core's frame: a body-frame point (model units, y up from the body's bottom) where the game draws it. */
const onBody = (x: number, y: number, z: number): [number, number, number] => [
  x * ASTRO_SCALE,
  BODY_Y + y * ASTRO_SCALE,
  z * ASTRO_SCALE,
];

/** A small box with rounded corners, from the same generator. */
const softBox = (a: number, b: number, c: number, p = 5) => superGeometry({ a, b, c, p, taper: 0 }, 32, 24);

export interface BuiltAstroBody {
  mounts: BodyMounts;
  /** The chest lights' halo. */
  ledGlow: THREE.Sprite;
}

export function astroBody(kit: PartKit, core: THREE.Group, paint: string): BuiltAstroBody {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  body.scale.setScalar(ASTRO_SCALE);
  core.add(body);
  const torso = superGeometry(BODY, 64, 48);
  torso.translate(0, BODY.b, 0);
  body.add(look.ink(mesh(torso, look.fur(ASTRO.cream)), INK.thick));

  // the chest panel: a slate square in a darker frame, with four lit orange squares
  const panel = new THREE.Group();
  panel.position.set(0, 0.5, BODY.c - 0.01);
  body.add(panel);
  panel.add(look.ink(mesh(softBox(0.31, 0.31, 0.05), look.toon(ASTRO.frame)), INK.thin));
  const face = mesh(softBox(0.27, 0.27, 0.04), look.toon(ASTRO.slate));
  face.position.z = 0.02;
  panel.add(face);
  // Glows are unlit, not lights (D9).
  const lit = new THREE.MeshBasicMaterial({ color: linear(ASTRO.light) });
  const core0 = new THREE.MeshBasicMaterial({ color: linear(ASTRO.lightCore) });
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const sq = look.ink(mesh(softBox(0.095, 0.095, 0.03), lit, false), INK.thin * 0.6);
      sq.position.set(x * 0.12, y * 0.12, 0.05);
      panel.add(sq);
      const hot = mesh(softBox(0.045, 0.045, 0.02), core0, false);
      hot.position.z = 0.02;
      sq.add(hot);
    }
  }
  const ledGlow = kit.glow(0xffa630, 0.7, 0.45);
  ledGlow.position.z = 0.12;
  panel.add(ledGlow);

  // the backpack, gray, on the back
  const pack = look.ink(mesh(softBox(0.5, 0.4, 0.2, 4), look.toon(ASTRO.pack)), INK.thick);
  pack.position.set(0, 0.56, -BODY.c - 0.12);
  body.add(pack);

  return {
    ledGlow,
    mounts: {
      neckY: BODY_Y + 2 * BODY.b * ASTRO_SCALE,
      shoulder: onBody(0.74, 0.74, 0),
      hold: onBody(0, 0.5, 1.05),
      // The mouth hatch, for a robot with no head, sits high on the chest above the panel.
      mouth: { position: onBody(0, 0.88, 0.55), lat: 0.25, lon: 0, w: 0.3, h: 0.18 },
    },
  };
}

// ---------- the arms: cream and orange stripes, with round C grabbers ----------

/** Astro's arms, in the joints every arm has (parts/arms.ts): orange at each joint, cream between, white grabbers. */
export function astroArm(kit: PartKit, shoulder: THREE.Group, s: number, paint: string) {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const cream = look.fur(ASTRO.cream);
  const orange = look.toon(ASTRO.orange);
  const white = look.toon(ASTRO.white);
  const ink = INK.thick * 0.6;
  /** The bands, which stretch with the arm when VR makes it long (parts/arms.ts). */
  const bands: THREE.Object3D[] = [];
  const band = (parent: THREE.Object3D, y0: number, y1: number, r: number, mat: THREE.Material) => {
    const m = look.ink(mesh(new THREE.CapsuleGeometry(r, y0 - y1, 6, 16), mat), ink);
    m.position.y = (y0 + y1) / 2;
    parent.add(m);
    bands.push(m);
  };
  band(shoulder, 0.02, -0.14, 0.15, orange);
  band(shoulder, -0.14, -0.33, 0.14, cream);
  const elbow = new THREE.Group();
  elbow.position.y = -0.34;
  shoulder.add(elbow);
  band(elbow, 0.02, -0.13, 0.15, orange);
  band(elbow, -0.13, -0.3, 0.14, cream);
  const wrist = new THREE.Group();
  wrist.position.y = -0.32;
  elbow.add(wrist);
  const palm = look.ink(mesh(ellipsoid(0.15, 0.12, 0.14, 20, 14), white), ink);
  palm.position.y = -0.06;
  wrist.add(palm);

  // The grabber: a fat white C, open down and in, in two halves that close on what it holds.
  const R = 0.15;
  const tube = 0.08;
  const C = new THREE.Vector3(0, -0.27, 0.03);
  const open = -Math.PI / 2 - s * 0.5;
  const gap = 0.9;
  const back = open + Math.PI;
  const onC = (a: number) => new THREE.Vector3(C.x + R * Math.cos(a), C.y + R * Math.sin(a), C.z);
  const pivot = onC(back);
  const fingers = (
    [
      [back, -0.3],
      [open + gap / 2, 0.3],
    ] as const
  ).map(([start, spread]) => {
    const arc = Math.PI - gap / 2;
    const root = new THREE.Group();
    root.position.copy(pivot);
    wrist.add(root);
    const geo = new THREE.TorusGeometry(R, tube, 12, 24, arc);
    geo.rotateZ(start);
    geo.translate(C.x - pivot.x, C.y - pivot.y, C.z - pivot.z);
    root.add(look.ink(mesh(geo, white), INK.thin));
    // a round tip at the half's free end, where its joint is
    const free = start === back ? start + arc : start;
    const joint = new THREE.Group();
    joint.position.copy(onC(free)).sub(pivot);
    root.add(joint);
    joint.add(look.ink(mesh(new THREE.SphereGeometry(tube, 16, 12), white), INK.thin));
    return { root, joint, spread };
  });
  const thumb = new THREE.Group();
  thumb.position.copy(pivot);
  wrist.add(thumb);
  return { elbow, wrist, fingers, thumb, bands };
}

/** Where a C grabber holds things, in its wrist's frame: in the middle of the C. */
export const ASTRO_GRIP = [0, -0.27, 0.06] as const;
