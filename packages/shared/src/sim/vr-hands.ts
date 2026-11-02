import { clamp } from '../math.ts';
import type { XYZ } from '../ring-space.ts';
import { distance } from '../vec3.ts';

// What a Quest player's hands are doing: how far the robot's fingers curl, whether a tracked hand is pinching or
// making a fist, and whether a carrot has come up to the mouth. Plain numbers (play-space meters), so it's tested
// without a headset. The arm angles themselves come from sim/arm-ik.ts.

/** The finger curl for a controller's grip and trigger (each 0 to 1): open at rest, closed on a full squeeze. */
export function controllerCurl(grip: number, trigger: number): number {
  return clamp(0.15 + 0.85 * Math.max(grip, 0.6 * trigger), 0, 1);
}

/** The curl while the hand holds something: always a firm grip. */
export const HOLD_CURL = 0.8;

/** A tracked hand's fingertips, measured from its wrist (meters), from the joint poses. */
export interface HandJoints {
  wrist: XYZ;
  thumbTip: XYZ;
  indexTip: XYZ;
  middleTip: XYZ;
  ringTip: XYZ;
  pinkyTip: XYZ;
}

/** Thumb and index tips closer than this pinch; they let go once farther than PINCH_OFF. */
export const PINCH_ON = 0.02;
export const PINCH_OFF = 0.035;

/**
 * Fingertips (the four fingers) closer to the wrist than this, on average, make a fist; it opens once they're
 * farther than FIST_OFF. An open hand's are about 0.18 m out, a fist's under 0.09.
 */
export const FIST_ON = 0.1;
export const FIST_OFF = 0.12;
const OPEN_REACH = 0.18;
const FIST_REACH = 0.08;

export interface HandGesture {
  pinch: boolean;
  fist: boolean;
  /** How far the fingers are curled, 0 (open) to 1 (a fist), for the robot's fingers. */
  curl: number;
}

export const OPEN_HAND: Readonly<HandGesture> = { pinch: false, fist: false, curl: 0 };

/**
 * A tracked hand's gesture. A fist grabs and a pinch uses. Each has a little slack between closing and opening, so a
 * hand held near the edge doesn't flicker; `was` is the last frame's gesture.
 */
export function handGesture(j: HandJoints, was: HandGesture = OPEN_HAND): HandGesture {
  const pinchGap = distance(j.thumbTip, j.indexTip);
  const reach =
    (distance(j.indexTip, j.wrist) +
      distance(j.middleTip, j.wrist) +
      distance(j.ringTip, j.wrist) +
      distance(j.pinkyTip, j.wrist)) /
    4;
  const fist = reach < (was.fist ? FIST_OFF : FIST_ON);
  // a fist squeezes the thumb against the fingers too, which is no pinch
  const pinch = !fist && pinchGap < (was.pinch ? PINCH_OFF : PINCH_ON);
  const curl = clamp((OPEN_REACH - reach) / (OPEN_REACH - FIST_REACH), 0, 1);
  return { pinch, fist, curl: pinch ? Math.max(curl, 0.4) : curl };
}

/** Where your mouth is: this far below your eyes and in front of them (meters, in the headset's own frame). */
export const MOUTH_BELOW = 0.08;
export const MOUTH_AHEAD = 0.06;

/** A carrot whose hand comes nearer the mouth than this takes a bite; it must go back past MOUTH_OFF for the next. */
export const MOUTH_ON = 0.22;
export const MOUTH_OFF = 0.3;

/** The mouth, from the headset's position and its down and forward directions (unit vectors) in the play space. */
export function mouthPoint(head: XYZ, down: XYZ, forward: XYZ): XYZ {
  return {
    x: head.x + down.x * MOUTH_BELOW + forward.x * MOUTH_AHEAD,
    y: head.y + down.y * MOUTH_BELOW + forward.y * MOUTH_AHEAD,
    z: head.z + down.z * MOUTH_BELOW + forward.z * MOUTH_AHEAD,
  };
}

/** Whether the hand holding a carrot is at the mouth, with slack so it doesn't flicker; `was` is the last frame's. */
export function atMouth(hand: XYZ, mouth: XYZ, was: boolean): boolean {
  return distance(hand, mouth) < (was ? MOUTH_OFF : MOUTH_ON);
}

/** A grabbing hand reaches items this close to the robot's grip (scene units: about 0.45 m on a grown-up). */
export const HAND_REACH = 1.25;

/** A dropped item flies off with the hand's speed, up to this (scene units per second). */
export const THROW_MAX = 14;

/** Haptic pulses (intensity 0 to 1, and milliseconds). */
export const HAPTICS = {
  pickUp: { intensity: 0.5, ms: 40 },
  drop: { intensity: 0.3, ms: 30 },
  /** Repeated while a saber is lit, scaled by how lit it is. */
  saberHum: { intensity: 0.08, ms: 120, every: 0.1 },
  blasterKick: { intensity: 0.8, ms: 50 },
} as const;
