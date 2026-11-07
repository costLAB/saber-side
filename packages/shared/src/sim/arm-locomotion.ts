// Arm locomotion on the ring floor, Gorilla Tag style (docs/initiatives/quest-vr.md, PRs 5 and 10): the robot has
// long arms, and its hands can't go through the floor. Put a hand down and it holds on where it lands; move it, and
// the robot moves the other way. Pull back to run, shove down to rise off the floor, and let go to fly on at the speed
// you were pushing. Jumps and flings keep their speed in the air and slow down once the robot rolls on the floor.
//
// Two spaces meet here:
// - your room (the play space): meters, y up. Your hands are stretched out from your neck (`longArm`), so a hand at
//   about knee height reaches the floor, the way a gorilla's does. Seated, they stretch further, to reach it from
//   your lap.
// - the floor strip (the robot's world): scene units, y up from the floor. The VR mode (app/vr.ts) puts your
//   stretched hands there, at the rig's scale, and the hands hold on to the floor in it, so a held hand stays put
//   while the robot moves, and the robot's arms reach for it.
//
// The hub isn't here: moving in zero-g is the zero-g swimming initiative's breaststroke.

export const ARM_LOCO = {
  /** Your neck is this share of your eye height below your eyes. Your hands stretch out from there. */
  neckDrop: 0.15,
  /** How far your hands stretch from your neck: standing (a hand at about knee height reaches the floor)... */
  stretch: 1.6,
  /** ...and seated (a hand at about your lap reaches it). */
  seatedStretch: 2.4,
  /** How much longer than as built the robot's arms are in VR, so they reach your stretched hands. */
  armLength: 1.8,
  /** How high a robot's grip sits when its hand rests on the floor (scene units). */
  handRest: 0.12,
  /** A held hand has to rise this much (meters, stretched) before it lets go, so it doesn't flicker. */
  releaseSlack: 0.02,
  /**
   * A held hand that ends up this far from where it holds (meters, stretched) lets go: it lost tracking, or the robot
   * couldn't follow it (a wall in the way).
   */
  unstick: 0.4,
  /**
   * A fling goes at the body's average speed over this long before letting go (seconds), so the hand slowing down at
   * the end of a stroke doesn't spoil it.
   */
  window: 0.1,
  /** The fling's top speed across the floor (scene units per second): a little over the robot's top driving speed. */
  flingCap: 9,
  /** Rising faster than this as you let go jumps (scene units per second)... */
  jumpMin: 2,
  /** ...this many times as fast as you were rising... */
  jumpGain: 1.5,
  /** ...and no faster than this (scene units per second), about a third more than the jump button's. */
  jumpCap: 14,
  /** How fast a glide across the floor slows down (per second). Up in the air it doesn't. */
  drag: 1.6,
  /** A glide slower than this stops (scene units per second). */
  stopBelow: 0.07,
} as const;

export interface Point {
  x: number;
  y: number;
  z: number;
}

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

/** One frame's move of the body (scene units), and how long the frame was (seconds). */
export interface ArmMove extends Point {
  dt: number;
}

export interface ArmLoco {
  /** Where each hand (left, right) holds on to the floor (scene units), or null when it's off the floor. */
  hold: [Point | null, Point | null];
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

export interface ArmLocoStep {
  state: ArmLoco;
  /** How far to move the body this frame (scene units): across the floor, and up. */
  move: Point;
  /** Where each hand is drawn after the move: where it holds on, or where it reaches, never through the floor. */
  hands: [Point | null, Point | null];
  /** Set on the frame both hands leave the floor: the body's speed to carry on with (scene units per second). */
  fling?: { x: number; z: number };
  /** Set with a fling when the body was rising fast: how fast to jump (scene units per second). */
  jump?: number;
  /** Which hands touched down this frame (for a buzz). */
  touched: [boolean, boolean];
  /** Whether any hand holds on to the floor. */
  holding: boolean;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/**
 * One frame of arm locomotion. `hands` are where your stretched hands reach on the floor strip this frame, with the
 * body where it is now (null for a hand that isn't tracked); `scale` is the rig's scene units per meter.
 *
 * A hand reaching below the floor touches down and holds on there. While it holds, the body moves so the hand stays
 * put: pulling the hand back moves the body forward, and pushing it down lifts the body. The hand lets go when it
 * rises off the floor. When the last one lets go, the body flings on at the speed it was moving (on average, over the
 * last tenth of a second), and jumps if it was rising fast.
 */
export function armLocoStep(s: ArmLoco, hands: (Point | null)[], scale: number, dt: number): ArmLocoStep {
  const rest = ARM_LOCO.handRest;
  const slack = ARM_LOCO.releaseSlack * scale;
  const unstick = ARM_LOCO.unstick * scale;
  const touched: [boolean, boolean] = [false, false];
  const held: [boolean, boolean] = [false, false];
  let mx = 0;
  let my = 0;
  let mz = 0;
  let pulling = 0;
  for (let i = 0; i < 2; i++) {
    const h = hands[i] ?? null;
    if (!h) continue;
    const at = s.hold[i];
    let pull: Point;
    if (at) {
      // lifted off the floor (or lost): let go, without a pull
      if (h.y > at.y + slack || Math.hypot(h.x - at.x, h.y - at.y, h.z - at.z) > unstick) continue;
      pull = sub(at, h);
    } else if (h.y < rest) {
      touched[i] = true;
      pull = { x: 0, y: rest - h.y, z: 0 };
    } else continue;
    held[i] = true;
    mx += pull.x;
    // the floor only pushes up: a hand rising within the slack doesn't drag the body down
    my += Math.max(0, pull.y);
    mz += pull.z;
    pulling++;
  }
  if (pulling > 1) {
    mx /= pulling;
    my /= pulling;
    mz /= pulling;
  }
  const move = { x: mx, y: my, z: mz };
  const drawn = hands.map((h) => (h ? { x: h.x + mx, y: Math.max(rest, h.y + my), z: h.z + mz } : null)) as [
    Point | null,
    Point | null,
  ];
  // a held hand holds on where it's drawn (two hands pulling different ways slide a little), at the floor
  const hold = drawn.map((d, i) => (d && held[i] ? { x: d.x, y: rest, z: d.z } : null)) as ArmLoco['hold'];
  const holding = held[0] || held[1];
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
  if (!holding && (s.hold[0] || s.hold[1])) {
    const vel = armSpeed(s.recent);
    const speed = Math.hypot(vel.x, vel.z);
    const f = speed > ARM_LOCO.flingCap ? ARM_LOCO.flingCap / speed : 1;
    out.fling = { x: vel.x * f, z: vel.z * f };
    if (vel.y > ARM_LOCO.jumpMin) out.jump = Math.min(vel.y * ARM_LOCO.jumpGain, ARM_LOCO.jumpCap);
  }
  return out;
}

/**
 * A glide over `dt` seconds (scene units per second): it slows down on the floor, and keeps its speed up in the air.
 * Stops once it's slow.
 */
export function glide(v: { x: number; z: number }, dt: number, airborne = false): { x: number; z: number } {
  if (airborne) return v;
  const k = Math.exp(-ARM_LOCO.drag * dt);
  const x = v.x * k;
  const z = v.z * k;
  return Math.hypot(x, z) < ARM_LOCO.stopBelow ? { x: 0, z: 0 } : { x, z };
}
