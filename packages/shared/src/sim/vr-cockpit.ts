import { clamp, lerp } from '../math.ts';
import { BOOST, BRAKE_SPACE, BRAKE_SURFACE, CRUISE_SPACE, CRUISE_SURFACE } from './ship.ts';
import type { Point } from './solids.ts';
import { wrapAngle } from './vr-rig.ts';

// Flying a ship from the cockpit in VR (docs/initiatives/quest-vr.md, PR 7): you sit in the pilot's seat, and fly by
// grabbing a joystick by your right hand and a throttle by your left, like a real ship. The rules for turning the
// grabbed controls into the ship's input are here, and they feed the same ship controls the arrow keys do
// (sim/ship.ts), so the ship flies exactly as it would from a keyboard.
//
// Everything is in the cockpit's frame, in meters: x to your right, y up, z toward you (the ship's nose is -z, the
// way you face), measured from where your head was when you sat down.

export const COCKPIT = {
  /** Where the joystick's knob and the throttle's handle rest, from your head (meters). */
  stick: { x: 0.2, y: -0.45, z: -0.3 },
  throttle: { x: -0.24, y: -0.45, z: -0.28 },
  /** A hand gripping within this distance of a control's handle (meters) takes hold of it. */
  reach: 0.13,
  /** Moving the knob this far (meters) tilts the stick all the way. */
  tiltFull: 0.08,
  /** Twisting your hand this far (radians) twists the stick all the way. */
  twistFull: 0.6,
  /** A tilt or twist smaller than this share of full does nothing, so a resting hand doesn't drift the ship. */
  deadZone: 0.12,
  /** The throttle's handle travels this far (meters) from all the way back to all the way forward. */
  throttleTravel: 0.22,
  /** Where the throttle starts when you sit down: cruising. */
  throttleStart: 0.5,
} as const;

function dead(v: number): number {
  const a = Math.abs(v);
  if (a <= COCKPIT.deadZone) return 0;
  return Math.sign(v) * Math.min(1, (a - COCKPIT.deadZone) / (1 - COCKPIT.deadZone));
}

/**
 * The joystick, held: how far the hand has moved the knob from where it was grabbed (meters, cockpit frame), and
 * how far the hand has twisted (radians, positive to the left). Pushing it forward dives (pitch down), pulling it back
 * climbs; tilting it or twisting it to the left turns left. Returns the ship's pitch and turn, -1 to 1, and how far
 * the knob is tilted (for drawing it).
 */
export function stickInput(moved: Point, twist: number) {
  const fwd = clamp(-moved.z / COCKPIT.tiltFull, -1, 1);
  const side = clamp(moved.x / COCKPIT.tiltFull, -1, 1);
  const tw = clamp(wrapAngle(twist) / COCKPIT.twistFull, -1, 1);
  return {
    pitch: 0 - dead(fwd),
    turn: clamp(dead(tw) - dead(side), -1, 1),
    tilt: { fwd, side, twist: tw },
  };
}

/** The throttle, held: where it was when grabbed (0 back to 1 forward), and how far the hand has moved since (z). */
export function throttleInput(start: number, movedZ: number): number {
  return clamp(start - movedZ / COCKPIT.throttleTravel, 0, 1);
}

/**
 * The ship's speed for a throttle setting: all the way back it brakes (to a stop in space, a hover over a planet),
 * half way it cruises as it does from the keyboard, and all the way forward it boosts.
 */
export function throttleSpeed(throttle: number, surface: boolean): number {
  const brake = surface ? BRAKE_SURFACE : BRAKE_SPACE;
  const cruise = surface ? CRUISE_SURFACE : CRUISE_SPACE;
  const t = clamp(throttle, 0, 1);
  return t <= 0.5 ? lerp(brake, cruise, t / 0.5) : lerp(cruise, cruise * BOOST, (t - 0.5) / 0.5);
}

/** Whether a hand at `hand` can take hold of a control resting at `at` (both from your head, meters). */
export function withinReach(hand: Point, at: Point): boolean {
  return Math.hypot(hand.x - at.x, hand.y - at.y, hand.z - at.z) <= COCKPIT.reach;
}
