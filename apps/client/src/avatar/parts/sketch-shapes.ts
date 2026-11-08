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

/** A head: the shape, with its jaw cut from the lower front along the sphere's own segment lines (parts/jaw.ts). */
export function headShape(S: SuperShape, cut: JawCut, w: number, h: number): HeadShape {
  const full = superGeometry(S, w, h);
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
