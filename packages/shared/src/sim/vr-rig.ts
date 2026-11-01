import { clamp, TAU } from '../math.ts';

// The VR rig's rules: how a headset's room-scale pose maps onto a robot on the ring, and how the thumbsticks drive it.
// Plain numbers, so they're tested without a headset or a scene.
//
// Angles are in the robot's own heading convention: heading 0 faces +z on the floor strip, and a heading `h` faces
// (sin h, cos h) in (x, z), so a bigger heading is a turn to the left. The rig's "view" is the heading the player's
// play space faces: the headset looking straight ahead in the room looks along the view. Snap turns change the view;
// driving turns the robot, never the view, so the world never swings round on its own.

/** A thumbstick pushed less than this far counts as at rest. */
export const STICK_DEADZONE = 0.35;

/** How far a thumbstick must be pushed to snap-turn, and how far back it must come before it can snap again. */
export const SNAP_AT = 0.7;
export const SNAP_RESET = 0.3;

/** How far one snap turn turns the view. */
export const SNAP_TURN = Math.PI / 4;

/** How fast the robot turns to face where the stick points, in radians per second. */
export const VR_STEER_RATE = 7;

/** The rig scale (scene units per meter of the player's height) stays in this range, whatever the headset reports. */
export const RIG_SCALE_MIN = 0.8;
export const RIG_SCALE_MAX = 4;

/** A headset lower than this (in meters) hasn't been put on yet, so it's no good for measuring the player. */
export const MIN_HEAD_HEIGHT = 0.3;

/** Wraps an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  const w = a - TAU * Math.floor((a + Math.PI) / TAU);
  return w === -Math.PI ? Math.PI : w;
}

/**
 * The headset's heading relative to the view, from its forward direction in the play space (three.js cameras look
 * along -z). Straight ahead is 0, and looking left is positive.
 */
export function headYaw(forwardX: number, forwardZ: number): number {
  return Math.atan2(-forwardX, -forwardZ);
}

/**
 * The heading the robot should drive toward, for a thumbstick at (x, y) (x right, y down, as gamepads report it) and
 * a player looking along `heading`. Pushing the stick forward drives where you're looking, and pushing it right
 * drives to your right. Undefined while the stick is at rest.
 */
export function stickHeading(heading: number, x: number, y: number): number | undefined {
  if (Math.hypot(x, y) < STICK_DEADZONE) return undefined;
  return wrapAngle(heading - Math.atan2(x, -y));
}

/** Turns `from` toward `to` the short way round, by at most `maxStep`. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  return from + clamp(d, -maxStep, maxStep);
}

/**
 * A move of the headset across the play space (dx, dz in scene units, already scaled) as a move along the floor strip,
 * for a rig whose view faces `view`. The play space looks along its -z, and the view's heading faces +z on the
 * strip, so the play space is the strip turned by `view + π`.
 */
export function rigToStrip(view: number, dx: number, dz: number): { x: number; z: number } {
  const c = Math.cos(view + Math.PI);
  const s = Math.sin(view + Math.PI);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

/**
 * How many scene units each meter of the play space becomes, so that the player's eyes sit at the robot's eyes:
 * a tall grown-up and a short kid (or someone sitting down) all see the station from a robot's height.
 */
export function rigScale(robotEyeHeight: number, headHeight: number): number {
  if (!(headHeight >= MIN_HEAD_HEIGHT)) return clamp(robotEyeHeight / 1.5, RIG_SCALE_MIN, RIG_SCALE_MAX);
  return clamp(robotEyeHeight / headHeight, RIG_SCALE_MIN, RIG_SCALE_MAX);
}

/**
 * Snap turning from a thumbstick's x: returns the new view and whether the stick is armed for the next snap. A snap
 * happens once per push; the stick has to come back toward the middle before it snaps again.
 */
export function snapTurn(view: number, x: number, armed: boolean): { view: number; armed: boolean } {
  if (armed && Math.abs(x) >= SNAP_AT) return { view: wrapAngle(view - Math.sign(x) * SNAP_TURN), armed: false };
  if (!armed && Math.abs(x) <= SNAP_RESET) return { view, armed: true };
  return { view, armed };
}
