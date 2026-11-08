// Waving hello. A robot waves the first time another player's robot comes within GREET_RANGE of it, and only then:
// once per player per visit. Robots used to wave whenever they stood idle; that read as noise, not a greeting.

import { wrapD } from '../ring-space.ts';

/** How close another robot has to come (meters) for this one to wave. */
export const GREET_RANGE = 6;

export interface GreetPoint {
  x: number;
  y: number;
  z: number;
}

/** Distance between two points on the ring floor, the short way round. */
export function ringDistance(a: GreetPoint, b: GreetPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, wrapD(a.z - b.z));
}

/**
 * The players this robot meets for the first time this frame: those within GREET_RANGE of `me` and not yet in `met`.
 * Adds them to `met`, so each is greeted only once.
 */
export function firstMeetings(
  me: GreetPoint,
  others: Iterable<[id: string, at: GreetPoint]>,
  met: Set<string>,
  range = GREET_RANGE,
): string[] {
  const fresh: string[] = [];
  for (const [id, at] of others) {
    if (met.has(id) || ringDistance(me, at) > range) continue;
    met.add(id);
    fresh.push(id);
  }
  return fresh;
}
