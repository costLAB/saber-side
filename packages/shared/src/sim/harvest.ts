// Harvesting the carrot beds with a spin move (content/carrot-beds.ts). A robot spinning in a bed kicks up a few of
// the ripe carrots around it: they fly up and out, land as loose carrots it can grab and eat, and the plants regrow.
//
// Like the carrot on the table, a harvested carrot is a snack: it doesn't go in a pocket or cure paint. Harvesting is
// each player's own for now (friends don't see the carrots fly); sharing loose items is later P3 work.

import type { PlantedCarrot } from '../content/carrot-beds.ts';
import { wrapD } from '../ring-space.ts';

/** How far round the robot a spin reaches: about as far as its swooshes. */
export const KICK_RADIUS = 2.6;

/** The most carrots one spin kicks up. */
export const KICK_MAX = 3;

/** The chance each ripe carrot in reach comes up (the nearest always does, so a spin in a bed never misses). */
export const KICK_CHANCE = 0.6;

/** How long a picked carrot takes to grow back. */
export const REGROW_SECONDS = 40;

/** The most harvested carrots lying about at once. Kicking up more takes away the oldest ones nobody holds. */
export const LOOSE_MAX = 100;

export interface FloorPoint {
  x: number;
  z: number;
}

/**
 * Which ripe carrots a spin at `at` kicks up, nearest first, by their index in `planted`. `rand` is the cosmetic
 * stream (a `mulberry`), never Math.random.
 */
export function kickedBy(
  planted: readonly PlantedCarrot[],
  ripe: (i: number) => boolean,
  at: FloorPoint,
  rand: () => number,
): number[] {
  const inReach: { i: number; d: number }[] = [];
  planted.forEach((c, i) => {
    const dx = c.x - at.x;
    if (Math.abs(dx) > KICK_RADIUS) return;
    const d = Math.hypot(dx, wrapD(c.z - at.z));
    if (d <= KICK_RADIUS && ripe(i)) inReach.push({ i, d });
  });
  inReach.sort((a, b) => a.d - b.d || a.i - b.i);
  const out: number[] = [];
  for (const { i } of inReach) {
    if (out.length >= KICK_MAX) break;
    if (out.length === 0 || rand() < KICK_CHANCE) out.push(i);
  }
  return out;
}

/** How a kicked carrot flies: up, and out away from the robot, with a tumble. */
export function kickVelocity(
  carrot: FloorPoint,
  at: FloorPoint,
  rand: () => number,
): { x: number; y: number; z: number; spin: { x: number; y: number; z: number } } {
  const dx = carrot.x - at.x;
  const dz = wrapD(carrot.z - at.z);
  const len = Math.hypot(dx, dz);
  // straight under the robot: fling it any way at all
  const a = len > 1e-6 ? Math.atan2(dx, dz) : rand() * Math.PI * 2;
  const out = 1.2 + rand() * 1.4;
  return {
    x: Math.sin(a) * out,
    y: 6 + rand() * 2,
    z: Math.cos(a) * out,
    spin: { x: (rand() - 0.5) * 14, y: (rand() - 0.5) * 8, z: (rand() - 0.5) * 14 },
  };
}

/** How grown a picked carrot is, `since` seconds after it was picked: 0 (just picked) to 1 (ripe again). */
export function regrowth(since: number): number {
  if (since <= 0) return 0;
  // Nothing shows for the first quarter, then its leaves come up and fill out.
  const k = Math.min(1, Math.max(0, (since / REGROW_SECONDS - 0.25) / 0.75));
  return k * k * (3 - 2 * k);
}

/** Whether a carrot picked `since` seconds ago is ripe again. */
export function ripeAgain(since: number): boolean {
  return since >= REGROW_SECONDS;
}
