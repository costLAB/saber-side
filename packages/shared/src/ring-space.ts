import { TAU } from './math.ts';

/**
 * Ring Seven geometry and the two coordinate frames the game uses.
 *
 * - **Strip frame**: everything on the floor is simulated on a flat strip. x runs across the ring (axis direction),
 *   z runs around it (arc length along the floor), and y is height above the floor.
 * - **Real frame**: the true 3D habitat. The spin axis is the x axis and the floor is a cylinder of radius `R_IN`
 *   around it. Strip z = 0 sits at the bottom of the ring (real y = -R_IN).
 *
 * `bendPoint` maps strip → real, and `unbend` maps real → strip. The renderer applies the same bend in a vertex shader.
 *
 * Units are still the prototype's scene units (1 ft = `FT` units, so the 4 ft robot is 3.35 units tall).
 * The switch to meters happens later in Phase 1.
 */

/** Scene units per foot. */
export const FT = 3.35 / 4;
/** Meters per scene unit. */
export const UNIT_M = 0.3048 / FT;

/** Floor radius (the ring is 800 ft across outside with an 85 ft hull, so the floor sits at 315 ft). */
export const R_IN = 315 * FT;
/** Outer hull radius. */
export const R_OUT = 400 * FT;
/** Length of the ring along its axis. */
export const LEN = 400 * FT;
export const HALF_L = LEN / 2;
/** Floor circumference: strip z wraps every `CIRC` units. */
export const CIRC = TAU * R_IN;

/** The zero-g hub: a drum on the spin axis (real frame), where the four lift tubes meet. */
export const HUB_R = 16;
export const HUB_L = 40;

/** Spin rate that gives 1 g at the floor: omega = sqrt(g / r), with r = 315 ft = 96 m. */
export const OMEGA = Math.sqrt(9.81 / (315 * 0.3048));
export const RPM = (OMEGA * 60) / TAU;

/** Wraps an arc-length difference into [-CIRC/2, CIRC/2], the shortest way around the ring. */
export const wrapD = (d: number): number => d - CIRC * Math.round(d / CIRC);

export interface XYZ {
  x: number;
  y: number;
  z: number;
}
/** Anything with `set(x, y, z)` that returns itself, such as a three.js `Vector3`. */
export interface SettableXYZ<T> {
  set(x: number, y: number, z: number): T;
}

/** Strip → real: a point on (or above) the floor strip to its position in the habitat. */
export function bendPoint<T>(v: XYZ, out: SettableXYZ<T>): T {
  const th = -v.z / R_IN;
  const r = R_IN - v.y;
  return out.set(v.x, -r * Math.cos(th), -r * Math.sin(th));
}

/** The real-frame "up" direction (toward the axis) at strip position z. */
export function bendUp<T>(z: number, out: SettableXYZ<T>): T {
  const th = -z / R_IN;
  return out.set(0, Math.cos(th), Math.sin(th));
}

/** Real → strip: the inverse of `bendPoint`. z comes back in (-CIRC/2, CIRC/2]. */
export function unbend<T>(v: XYZ, out: SettableXYZ<T>): T {
  const th = Math.atan2(-v.z, -v.y);
  const r = Math.hypot(v.y, v.z);
  return out.set(v.x, R_IN - r, -th * R_IN);
}
