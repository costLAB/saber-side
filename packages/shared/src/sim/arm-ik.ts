import { clamp } from '../math.ts';
import type { XYZ } from '../ring-space.ts';
import { wrapAngle } from './vr-rig.ts';

// A robot arm reaching for a point: the two-bone IK that lets a Quest player's hands drive their robot's arms.
//
// It solves for the angles every robot arm already has (`RobotArm.cur` in the client, the `arm0*` / `arm1*` pose
// fields), so friends see the arms move with no change to the pose messages. The joints, as the client poses them
// (`applyArmPose` in avatar/robot.ts), all in the robot's core frame (x to its left, y up, z forward):
//
// - the shoulder turns by Rx(sw)·Rz(s·ab), and the upper arm hangs along its -y;
// - the elbow, at the end of the upper arm, turns by Rx(-el)·Rz(ez), and the forearm hangs along its -y;
// - the wrist, at the end of the forearm, turns by Rx(wr)·Rz(s·wz), and the hand points along its -y.
//
// `s` is 1 for the left arm (on the robot's +x side) and -1 for the right, so the two arms mirror each other.
// Everything here is plain numbers, so it's tested without a scene.

/** An arm's size and where it hangs, in the robot's core frame (scene units). */
export interface ArmShape {
  /** 1 for the left arm (+x), -1 for the right. */
  s: number;
  /** The shoulder joint. */
  shoulder: XYZ;
  /** Shoulder to elbow. */
  upper: number;
  /** Elbow to wrist. */
  fore: number;
  /** Wrist to where the hand holds things (the grip), along the hand. */
  hand: number;
}

/** An arm's joint angles: the `RobotArm.cur` numbers, all but the finger curl. */
export interface ArmAngles {
  ab: number;
  sw: number;
  el: number;
  ez: number;
  wr: number;
  wz: number;
}

/** What `reachFor` worked out. */
export interface ArmReach {
  angles: ArmAngles;
  /** Whether the grip lands on the target (false when it's out of the arm's reach). */
  reached: boolean;
  /** Where the elbow and the grip end up. */
  elbow: XYZ;
  grip: XYZ;
}

/** The arms as the animation leaves them at rest: the starting guess when there's no earlier pose to follow. */
export const REST_ARM: Readonly<ArmAngles> = { ab: 0.36, sw: 0.06, el: 0.45, ez: 0, wr: 0.1, wz: 0 };

/**
 * Which way elbows point while the arm reaches, for the left arm (the right mirrors it in x): down, out to the side,
 * and a little back, the way a person's do.
 */
export const ELBOW_HINT: Readonly<XYZ> = { x: 0.5, y: -1, z: -0.35 };

/** How far the wrist bends each way (radians): forward and back (`wr`), and side to side (`wz`). */
export const WRIST_BEND = 1.75;
export const WRIST_SIDE = 1.2;

/** How far the hand turns from the way it was asked toward a straight wrist, tried in turn, when the wrist can't bend. */
const BLENDS = [0.2, 0.4, 0.6, 0.8, 1];

/** How much nearer (in radians) the second way of aiming the shoulder must be before the arm takes it. */
const FLIP_SLACK = 1;

/** The arm never folds up tighter than this share of its length, so the elbow keeps a clear bend. */
const MIN_FOLD = 0.2;

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const add = (a: XYZ, b: XYZ, k = 1): V => v(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const sub = (a: XYZ, b: XYZ): V => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: XYZ, b: XYZ) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: XYZ) => Math.hypot(a.x, a.y, a.z);
const unit = (a: XYZ, fallback: XYZ): V => {
  const l = len(a);
  return l > 1e-9 ? v(a.x / l, a.y / l, a.z / l) : v(fallback.x, fallback.y, fallback.z);
};
const DOWN: XYZ = { x: 0, y: -1, z: 0 };

// Rotations about x and z (right-handed, as three.js turns things), and their inverses.
const rx = (a: number, p: XYZ): V => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
};
const rz = (a: number, p: XYZ): V => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
};

/** A joint's turn: Rx(x)·Rz(z), the way every arm joint turns (three.js's default XYZ order, with no y turn). */
interface Turn {
  x: number;
  z: number;
}
const turn = (t: Turn, p: XYZ) => rx(t.x, rz(t.z, p));
const unturn = (t: Turn, p: XYZ) => rz(-t.z, rx(-t.x, p));
const shoulderTurn = (s: number, a: ArmAngles): Turn => ({ x: a.sw, z: s * a.ab });
const elbowTurn = (a: ArmAngles): Turn => ({ x: -a.el, z: a.ez });
const wristTurn = (s: number, a: ArmAngles): Turn => ({ x: a.wr, z: s * a.wz });

/** Where an arm's elbow, wrist, and grip are for these angles, in the core frame (the forward kinematics). */
export function armJoints(arm: ArmShape, a: ArmAngles): { elbow: V; wrist: V; grip: V } {
  const sh = shoulderTurn(arm.s, a);
  const el = elbowTurn(a);
  const wr = wristTurn(arm.s, a);
  const elbow = add(arm.shoulder, turn(sh, v(0, -arm.upper, 0)));
  const wrist = add(elbow, turn(sh, turn(el, v(0, -arm.fore, 0))));
  const grip = add(wrist, turn(sh, turn(el, turn(wr, v(0, -arm.hand, 0)))));
  return { elbow, wrist, grip };
}

/** The way the hand points (wrist to grip) for these angles, in the core frame. */
export function handDirection(arm: ArmShape, a: ArmAngles): V {
  return turn(shoulderTurn(arm.s, a), turn(elbowTurn(a), turn(wristTurn(arm.s, a), DOWN)));
}

/** How far apart two sets of angles are (for picking between solutions that pose the arm the same way). */
const gap = (a: number, b: number) => Math.abs(wrapAngle(a - b));

/**
 * The shoulder angles that hang the upper arm along `dir` (a unit vector). Two pairs do it: one swings the arm
 * forward or back (|sw| up to a quarter turn), the other raises it out to the side past level, with the upper arm
 * turned half round. This keeps to the first unless the arm is already well into the second (`near`, the arm's
 * angles now), so an arm moving smoothly doesn't flip between them.
 */
function aimShoulder(s: number, dir: V, near: ArmAngles): { ab: number; sw: number } {
  const x = clamp(dir.x, -1, 1);
  const c = Math.sqrt(1 - x * x);
  const lift = Math.asin(x);
  if (c < 1e-6) return { ab: s * lift, sw: near.sw }; // straight out to the side: any swing will do
  const a = { ab: s * wrapAngle(lift), sw: Math.atan2(-dir.z, -dir.y) };
  const b = { ab: s * wrapAngle(Math.PI - lift), sw: Math.atan2(dir.z, dir.y) };
  const da = gap(a.ab, near.ab) + gap(a.sw, near.sw);
  const db = gap(b.ab, near.ab) + gap(b.sw, near.sw);
  return db < da - FLIP_SLACK ? b : a;
}

/**
 * The arm angles that bring the grip to `target` with the hand pointing along `point`, both in the robot's core
 * frame. Out of reach, the arm stretches straight toward the target, hand and all, so the robot's hand goes as near
 * as it can. `near` (the arm's current angles) keeps the answer close to where the arm already is.
 */
export function reachFor(arm: ArmShape, target: XYZ, point: XYZ, near: ArmAngles = REST_ARM): ArmReach {
  let r = reachOnce(arm, target, point, near);
  if (!r.reached && len(sub(target, arm.shoulder)) < (arm.upper + arm.fore) * 0.9999 + arm.hand) {
    // the wrist can't bend that far. Where your hand is matters more than which way it points, so turn the hand
    // toward the way a straight wrist would point it (always reachable) until the grip lands on the target
    const straight = reachOnce({ ...arm, fore: arm.fore + arm.hand, hand: 0 }, target, point, near);
    const along = unit(sub(target, straight.elbow), unit(point, DOWN));
    const want = unit(point, DOWN);
    for (const k of BLENDS) {
      const aim = unit(add(v(want.x * (1 - k), want.y * (1 - k), want.z * (1 - k)), along, k), along);
      const next = reachOnce(arm, target, aim, near);
      if (next.reached) {
        r = next;
        break;
      }
    }
  }
  return r;
}

function reachOnce(arm: ArmShape, target: XYZ, point: XYZ, near: ArmAngles): ArmReach {
  const S = arm.shoulder;
  const { upper, fore } = arm;
  const longest = (upper + fore) * 0.9999;
  const shortest = Math.max(Math.abs(upper - fore), (upper + fore) * MIN_FOLD);
  let aim = unit(point, DOWN);
  let W = add(target, aim, -arm.hand);
  let toW = sub(W, S);
  let d = len(toW);
  let reached = true;
  if (d > longest) {
    // too far: reach straight along the line to the target, and point the hand at it from the wrist
    const toT = unit(sub(target, S), unit(toW, DOWN));
    W = add(S, toT, longest);
    aim = unit(sub(target, W), toT);
    if (dot(aim, toT) < 0) aim = toT;
    toW = sub(W, S);
    d = longest;
    reached = len(sub(add(W, aim, arm.hand), target)) < 1e-6;
  } else if (d < shortest) {
    // too close to the shoulder: the wrist stays a little way out
    W = add(S, unit(toW, DOWN), shortest);
    toW = sub(W, S);
    d = shortest;
    reached = false;
  }
  const n = unit(toW, DOWN);

  // the elbow sits on the circle where the two bones meet, on the side the hint points
  const along = (upper * upper - fore * fore + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const hint = v(arm.s * ELBOW_HINT.x, ELBOW_HINT.y, ELBOW_HINT.z);
  let side = add(hint, n, -dot(hint, n));
  if (len(side) < 1e-6) side = add(v(arm.s, 0, 0), n, -dot(v(arm.s, 0, 0), n));
  side = unit(side, v(0, 0, -1));
  // a quarter of the way round the circle from `side` (times s, so the two arms swing the mirrored way)
  const turned = cross(n, side);
  const across = v(turned.x * arm.s, turned.y * arm.s, turned.z * arm.s);

  // if the wrist can't bend far enough with the elbow there, swing the elbow round the circle a little at a time
  // until it can (people's elbows do the same), and otherwise settle for the nearest the hand gets
  const tolerance = 1e-3 * (upper + fore);
  let best: { angles: ArmAngles; elbow: V; grip: V; miss: number } | null = null;
  for (const swing of SWINGS) {
    const toElbow = add(
      v(side.x * Math.cos(swing), side.y * Math.cos(swing), side.z * Math.cos(swing)),
      across,
      Math.sin(swing),
    );
    const E = add(add(S, n, along), toElbow, out);
    const angles = bend(arm, S, E, W, aim, near);
    const joints = armJoints(arm, angles);
    const miss = len(sub(joints.grip, add(W, aim, arm.hand)));
    if (!best || miss < best.miss - 1e-9) best = { angles, elbow: joints.elbow, grip: joints.grip, miss };
    if (miss < tolerance) break;
  }
  const { angles, elbow, grip } = best as NonNullable<typeof best>;
  if (reached && len(sub(grip, target)) > tolerance) reached = false;
  return { angles, reached, elbow, grip };
}

/** The elbow's swings round from where the hint puts it, tried in turn (radians): nearest first, either way. */
const SWINGS = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.3, -1.3, 1.6, -1.6];

const cross = (a: XYZ, b: XYZ): V => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

/** The joint angles for an elbow at E and a wrist at W, with the hand along `aim` (as far as the wrist bends). */
function bend(arm: ArmShape, S: XYZ, E: XYZ, W: XYZ, aim: XYZ, near: ArmAngles): ArmAngles {
  // shoulder: hang the upper arm toward the elbow
  const sh = aimShoulder(arm.s, unit(sub(E, S), DOWN), near);
  const angles: ArmAngles = { ab: sh.ab, sw: sh.sw, el: 0, ez: 0, wr: 0, wz: 0 };
  // elbow: the forearm toward the wrist, in the upper arm's frame
  const f = unturn(shoulderTurn(arm.s, angles), unit(sub(W, E), DOWN));
  angles.ez = Math.asin(clamp(f.x, -1, 1));
  angles.el = Math.atan2(f.z, -f.y);
  // wrist: the hand along `aim`, in the forearm's frame
  const h = unturn(elbowTurn(angles), unturn(shoulderTurn(arm.s, angles), aim));
  angles.wz = clamp(arm.s * Math.asin(clamp(h.x, -1, 1)), -WRIST_SIDE, WRIST_SIDE);
  angles.wr = clamp(Math.atan2(-h.z, -h.y), -WRIST_BEND, WRIST_BEND);
  return angles;
}
