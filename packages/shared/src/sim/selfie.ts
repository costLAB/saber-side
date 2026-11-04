import { clamp } from '../math.ts';

// The Selfie: a look at your own robot, on every device (docs/initiatives/quest-vr.md, PR 9).
//
// - Flat (iPad, Mac): the chase camera swaps for one that orbits the robot, starting in front of it, looking back at
//   it. Dragging or the arrow keys turn it round and tilt it, and the robot drives nothing until you leave.
// - VR: a small live copy of your robot (the "mini-me") floats in front of you. The stick or a grabbed hand spins and
//   tilts it. The camera never moves, so it doesn't make you sick.
//
// Both keep an orbit: a turn round the robot (0 is in front of it, looking back at it; a bigger turn goes round to
// the robot's left) and a tilt (0 is level, up is positive). Angles are in the robot's heading convention (vr-rig.ts).

export interface Orbit {
  /** Round the robot, from its front. */
  turn: number;
  /** Up from level. */
  tilt: number;
  /** How far the flat camera stands back, as a multiple of `SELFIE.distance`. */
  zoom: number;
}

export const SELFIE = {
  /** The flat camera's distance from the robot's middle, in scene units, at zoom 1. */
  distance: 5.2,
  /** Where the flat camera looks: this high above the robot's wheel (scene units). */
  lookHeight: 1.4,
  /** It starts a little above level, so the face and the top of the body both show. */
  startTilt: 0.18,
  tiltMin: -0.35,
  tiltMax: 1.2,
  zoomMin: 0.55,
  zoomMax: 2.2,
  /** Arrow keys (or a stick) turn the orbit this fast, in radians per second. */
  turnRate: 1.8,
  /** Dragging turns it this far per pixel. */
  dragTurn: 0.008,
  dragTilt: 0.006,
  /** VR: the mini-me's size against the robot's own, how far in front of your eyes it floats, and how far below. */
  miniScale: 0.25,
  miniAhead: 0.5,
  miniBelow: 0.15,
  /** VR: the mini-me's middle is this high above its wheel, as a share of the robot's eye height. */
  miniMiddle: 0.55,
  /** VR: a hand reaching this close to the mini-me's middle (meters) grabs it instead of the world. */
  miniReach: 0.22,
  /** VR: the mini-me tilts no further than this either way. */
  miniTiltMax: 1.2,
} as const;

/** A fresh orbit: in front of the robot, a little above level. */
export function openOrbit(): Orbit {
  return { turn: 0, tilt: SELFIE.startTilt, zoom: 1 };
}

/** Turns and tilts an orbit (the tilt stays within its limits). */
export function turnOrbit(o: Orbit, dTurn: number, dTilt: number): Orbit {
  return { turn: o.turn + dTurn, tilt: clamp(o.tilt + dTilt, SELFIE.tiltMin, SELFIE.tiltMax), zoom: o.zoom };
}

/** Zooms an orbit in (< 1) or out (> 1). */
export function zoomOrbit(o: Orbit, factor: number): Orbit {
  return { ...o, zoom: clamp(o.zoom * factor, SELFIE.zoomMin, SELFIE.zoomMax) };
}

/**
 * One frame of arrow keys (or a stick): x turns the orbit (right is positive, going round to the robot's right), and
 * y tilts it (up is positive).
 */
export function steerOrbit(o: Orbit, x: number, y: number, dt: number): Orbit {
  return turnOrbit(o, -x * SELFIE.turnRate * dt, y * SELFIE.turnRate * 0.6 * dt);
}

/**
 * Where the flat camera stands, in the robot's own frame (x to its left, y up from its wheel, z ahead of it), for a
 * robot facing +z. It looks at (0, lookHeight, 0).
 */
export function orbitOffset(o: Orbit): { x: number; y: number; z: number } {
  const d = SELFIE.distance * o.zoom;
  const level = d * Math.cos(o.tilt);
  return { x: Math.sin(o.turn) * level, y: SELFIE.lookHeight + d * Math.sin(o.tilt), z: Math.cos(o.turn) * level };
}

/** Rotates a point in the robot's frame to the floor strip, for a robot with heading `yaw` (vr-rig.ts convention). */
export function robotToStrip(p: { x: number; y: number; z: number }, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

/** The mini-me's turn and tilt, after one frame of a stick (x spins it, y tilts it) in VR. */
export function spinMini(o: Orbit, x: number, y: number, dt: number): Orbit {
  return {
    turn: o.turn + x * SELFIE.turnRate * dt,
    tilt: clamp(o.tilt - y * SELFIE.turnRate * 0.6 * dt, -SELFIE.miniTiltMax, SELFIE.miniTiltMax),
    zoom: o.zoom,
  };
}

/** A hand's turn and tilt since it grabbed the mini-me, added to where the mini-me was then. */
export function twistMini(start: Orbit, dTurn: number, dTilt: number): Orbit {
  return {
    turn: start.turn + dTurn,
    tilt: clamp(start.tilt + dTilt, -SELFIE.miniTiltMax, SELFIE.miniTiltMax),
    zoom: start.zoom,
  };
}
