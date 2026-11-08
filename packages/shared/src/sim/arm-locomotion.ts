import { type Point, pushOut, type TouchFn } from './solids.ts';

// Arm locomotion on the ring floor, the way Gorilla Tag does it (docs/initiatives/quest-vr.md, PRs 5 and 10). The
// robot has long arms, and its hands can't go into anything solid: the floor, walls, trees, posts, tabletops
// (sim/solids.ts). A hand that touches something holds on where it touched; move it, and the robot moves the other
// way. Pull back along the floor to run, pull down on a wall or a tree to climb it, shove down to rise, and push off
// to leap. Let go, and the robot flies on at the speed your hands were moving it, through the air under gravity, until
// it lands, or a hand catches hold again. That's the only way to walk: the sticks only turn you (unless the comfort
// setting hands walking back to the stick).
//
// Two spaces meet here:
// - your room (the play space): meters, y up. Your hands are stretched out from your neck (`longArm`), so a hand at
//   about knee height reaches the floor. Seated, they stretch further, to reach it from your lap.
// - the floor strip (the robot's world): scene units, y up from the floor. The VR mode (app/vr.ts) puts your
//   stretched hands there, at the rig's scale (`scale`, scene units per meter), and the hands hold on in it, so a held
//   hand stays put while the robot moves, and the robot's arms reach for it.
//
// The speeds and gravity are Gorilla Tag's own, in meters of your room, so the robot moves as fast for your arms as a
// gorilla does, whatever your size. The hub isn't here: moving in zero-g is the zero-g swimming initiative's.

export const ARM_LOCO = {
  /** Your neck is this share of your eye height below your eyes. Your hands stretch out from there. */
  neckDrop: 0.15,
  /** How far your hands stretch from your neck: standing (a hand at about knee height reaches the floor)... */
  stretch: 1.6,
  /** ...and seated (a hand at about your lap reaches it). */
  seatedStretch: 2.4,
  /** How much longer than as built the robot's arms are in VR, so they reach your stretched hands. */
  armLength: 1.8,
  /** How far a robot's grip stays from anything solid: its hand, as a ball (scene units). */
  handRest: 0.12,
  /** A held hand has to come this far away from what it holds (meters, stretched) before it lets go. */
  releaseSlack: 0.02,
  /**
   * A held hand that ends up this far from where it holds (meters, stretched) lets go: it lost tracking, or the robot
   * couldn't follow it (a wall in the way).
   */
  unstick: 0.6,
  /** Letting go, the robot flies on at its average speed over this long (seconds), as Gorilla Tag does. */
  window: 0.1,
  /** Letting go slower than this (meters per second of your room) just stops: Gorilla Tag's velocity limit... */
  releaseMin: 0.3,
  /** ...faster, and the robot flies on this many times as fast (its jump multiplier)... */
  releaseGain: 1.1,
  /** ...but no faster than this (meters per second of your room): its top jump speed. */
  releaseCap: 6.5,
  /** Gravity for a robot played in VR (meters per second per second of your room): Earth's, for your body. */
  gravity: 9.8,
  /** How fast a glide slows down once the robot's back on its wheel (per second). Up in the air it doesn't. */
  drag: 4,
  /** A glide slower than this stops (scene units per second). */
  stopBelow: 0.07,
} as const;

/** How far your hands stretch from your neck. */
export function armStretch(seated: boolean): number {
  return seated ? ARM_LOCO.seatedStretch : ARM_LOCO.stretch;
}

/** Where your neck is, in your room: what your hands stretch out from. `eyeHeight` is measured when you enter VR. */
export function armPivot(head: Point, eyeHeight: number): Point {
  return { x: head.x, y: head.y - eyeHeight * ARM_LOCO.neckDrop, z: head.z };
}

/** Where the robot's long arm puts your hand: `stretch` times as far from your neck. */
export function longArm(hand: Point, pivot: Point, stretch: number): Point {
  return {
    x: pivot.x + (hand.x - pivot.x) * stretch,
    y: pivot.y + (hand.y - pivot.y) * stretch,
    z: pivot.z + (hand.z - pivot.z) * stretch,
  };
}

/** Where your hand is for the robot's long arm to reach `reach` (the other way round from `longArm`). */
export function shortArm(reach: Point, pivot: Point, stretch: number): Point {
  return longArm(reach, pivot, 1 / stretch);
}

/**
 * How high your hand is (meters) when it reaches the floor, standing straight up (or sitting) with the robot on the
 * floor: about knee height standing, and your lap seated.
 */
export function floorContact(eyeHeight: number, seated: boolean): number {
  return eyeHeight * (1 - ARM_LOCO.neckDrop) * (1 - 1 / armStretch(seated));
}

/** Gravity on a robot played in VR (scene units per second per second), at the rig's scale. */
export function vrGravity(scale: number): number {
  return ARM_LOCO.gravity * scale;
}

/** Where a hand holds on: a spot on a surface, and the way out of it there (a unit vector). */
export interface Hold {
  at: Point;
  normal: Point;
}

/** One frame's move of the body (scene units), and how long the frame was (seconds). */
export interface ArmMove extends Point {
  dt: number;
}

export interface ArmLoco {
  /** Where each hand (left, right) holds on, or null while it's free. */
  hold: [Hold | null, Hold | null];
  /** How the hands moved the body over the last `window` seconds of holding on, oldest first. */
  recent: ArmMove[];
}

export function newArmLoco(): ArmLoco {
  return { hold: [null, null], recent: [] };
}

/** The body's average speed over its recent moves (scene units per second). */
export function armSpeed(recent: readonly ArmMove[]): Point {
  let x = 0;
  let y = 0;
  let z = 0;
  let t = 0;
  for (const m of recent) {
    x += m.x;
    y += m.y;
    z += m.z;
    t += m.dt;
  }
  return t > 0 ? { x: x / t, y: y / t, z: z / t } : { x: 0, y: 0, z: 0 };
}

/**
 * How fast the robot flies on when its hands let go, from its recent speed (scene units per second): Gorilla Tag's
 * rule. Under the limit it just stops; over it, it goes a little faster than it was moving, up to the cap.
 */
export function releaseSpeed(v: Point, scale: number): Point {
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed <= ARM_LOCO.releaseMin * scale) return { x: 0, y: 0, z: 0 };
  const k = Math.min(ARM_LOCO.releaseGain, (ARM_LOCO.releaseCap * scale) / speed);
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export interface ArmLocoStep {
  state: ArmLoco;
  /** How far to move the body this frame (scene units). */
  move: Point;
  /** Where each hand is drawn after the move: on the surface it holds, or where it reaches, never inside anything. */
  hands: [Point | null, Point | null];
  /** Set on the frame the last hand lets go: how fast the body flies on (scene units per second). */
  fling?: Point;
  /** Which hands touched something this frame (for a buzz). */
  touched: [boolean, boolean];
  /** Whether any hand holds on. */
  holding: boolean;
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * One frame of arm locomotion. `hands` are where your stretched hands reach on the floor strip this frame, with the
 * body where it is now (null for a hand that isn't tracked); `touch` finds what's solid (sim/solids.ts); `scale` is
 * the rig's scene units per meter.
 *
 * A free hand that goes into something touches it and holds on there. While it holds, the body moves so the hand stays
 * put: the hand pushes the body away from the surface and drags it along the surface, but never pulls it in. Two hands
 * share the move. A hand lets go when it comes away from the surface. When the last one lets go, the body flies on.
 */
export function armLocoStep(
  s: ArmLoco,
  hands: (Point | null)[],
  touch: TouchFn,
  scale: number,
  dt: number,
): ArmLocoStep {
  const slack = ARM_LOCO.releaseSlack * scale;
  const unstick = ARM_LOCO.unstick * scale;
  const touched: [boolean, boolean] = [false, false];
  const normals: [Point | null, Point | null] = [null, null];
  const anchors: [Point | null, Point | null] = [null, null];
  let mx = 0;
  let my = 0;
  let mz = 0;
  let pulling = 0;
  for (let i = 0; i < 2; i++) {
    const h = hands[i] ?? null;
    if (!h) continue;
    const held = s.hold[i];
    let pull: Point;
    if (held) {
      const d = { x: h.x - held.at.x, y: h.y - held.at.y, z: h.z - held.at.z };
      const out = dot(d, held.normal);
      // pulled away from the surface (or lost): let go, without a pull
      if (out > slack || Math.hypot(d.x, d.y, d.z) > unstick) continue;
      // the surface pushes the body out and drags it along, but a hand coming away doesn't pull the body in
      const n = held.normal;
      const back = Math.max(0, out);
      pull = { x: -d.x + n.x * back, y: -d.y + n.y * back, z: -d.z + n.z * back };
      normals[i] = n;
      anchors[i] = held.at;
    } else {
      const c = touch(h);
      if (!c) continue;
      touched[i] = true;
      const n = c.normal;
      pull = { x: n.x * c.depth, y: n.y * c.depth, z: n.z * c.depth };
      normals[i] = n;
      anchors[i] = { x: h.x + pull.x, y: h.y + pull.y, z: h.z + pull.z };
    }
    mx += pull.x;
    my += pull.y;
    mz += pull.z;
    pulling++;
  }
  if (pulling > 1) {
    mx /= pulling;
    my /= pulling;
    mz /= pulling;
  }
  const move = { x: mx, y: my, z: mz };
  // where each hand is drawn: a held one on its surface (two hands pulling different ways slide a little), a free one
  // where it reaches, pushed out of anything it's in
  const drawn = hands.map((h, i) => {
    if (!h) return null;
    const q = { x: h.x + mx, y: h.y + my, z: h.z + mz };
    const n = normals[i];
    const a = anchors[i];
    if (!n || !a) return pushOut(q, touch);
    const off = dot({ x: q.x - a.x, y: q.y - a.y, z: q.z - a.z }, n);
    return { x: q.x - n.x * off, y: q.y - n.y * off, z: q.z - n.z * off };
  }) as [Point | null, Point | null];
  const hold = drawn.map((d, i) => {
    const n = normals[i];
    return d && n ? { at: d, normal: n } : null;
  }) as ArmLoco['hold'];
  const holding = pulling > 0;
  // keep this frame's move, and as many before it as fill the window
  const recent: ArmMove[] = [];
  if (holding) {
    recent.push({ x: mx, y: my, z: mz, dt });
    let t = dt;
    for (let i = s.recent.length - 1; i >= 0 && t < ARM_LOCO.window; i--) {
      const m = s.recent[i] as ArmMove;
      recent.unshift(m);
      t += m.dt;
    }
  }
  const out: ArmLocoStep = { state: { hold, recent }, move, hands: drawn, touched, holding };
  if (!holding && (s.hold[0] || s.hold[1])) out.fling = releaseSpeed(armSpeed(s.recent), scale);
  return out;
}

/**
 * A glide over `dt` seconds (scene units per second): it slows down on the robot's wheel, and keeps its speed up in
 * the air. Stops once it's slow.
 */
export function glide(v: { x: number; z: number }, dt: number, airborne = false): { x: number; z: number } {
  if (airborne) return v;
  const k = Math.exp(-ARM_LOCO.drag * dt);
  const x = v.x * k;
  const z = v.z * k;
  return Math.hypot(x, z) < ARM_LOCO.stopBelow ? { x: 0, z: 0 } : { x, z };
}
