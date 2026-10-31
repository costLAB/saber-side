import type { XYZ } from './ring-space';

/** A minimal mutable 3-vector for sim state. It fits `SettableXYZ`, like a three.js `Vector3`, and serializes as plain x/y/z. */
export class Vec3 implements XYZ {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

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
