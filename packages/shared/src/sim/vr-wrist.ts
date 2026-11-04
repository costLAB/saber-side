// The wrist panel and the world-space signs in VR (docs/initiatives/quest-vr.md, PR 3): when the panel faces your
// eyes it shows, and a fingertip pressing into it presses the button under it. Plain numbers, so they're tested
// without a headset.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const WRIST = {
  /** The panel shows once it faces your eyes this squarely (the cosine of the angle)... */
  showFacing: 0.6,
  /** ...and hides once it turns away past this. */
  hideFacing: 0.4,
  /** A fingertip within this depth of the panel's face (meters, either side) is touching it. */
  touchDepth: 0.025,
  /** It has to come this far off the panel (meters) before it can press again. */
  releaseDepth: 0.05,
  /** The panel's size (meters). */
  width: 0.18,
  height: 0.12,
  /** How far ahead of the controller's grip the fingertip is (meters). */
  tipAhead: 0.06,
} as const;

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Whether the panel (facing along `normal`, at `at`) faces eyes at `head`, with slack so it doesn't flicker. */
export function wristFacing(normal: V3, at: V3, head: V3, shown: boolean): boolean {
  const to = { x: head.x - at.x, y: head.y - at.y, z: head.z - at.z };
  const len = Math.hypot(to.x, to.y, to.z);
  if (len < 1e-6) return shown;
  const c = dot(normal, to) / len / (Math.hypot(normal.x, normal.y, normal.z) || 1);
  return c >= (shown ? WRIST.hideFacing : WRIST.showFacing);
}

/** A rectangle on the panel, in its own 0-1 coordinates (u right, v down). */
export interface Rect {
  u: number;
  v: number;
  w: number;
  h: number;
}

/**
 * Where a fingertip touches the panel: `local` is the tip in the panel's frame (meters: x right, y up, z out of its
 * face). Returns the 0-1 spot (u right, v down) while it's within the touch depth and over the panel, else null.
 */
export function touchSpot(local: V3, width: number = WRIST.width, height: number = WRIST.height) {
  if (Math.abs(local.z) > WRIST.touchDepth) return null;
  const u = local.x / width + 0.5;
  const v = 0.5 - local.y / height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

/** The button under a spot, if any. */
export function hitButton<T extends { rect: Rect }>(spot: { u: number; v: number } | null, buttons: T[]): T | null {
  if (!spot) return null;
  return (
    buttons.find(
      (b) => spot.u >= b.rect.u && spot.u <= b.rect.u + b.rect.w && spot.v >= b.rect.v && spot.v <= b.rect.v + b.rect.h,
    ) ?? null
  );
}

/**
 * Turns touches into presses: a press when a fingertip first touches a button, then nothing until the fingertip
 * comes away from the panel (past the release depth), so holding a finger on a button presses it once.
 */
export function pressEdge(armed: boolean, touched: string | null, depth: number) {
  if (armed && touched !== null) return { press: touched, armed: false };
  if (!armed && touched === null && Math.abs(depth) > WRIST.releaseDepth) return { press: null, armed: true };
  return { press: null, armed };
}

/** A hand counts as touching a world-space sign within this distance of its middle (meters, in your room). */
export const SIGN_REACH = 0.2;
