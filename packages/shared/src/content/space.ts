import { HALF_L, type XYZ } from '../ring-space.ts';

/**
 * Level data for flying outside Ring Seven: the ship cradles in the hub, the docks on the ring, and the planets.
 *
 * Space uses its own frame (the space scene): Ring Seven sits at the origin with its spin axis on x, like the real
 * frame inside. Each planet surface is its own flat scene: x and z run across the ground, y is up.
 */

/** A ship parked in the hub. `end` is the airlock it launches through: +1 for the +x end of the hub, -1 for -x. */
export interface HubCradle {
  readonly i: number;
  readonly end: 1 | -1;
  /** Where the ship rests, in the real frame. */
  readonly pos: Readonly<XYZ>;
}

/** Four ships, two beside each airlock, one above and one below the axis. */
export const HUB_CRADLES: readonly HubCradle[] = [
  { i: 0, end: 1, pos: { x: 12, y: 9.5, z: 0 } },
  { i: 1, end: 1, pos: { x: 12, y: -9.5, z: 0 } },
  { i: 2, end: -1, pos: { x: -12, y: 9.5, z: 0 } },
  { i: 3, end: -1, pos: { x: -12, y: -9.5, z: 0 } },
];

/** You can board a ship from this close (real-frame units). */
export const BOARD_RANGE = 6.5;

/** The glowing docks just off each end cap. Flying within `DOCK_RANGE` of one brings the ship home. */
export const RING_DOCKS: readonly Readonly<XYZ>[] = [
  { x: HALF_L + 2, y: 0, z: 0 },
  { x: -HALF_L - 2, y: 0, z: 0 },
];
export const DOCK_RANGE = 45;

export interface Planet {
  readonly name: string;
  /** Center in the space frame. */
  readonly pos: Readonly<XYZ>;
  readonly r: number;
  /** Surface terrain height amplitude and spatial frequency. */
  readonly amp: number;
  readonly freq: number;
}

export const PLANETS: readonly Planet[] = [
  { name: 'EARTH', pos: { x: 5200, y: 600, z: -2600 }, r: 700, amp: 26, freq: 0.004 },
  { name: 'MARS', pos: { x: -4800, y: -500, z: 4200 }, r: 380, amp: 40, freq: 0.005 },
  { name: 'GLORP', pos: { x: 2600, y: 1600, z: 6200 }, r: 520, amp: 32, freq: 0.006 },
  { name: 'FROSTBITE', pos: { x: -1500, y: -3600, z: -5600 }, r: 300, amp: 22, freq: 0.0045 },
];

/** Flying within this far of a planet's surface lands on it. */
export const LANDING_RANGE = 40;

/** Planet surfaces: the ground is `SURFACE_SIZE` across, but ships and aliens stay inside ±`SURFACE_EDGE`. */
export const SURFACE_SIZE = 4000;
export const SURFACE_EDGE = 1800;
/** Ships can't fly lower than this above the ground. */
export const SURFACE_CLEARANCE = 4;
/** Climbing above this height leaves the planet. Above `CLIMB_WARNING` the HUD says to keep climbing. */
export const LEAVE_HEIGHT = 520;
export const CLIMB_WARNING = 380;

/** Height of a planet's ground at (x, z): a few layered waves, so it rolls without repeating too obviously. */
export function terrainHeight(p: Planet, x: number, z: number): number {
  const f = p.freq;
  return (
    p.amp *
    (Math.sin(x * f + 1.3) * Math.cos(z * f * 1.3) +
      0.5 * Math.sin((x + z) * f * 2.7) +
      0.25 * Math.sin(x * f * 6.1 - z * f * 5.3))
  );
}
