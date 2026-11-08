import { wrapD } from '../ring-space.ts';

// The solid things on the ring floor, as a Quest player's robot meets them, Gorilla Tag style
// (docs/initiatives/quest-vr.md, PR 10): its hands can't go into them, so they hold on to walls, trees, posts, and
// tabletops to climb, and its wheel can stand on top of whatever it climbs onto.
//
// Each is a footprint on the floor strip, the legacy game's flat-space obstacles (a box, or a round post), standing up
// from the floor to its `top`. One without a `top` (a lift tube, the park's fence) only blocks the robot's wheel:
// hands go through it, and nothing stands on it. The floor itself is solid everywhere. Scene units, y up from the
// floor; z wraps round the ring.

/** A box: `hw` and `hd` are half its size across (x) and around (z). */
export interface BoxSolid {
  x: number;
  z: number;
  hw: number;
  hd: number;
  top?: number;
}

/** A round post, `r` across. */
export interface RoundSolid {
  x: number;
  z: number;
  r: number;
  top?: number;
}

export type Solid = BoxSolid | RoundSolid;

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Where a ball touches something solid: how deep it's in, and the way out (a unit vector), along which it's `depth`. */
export interface Contact {
  normal: Point;
  depth: number;
}

/** Finds how deep a ball of `radius` at `p` is in whatever it's deepest in, or null if it's clear. */
export type TouchFn = (p: Point) => Contact | null;

/** Just the floor. */
export function floorTouch(radius: number): TouchFn {
  return (p) => (p.y < radius ? { normal: { x: 0, y: 1, z: 0 }, depth: radius - p.y } : null);
}

/** How deep a ball is in one solid, and the shortest way out: through a side or up through the top. */
export function solidContact(p: Point, s: Solid, radius: number): Contact | null {
  if (s.top === undefined) return null;
  const dx = p.x - s.x;
  const dz = wrapD(p.z - s.z);
  const up = s.top + radius - p.y;
  if (up <= 0) return null;
  let side: Contact;
  if ('r' in s) {
    const d = Math.hypot(dx, dz);
    const out = s.r + radius - d;
    if (out <= 0) return null;
    side =
      d > 1e-9 ? { normal: { x: dx / d, y: 0, z: dz / d }, depth: out } : { normal: { x: 1, y: 0, z: 0 }, depth: out };
  } else {
    const ox = s.hw + radius - Math.abs(dx);
    const oz = s.hd + radius - Math.abs(dz);
    if (ox <= 0 || oz <= 0) return null;
    side =
      ox < oz
        ? { normal: { x: dx < 0 ? -1 : 1, y: 0, z: 0 }, depth: ox }
        : { normal: { x: 0, y: 0, z: dz < 0 ? -1 : 1 }, depth: oz };
  }
  return up < side.depth ? { normal: { x: 0, y: 1, z: 0 }, depth: up } : side;
}

/**
 * Touches the floor and every solid in `lists` that's near: the deepest contact wins. Only solids within `near` of the
 * point (across and around) are looked at.
 */
export function solidsTouch(lists: readonly (readonly Solid[])[], radius: number, near = 40): TouchFn {
  const floor = floorTouch(radius);
  return (p) => {
    let best = floor(p);
    for (const list of lists)
      for (const s of list) {
        if (s.top === undefined || Math.abs(p.x - s.x) > near || Math.abs(wrapD(p.z - s.z)) > near) continue;
        const c = solidContact(p, s, radius);
        if (c && (!best || c.depth > best.depth)) best = c;
      }
    return best;
  };
}

/** Pushes a ball out of whatever it's in, by the shortest way (a few times, for a corner between two solids). */
export function pushOut(p: Point, touch: TouchFn): Point {
  let q = p;
  for (let i = 0; i < 3; i++) {
    const c = touch(q);
    if (!c) break;
    q = { x: q.x + c.normal.x * c.depth, y: q.y + c.normal.y * c.depth, z: q.z + c.normal.z * c.depth };
  }
  return q;
}

/**
 * How high the ground is under a robot's wheel at (x, z), for a robot this high (`y`): the top of the highest solid
 * under it that isn't above it (0, the floor, if none). `margin` lets it stand on a solid narrower than itself, like a
 * wall's top, as long as its middle is within that of it.
 */
export function groundUnder(
  x: number,
  z: number,
  y: number,
  lists: readonly (readonly Solid[])[],
  margin: number,
): number {
  let ground = 0;
  for (const list of lists)
    for (const s of list) {
      if (s.top === undefined || s.top <= ground || s.top > y + 1e-6) continue;
      const dx = x - s.x;
      const dz = wrapD(z - s.z);
      const under =
        'r' in s ? Math.hypot(dx, dz) < s.r + margin : Math.abs(dx) < s.hw + margin && Math.abs(dz) < s.hd + margin;
      if (under) ground = s.top;
    }
  return ground;
}
