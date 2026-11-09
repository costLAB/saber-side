import * as THREE from 'three';
import { CAT, CAT_SCALE, catLook, INK } from './cat-look';
import { catSkins } from './cat-skins';
import { buildCatTail } from './cat-tail';
import type { BodyMounts, PartKit } from './kit';
import { ellipsoid, type HeadShape, headShape, superSurface } from './sketch-shapes';

// Snatch, the sketchbook cat, as robot parts: a big round tabby head, a bell of a body that carries the tail, and
// banded arms with mitten paws (docs/initiatives/sketchbook-characters.md). Each fits with any other part.
//
// The head and body are in model units, inside a group scaled CAT_SCALE (cat-look.ts). The arms are in the game's
// units, since their joints are the same as every other arm's.

// ---------- the head: a superellipsoid, wide and a little wider at the jaw ----------

const HEAD = { a: 1.37, b: 0.87, c: 0.92, p: 2.25, taper: 0.23 } as const;
/** The head's middle, above the head group (which sits just over the neck mount). */
const HEAD_Y = 0.76;
/** The sphere the head is shaped from: its segments around and down. */
const HW = 128;
const HH = 96;

const { surfaceAt, sideX, topY } = superSurface(HEAD);

let catShape: HeadShape | undefined;
/** The head, with its jaw from just under the mouth's stem down to the chin, as wide as the frown and a bit more. */
function catHeadShape(): HeadShape {
  catShape ??= headShape(HEAD, { top: -0.36, bottom: -0.68, half: 0.38 }, HW, HH);
  return catShape;
}

/** An eye: a disc laid onto the face and domed a little, so it wraps the head. In the head's frame. */
function eyeGeometry(side: 1 | -1): THREE.BufferGeometry {
  const r = 0.49;
  const ex = side * -0.68;
  const ey = 0.04;
  const rings = 20;
  const segs = 64;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const rho = (i / rings) * r;
    const lift = 0.014 + 0.055 * (1 - (rho / r) ** 2);
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * Math.PI * 2;
      const x = rho * Math.cos(phi);
      const y = rho * Math.sin(phi);
      const { p, n } = surfaceAt(ex + x, ey + y);
      p.addScaledVector(n, lift);
      pos.push(p.x, p.y, p.z);
      uv.push(x / (2 * r) + 0.5, y / (2 * r) + 0.5);
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

/** The ear: a broad cone, a little pinched along its sides. */
function earGeometry(): THREE.LatheGeometry {
  const pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = 0.5 * (1 - t) ** 0.92 * (1 - 0.15 * Math.sin(Math.PI * t));
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), t * 0.86));
  }
  pts.push(new THREE.Vector2(0, 0.865));
  return new THREE.LatheGeometry(pts, 40);
}

export interface BuiltCatHead {
  head: THREE.Group;
  jaw: { hinge: THREE.Group; open: number; amount: number };
}

/** Snatch's head, on a neck at `neckY` (no neck to see: the head sits right on the body, as in the drawing). */
export function catHead(kit: PartKit, core: THREE.Group, paint: string, neckY: number): BuiltCatHead {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const skins = catSkins(kit);
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const skull = new THREE.Group();
  skull.position.y = HEAD_Y;
  skull.scale.setScalar(CAT_SCALE);
  head.add(skull);

  const shape = catHeadShape();
  const skin = look.skin(CAT.fur, skins.head);
  const face = look.ink(mesh(shape.kept, skin), INK.thick, shape.full);
  skull.add(face);
  // The jaw swings down from a hinge across its top back corners, and the dark of the mouth sits behind it.
  const hinge = new THREE.Group();
  hinge.position.copy(shape.hinge);
  skull.add(hinge);
  const jaw = mesh(shape.jaw, skin);
  jaw.position.copy(shape.hinge).negate();
  hinge.add(jaw);
  const mouth = mesh(ellipsoid(0.36, 0.2, 0.24, 20, 14), kit.materials.dark, false);
  mouth.position.copy(shape.mouth);
  skull.add(mouth);

  // the eyes, laid on the face
  for (const side of [1, -1] as const) {
    skull.add(mesh(eyeGeometry(side), look.painted(side > 0 ? skins.eyes.right : skins.eyes.left), false));
  }

  // the nose: a soft rounded triangle, pink, with a shine on top
  const noseGeo = new THREE.SphereGeometry(1, 32, 20);
  const np = noseGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) np.setX(i, np.getX(i) * (1 + 0.26 * np.getY(i)));
  noseGeo.computeVertexNormals();
  noseGeo.scale(0.175, 0.11, 0.1);
  const nose = look.ink(mesh(noseGeo, look.toon(CAT.nose)), INK.thin);
  const at = surfaceAt(0, -0.13);
  nose.position.copy(at.p).addScaledVector(at.n, 0.02);
  nose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.15, 1).normalize());
  skull.add(nose);
  const shine = mesh(ellipsoid(0.07, 0.032, 0.03, 16, 10), look.toon(CAT.noseShine), false);
  shine.position.set(0, 0.045, 0.075);
  nose.add(shine);

  // the ears: broad and pointed, pink inside, with a tuft of cream fluff
  const ear = earGeometry();
  const fluff = new THREE.ConeGeometry(0.05, 0.2, 12, 1);
  for (const side of [1, -1] as const) {
    const x = side * -0.7;
    const root = new THREE.Group();
    root.position.set(x, topY(x, 0.1) - 0.26, 0.08);
    root.rotation.set(-0.1, side * -0.25, side * 0.3, 'YXZ');
    skull.add(root);
    const outer = look.ink(mesh(ear, look.fur(CAT.fur)), INK.thick);
    outer.scale.set(1, 1, 0.46);
    root.add(outer);
    const inner = look.ink(mesh(ear, look.toon(CAT.pink)), INK.thin);
    inner.scale.set(0.56, 0.66, 0.5);
    inner.position.set(side * 0.04, 0.16, 0.1);
    root.add(inner);
    for (const [fx, fy, rz] of [
      [0.12, 0.3, 0.7],
      [0.07, 0.34, 0.3],
      [0.17, 0.25, 1.1],
    ] as const) {
      const f = look.ink(mesh(fluff, look.toon(CAT.cream), false), INK.thin * 0.6);
      f.position.set(side * fx, fy, 0.3);
      f.rotation.z = side * rz;
      f.scale.set(1, 1, 0.5);
      root.add(f);
    }
  }

  // spiky fur on the cheeks
  const spike = new THREE.ConeGeometry(0.24, 0.5, 16, 1);
  const tuftFur = look.fur(CAT.fur);
  for (const side of [1, -1] as const) {
    for (const [y, ang, len] of [
      [0.24, 0.55, 0.62],
      [0.0, 0.1, 0.95],
      [-0.26, -0.2, 0.85],
      [-0.5, -0.55, 0.6],
    ] as const) {
      const tuft = look.ink(mesh(spike, tuftFur), INK.thick);
      tuft.scale.set(1, len, 0.42);
      tuft.rotation.z = side * (-Math.PI / 2 + ang);
      tuft.position.set(
        sideX(y, 0.12, side) + side * 0.05 + side * Math.cos(ang) * 0.06,
        y + Math.sin(ang) * 0.06,
        0.12,
      );
      skull.add(tuft);
    }
  }

  return { head, jaw: { hinge, open: 0.45, amount: 0 } };
}

// ---------- the body: a bell on the drive ball, with the tail ----------

/** Where the bell's bottom sits, above the wheel's middle: on the drive ball, covering its top. On the small roller,
 * the whole robot sits lower, so the bell comes down to just off the ground with the roller tucked up inside it. */
const BODY_Y = 0.55;
/** How deep the bell is, front to back, for its width. */
const BODY_DEPTH = 0.95;

function bellGeometry(): THREE.LatheGeometry {
  const prof = [
    [0, 0],
    [0.6, 0],
    [0.82, 0.04],
    [0.92, 0.16],
    [0.92, 0.32],
    [0.86, 0.58],
    [0.77, 0.82],
    [0.67, 1.0],
    [0.5, 1.15],
    [0.25, 1.23],
    [0, 1.25],
  ];
  const curve = new THREE.SplineCurve(prof.map(([x, y]) => new THREE.Vector2(x, y)));
  const pts = curve.getSpacedPoints(48).map((v) => new THREE.Vector2(Math.max(v.x, 0), v.y));
  pts[0]?.set(0, 0);
  pts[pts.length - 1]?.set(0, 1.25);
  // the seam at the back
  const g = new THREE.LatheGeometry(pts, 72, Math.PI);
  g.scale(1, 1, BODY_DEPTH);
  return g;
}

/** In the core's frame: a body-frame point (model units) where the game draws it. */
const onBody = (x: number, y: number, z: number): [number, number, number] => [
  x * CAT_SCALE,
  BODY_Y + y * CAT_SCALE,
  z * CAT_SCALE,
];

export interface BuiltCatBody {
  mounts: BodyMounts;
}

export function catBody(kit: PartKit, core: THREE.Group, paint: string): BuiltCatBody {
  const look = catLook(kit, paint);
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  body.scale.setScalar(CAT_SCALE);
  core.add(body);
  body.add(look.ink(kit.mesh(bellGeometry(), look.skin(CAT.bodyFur, catSkins(kit).body)), INK.thick));
  body.add(buildCatTail(look).group);
  // The mouth hatch, for a robot with no head, sits high on the chest above the belly.
  const mouthY = 1.06;
  return {
    mounts: {
      neckY: BODY_Y + 1.06 * CAT_SCALE,
      bottom: BODY_Y,
      shoulder: onBody(0.64, 0.95, 0.06),
      hold: onBody(0, 0.5, 1.15),
      mouth: { position: onBody(0, mouthY, 0.67 * BODY_DEPTH), lat: 0.45, lon: 0, w: 0.3, h: 0.2 },
    },
  };
}

// ---------- the arms: banded, with mitten paws ----------

/** Snatch's arms, in the joints every arm has (parts/arms.ts): fur at the shoulder, then cream, orange, and cream. */
export function catArm(kit: PartKit, shoulder: THREE.Group, s: number, paint: string) {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const fur = look.fur(CAT.bodyFur);
  const cream = look.toon(CAT.armCream);
  const orange = look.toon(CAT.orange);
  const ink = INK.thick * 0.6;
  /** The bands, which stretch with the arm when VR makes it long (parts/arms.ts). */
  const bands: THREE.Object3D[] = [];
  /** A band of the arm, from y0 down to y1 in its joint's frame. */
  const band = (parent: THREE.Object3D, y0: number, y1: number, r: number, mat: THREE.Material) => {
    const m = look.ink(mesh(new THREE.CapsuleGeometry(r, y0 - y1, 6, 16), mat), ink);
    m.position.y = (y0 + y1) / 2;
    parent.add(m);
    bands.push(m);
  };
  band(shoulder, 0.02, -0.15, 0.14, fur);
  band(shoulder, -0.15, -0.33, 0.125, cream);
  const elbow = new THREE.Group();
  elbow.position.y = -0.34;
  shoulder.add(elbow);
  band(elbow, 0.02, -0.15, 0.143, orange);
  band(elbow, -0.15, -0.31, 0.13, cream);
  const wrist = new THREE.Group();
  wrist.position.y = -0.33;
  elbow.add(wrist);
  const palm = look.ink(mesh(ellipsoid(0.27, 0.2, 0.24), cream), ink);
  palm.position.set(0, -0.15, 0.02);
  wrist.add(palm);
  // two curled fingers, and a little thumb
  const fingers = [-1, 1].map((fx) => {
    const root = new THREE.Group();
    root.position.set(fx * 0.1, -0.26, 0.06);
    wrist.add(root);
    const joint = new THREE.Group();
    joint.position.y = -0.03;
    root.add(joint);
    const toe = look.ink(mesh(ellipsoid(0.115, 0.13, 0.105, 20, 14), cream), INK.thin);
    toe.position.set(0, -0.02, 0.02);
    joint.add(toe);
    return { root, joint, spread: fx * 0.12 };
  });
  const thumb = new THREE.Group();
  thumb.position.set(s * 0.21, -0.13, 0.04);
  wrist.add(thumb);
  const tip = look.ink(mesh(ellipsoid(0.07, 0.09, 0.07, 16, 12), cream), INK.thin);
  tip.position.y = -0.04;
  thumb.add(tip);
  return { elbow, wrist, fingers, thumb, bands };
}

/** Where a cat paw holds things, in its wrist's frame. */
export const CAT_GRIP = [0, -0.3, 0.08] as const;
