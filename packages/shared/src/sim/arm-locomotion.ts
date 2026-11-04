// Arm locomotion on the ring floor, Gorilla Tag style (docs/initiatives/quest-vr.md, PR 5): put your hands down on the
// floor and push, and the robot moves the other way, as if your hands held on to the floor. Let go while pushing and
// it carries on (a fling, capped), slowing down as it glides. Push down hard and let go, and it jumps.
//
// Everything here is in the play space: meters, and meters per second, with y up. A hand counts as on the floor when
// it's below a share of your eye height (measured when you enter VR or recenter), so a short kid and a tall grown-up
// both reach it by bending down a little, and seated mode moves it up to your lap. The VR mode (app/vr.ts) turns the
// moves into moves along the floor strip at the rig's scale. The hub isn't here: moving in zero-g is the zero-g
// swimming initiative's breaststroke.

export const ARM_LOCO = {
  /** A hand lower than this share of your eye height is on the floor (standing)... */
  contactShare: 0.33,
  /** ...and seated, this share (about your lap), since the real floor is out of reach. */
  seatedContactShare: 0.55,
  /** Once down, a hand has to rise this much more (a share of eye height) to let go, so it doesn't flicker. */
  releaseSlack: 0.04,
  /** A hand that jumps further than this in one frame (meters) lost tracking: that frame doesn't push. */
  maxStep: 0.3,
  /** How quickly the push speed is followed (per second), for the fling. */
  follow: 24,
  /** The fling's top speed across the floor, and its top speed up (meters per second). */
  flingCap: 3,
  jumpCap: 4.2,
  /**
   * A jump goes this many times faster than your push (at the rig's scale): a robot is heavy, but a push down and
   * let go should feel like a real hop, about as high as the jump button's.
   */
  jumpGain: 2.5,
  /** Pushing up faster than this as you let go jumps (meters per second). */
  jumpMin: 1.1,
  /** How fast a glide slows down (per second). */
  drag: 1.6,
  /** A glide slower than this stops (meters per second). */
  stopBelow: 0.05,
} as const;

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface ArmLoco {
  /** Whether each hand (left, right) is on the floor, and where it was last frame. */
  down: [boolean, boolean];
  last: [Point | null, Point | null];
  /** How fast the hands are pushing the body, smoothed (meters per second). */
  vel: Point;
}

export function newArmLoco(): ArmLoco {
  return { down: [false, false], last: [null, null], vel: { x: 0, y: 0, z: 0 } };
}

/** The height (meters) below which a hand is on the floor, for a player whose eyes are `eyeHeight` up. */
export function floorContact(eyeHeight: number, seated: boolean): number {
  return eyeHeight * (seated ? ARM_LOCO.seatedContactShare : ARM_LOCO.contactShare);
}

export interface ArmLocoStep {
  state: ArmLoco;
  /** How far to move the body across the floor this frame (meters, x and z). */
  move: { x: number; z: number };
  /** Set on the frame both hands leave the floor: the body's speed to carry on with (meters per second). */
  fling?: { x: number; z: number };
  /** Set with a fling when it was a push up: how fast to jump (meters per second). */
  jump?: number;
  /** Which hands touched down this frame (for a buzz). */
  touched: [boolean, boolean];
  /** Whether any hand is on the floor. */
  holding: boolean;
}

/**
 * One frame of arm locomotion: where each hand is (null if it isn't tracked), and the floor's height for your hands.
 * While a hand is down, the body moves against it; when the last one lets go, it flings.
 */
export function armLocoStep(s: ArmLoco, hands: (Point | null)[], contact: number, dt: number): ArmLocoStep {
  const down: [boolean, boolean] = [false, false];
  const touched: [boolean, boolean] = [false, false];
  let mx = 0;
  let my = 0;
  let mz = 0;
  let pushing = 0;
  for (let i = 0; i < 2; i++) {
    const h = hands[i] ?? null;
    if (!h) continue;
    const was = s.down[i] as boolean;
    down[i] = h.y < contact + (was ? ARM_LOCO.releaseSlack * (contact / ARM_LOCO.contactShare) : 0);
    if (!down[i]) continue;
    if (!was) touched[i] = true;
    const prev = s.last[i];
    if (!was || !prev) continue;
    const dx = h.x - prev.x;
    const dy = h.y - prev.y;
    const dz = h.z - prev.z;
    if (Math.hypot(dx, dy, dz) > ARM_LOCO.maxStep) continue;
    mx -= dx;
    my -= dy;
    mz -= dz;
    pushing++;
  }
  if (pushing > 1) {
    mx /= pushing;
    my /= pushing;
    mz /= pushing;
  }
  const holding = down[0] || down[1];
  const k = dt > 0 ? 1 - Math.exp(-ARM_LOCO.follow * dt) : 0;
  const vel = holding
    ? dt > 0
      ? {
          x: s.vel.x + (mx / dt - s.vel.x) * k,
          y: s.vel.y + (my / dt - s.vel.y) * k,
          z: s.vel.z + (mz / dt - s.vel.z) * k,
        }
      : s.vel
    : { x: 0, y: 0, z: 0 };
  const state: ArmLoco = {
    down,
    last: [hands[0] ? { ...(hands[0] as Point) } : null, hands[1] ? { ...(hands[1] as Point) } : null],
    vel,
  };
  const out: ArmLocoStep = { state, move: { x: mx, z: mz }, touched, holding };
  if (!holding && (s.down[0] || s.down[1])) {
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const f = speed > ARM_LOCO.flingCap ? ARM_LOCO.flingCap / speed : 1;
    out.fling = { x: s.vel.x * f, z: s.vel.z * f };
    if (s.vel.y > ARM_LOCO.jumpMin) out.jump = Math.min(s.vel.y, ARM_LOCO.jumpCap);
  }
  return out;
}

/** A glide slowing down over `dt` seconds (any units). Stops once it's slow. */
export function glide(
  v: { x: number; z: number },
  dt: number,
  stopBelow: number = ARM_LOCO.stopBelow,
): { x: number; z: number } {
  const k = Math.exp(-ARM_LOCO.drag * dt);
  const x = v.x * k;
  const z = v.z * k;
  return Math.hypot(x, z) < stopBelow ? { x: 0, z: 0 } : { x, z };
}
