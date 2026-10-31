import type { XYZ } from './ring-space.ts';

/** A minimal mutable 3-vector for sim state. It fits `SettableXYZ`, like a three.js `Vector3`, and serializes as plain x/y/z. */
export class Vec3 implements XYZ {
  x: number;
  y: number;
  z: number;

  // Plain fields rather than `constructor(public x = 0, ...)`: the server runs this file with Node's type stripping,
  // which only removes types and can't rewrite parameter properties.
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: XYZ): this {
    return this.set(v.x, v.y, v.z);
  }
}

export const distance = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
