import * as THREE from 'three';
import { splitFaces, withFaces } from './jaw';

// The shape generator every sketchbook head is built by (docs/initiatives/sketchbook-characters.md): a superellipsoid,
// a ball stretched wide or tall and made boxier, its sides drawn in toward the top. Each character sets a few numbers
// to get its shape from the sheet, and every head has the same vertices, so faces, visors, and features are placed the
// same way on all of them. Astro's body is one too, made boxy.

/** A superellipsoid: half-width `a`, half-height `b`, half-depth `c`, boxier as `p` grows, narrower at the top by `taper`. */
export interface SuperShape {
  a: number;
  b: number;
  c: number;
  p: number;
  taper: number;
}

/** The surface of a shape, to lay things on it: the front's height field, the sides, and the top. */
export interface SuperSurface {
  /** The front surface at (x, y): the point, and its normal. */
  surfaceAt(x: number, y: number): { p: THREE.Vector3; n: THREE.Vector3 };
  /** Where the side is at height y (and depth z), on the side `s` (1 for +x). */
  sideX(y: number, z: number, s: number): number;
  /** How high the top is above (x, z). */
  topY(x: number, z: number): number;
}

export function superSurface(S: SuperShape): SuperSurface {
  const taper = (y: number) => 1 - S.taper * (y / S.b);
  const pw = (v: number) => Math.abs(v) ** S.p;
  return {
    surfaceAt(x, y) {
      const z = (yy: number, xx: number) =>
        S.c * Math.max(0, 1 - pw(xx / (S.a * taper(yy))) - pw(yy / S.b)) ** (1 / S.p);
      const e = 0.002;
      const dzx = (z(y, x + e) - z(y, x - e)) / (2 * e);
      const dzy = (z(y + e, x) - z(y - e, x)) / (2 * e);
      return { p: new THREE.Vector3(x, y, z(y, x)), n: new THREE.Vector3(-dzx, -dzy, 1).normalize() };
    },
    sideX(y, z, s) {
      return s * S.a * taper(y) * Math.max(0, 1 - pw(y / S.b) - pw(z / S.c)) ** (1 / S.p);
    },
    topY(x, z) {
      let lo = 0;
      let hi: number = S.b;
      for (let i = 0; i < 40; i++) {
        const y = (lo + hi) / 2;
        if (pw(x / (S.a * taper(y))) + pw(y / S.b) + pw(z / S.c) > 1) hi = y;
        else lo = y;
      }
      return lo;
    },
  };
}

/**
 * The shape, from a sphere of `w` segments around and `h` down: every point pushed out to the superellipsoid along its
 * own direction, then the sides drawn in toward the top. Normals come from the shape itself, so they're smooth over
 * the seams and poles.
 */
export function superGeometry(S: SuperShape, w: number, h: number): THREE.SphereGeometry {
  const taper = (y: number) => 1 - S.taper * (y / S.b);
  const pw = (v: number) => Math.abs(v) ** S.p;
  const full = new THREE.SphereGeometry(1, w, h);
  const pos = full.attributes.position as THREE.BufferAttribute;
  const nor = full.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = (pw(v.x / S.a) + pw(v.y / S.b) + pw(v.z / S.c)) ** (-1 / S.p);
    const y = v.y * k;
    const t = taper(y);
    const x = v.x * k * t;
    const z = v.z * k;
    pos.setXYZ(i, x, y, z);
    // the gradient of |x/(a t)|^p + |y/b|^p + |z/c|^p, with t falling as y rises
    const X = x / (S.a * t);
    const p = S.p;
    n.set(
      (Math.sign(x) * p * Math.abs(X) ** (p - 1)) / (S.a * t),
      (Math.sign(y) * p * Math.abs(y / S.b) ** (p - 1)) / S.b + (p * Math.abs(X) ** p * S.taper) / (S.b * t),
      (Math.sign(z) * p * Math.abs(z / S.c) ** (p - 1)) / S.c,
    ).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  full.computeBoundingSphere();
  return full;
}

/** Where a head's jaw is cut: from `top` down to `bottom` (heights on the front), and out to `half` either side. */
export interface JawCut {
  top: number;
  bottom: number;
  half: number;
}

export interface HeadShape {
  /** The whole head, for its outline. */
  full: THREE.SphereGeometry;
  /** The head without its jaw, and the jaw. */
  kept: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  /** Where the jaw hinges, and where the dark of the mouth sits behind it. */
  hinge: THREE.Vector3;
  mouth: THREE.Vector3;
}

/**
 * A head: the shape (ribbed, if it has `ribs`), with its jaw cut from the lower front along the sphere's own segment
 * lines (parts/jaw.ts).
 */
export function headShape(S: SuperShape, cut: JawCut, w: number, h: number, ribs?: Ribs): HeadShape {
  const full = superGeometry(S, w, h);
  if (ribs) pressRibs(full, S, ribs);
  const pos = full.attributes.position as THREE.BufferAttribute;
  const across = w + 1;
  const front = w / 4;
  const at = (row: number, col: number) => new THREE.Vector3().fromBufferAttribute(pos, row * across + col);
  let r0 = 0;
  while (at(r0, front).y > cut.top) r0++;
  let r1 = r0;
  while (at(r1, front).y > cut.bottom) r1++;
  const mid = Math.round((r0 + r1) / 2);
  let c0 = front;
  while (Math.abs(at(mid, c0 - 1).x) <= cut.half) c0--;
  let c1 = front;
  while (Math.abs(at(mid, c1 + 1).x) <= cut.half) c1++;
  const { kept, taken } = splitFaces(full, (row, col) => row >= r0 && row < r1 && col >= c0 && col < c1);
  const corner = at(r0, c0);
  const chin = at(r1, front);
  return {
    full,
    kept: withFaces(full, kept),
    jaw: withFaces(full, taken),
    hinge: new THREE.Vector3(0, corner.y, corner.z),
    mouth: new THREE.Vector3(0, (corner.y + chin.y) / 2, chin.z * 0.55),
  };
}

/** A sphere stretched to an ellipsoid. */
export const ellipsoid = (x: number, y: number, z: number, w = 28, h = 20) => {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(x, y, z);
  return g;
};

// ---------- ribs: a pumpkin's lobes ----------

/**
 * Ribs pressed into a shape: `n` grooves running top to bottom, one straight down the front, each cut in toward the
 * middle by `depth` (a fraction of the radius there), fading out toward the top and bottom.
 */
export interface Ribs {
  n: number;
  depth: number;
}

/** How far in a ribbed shape is drawn at angle `phi` round the middle (0 is straight ahead) and height `y`. */
function ribScale(ribs: Ribs, b: number, phi: number, y: number): number {
  const lobe = 1 - Math.abs(Math.sin((ribs.n * phi) / 2));
  return 1 - ribs.depth * lobe * lobe * (1 - Math.abs(y / b) ** 4);
}

/** The base shape's radius, round the middle, at angle `phi` and height `y`. */
function baseRadius(S: SuperShape, phi: number, y: number): number {
  const t = 1 - S.taper * (y / S.b);
  const pw = (v: number) => Math.abs(v) ** S.p;
  const rim = Math.max(0, 1 - pw(y / S.b));
  return (rim / (pw(Math.sin(phi) / (S.a * t)) + pw(Math.cos(phi) / S.c))) ** (1 / S.p);
}

/** A point on a ribbed shape's surface, at angle `phi` round the middle and height `y`. */
export function ribbedPoint(S: SuperShape, ribs: Ribs, phi: number, y: number): THREE.Vector3 {
  const r = baseRadius(S, phi, y) * ribScale(ribs, S.b, phi, y);
  return new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
}

/** The front of a ribbed shape, to lay things on it: at (x, y), the point and its normal. */
export function ribbedSurfaceAt(S: SuperShape, ribs: Ribs) {
  const z = (x: number, y: number) => {
    // The ribs only draw the shape in toward its middle, so the angle round it is the same with or without them:
    // walk to the depth whose angle and radius agree.
    let zz = S.c;
    for (let i = 0; i < 8; i++) {
      const phi = Math.atan2(x, zz);
      const r = baseRadius(S, phi, y) * ribScale(ribs, S.b, phi, y);
      zz = Math.sqrt(Math.max(0, r * r - x * x));
    }
    return zz;
  };
  return (x: number, y: number) => {
    const e = 0.002;
    const dzx = (z(x + e, y) - z(x - e, y)) / (2 * e);
    const dzy = (z(x, y + e) - z(x, y - e)) / (2 * e);
    return { p: new THREE.Vector3(x, y, z(x, y)), n: new THREE.Vector3(-dzx, -dzy, 1).normalize() };
  };
}

/**
 * Presses ribs into a shape built by `superGeometry`, in place. Its normals are worked out again from the faces, and
 * averaged where the sphere's seam doubles a point, so the shading and the outline stay whole across it.
 */
export function pressRibs<T extends THREE.BufferGeometry>(g: T, S: SuperShape, ribs: Ribs): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = ribScale(ribs, S.b, Math.atan2(x, z), y);
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const same = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const list = same.get(key);
    if (list) list.push(i);
    else same.set(key, [i]);
  }
  const n = new THREE.Vector3();
  for (const list of same.values()) {
    if (list.length < 2) continue;
    n.set(0, 0, 0);
    for (const i of list) n.add(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)));
    n.normalize();
    for (const i of list) nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.computeBoundingSphere();
  return g;
}

/** The line down one groove of a ribbed shape, lifted a hair off it, from `y0` up to `y1`. */
export function grooveCurve(S: SuperShape, ribs: Ribs, k: number, y0: number, y1: number): THREE.CatmullRomCurve3 {
  const phi = (k * 2 * Math.PI) / ribs.n;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const p = ribbedPoint(S, ribs, phi, y0 + ((y1 - y0) * i) / 24);
    pts.push(p.add(new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(0.006)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// ---------- things laid on a surface, and tubes ----------

type SurfaceAt = (x: number, y: number) => { p: THREE.Vector3; n: THREE.Vector3 };

/**
 * A decal: a disc (`n` 2) or a rounder-cornered squircle (`n` above 2), `rx` by `ry` round (cx, cy), laid onto a
 * surface and lifted off it by `lift(t)`, t running from its middle (0) to its edge (1). Its texture spans it.
 */
export function decal(
  at: SurfaceAt,
  shape: { cx: number; cy: number; rx: number; ry: number; n?: number },
  lift: (t: number) => number,
  rings = 16,
  segs = 64,
): THREE.BufferGeometry {
  const e = 2 / (shape.n ?? 2);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const x = t * shape.rx * Math.sign(c) * Math.abs(c) ** e;
      const y = t * shape.ry * Math.sign(s) * Math.abs(s) ** e;
      const { p, n } = at(shape.cx + x, shape.cy + y);
      p.addScaledVector(n, lift(t));
      pos.push(p.x, p.y, p.z);
      uv.push(x / (2 * shape.rx) + 0.5, y / (2 * shape.ry) + 0.5);
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

/** A tube along `curve`, `r0` thick at its start and `r1` at its end. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, seg = 24, radial = 12) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeBoundingSphere();
  return g;
}
