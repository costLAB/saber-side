import {
  bedAt,
  type FloorPoint,
  KICK_RADIUS,
  kickedBy,
  kickVelocity,
  PLANTED,
  regrowth,
  ripeAgain,
  wrapD,
} from '@saber-side/shared';
import type { CarrotBedsScene } from '../world/carrot-beds';

// Harvesting the farms' carrot beds with a spin move (shared sim/harvest.ts). A spin in a bed kicks up a few ripe
// carrots, which the legacy game turns into loose carrots to grab (G) and eat (F); the plants they came from regrow.

/** A kicked carrot's start (where it grew, next to the robot) and how it flies. */
export interface Kick {
  x: number;
  z: number;
  vel: { x: number; y: number; z: number };
  spin: { x: number; y: number; z: number };
}

export interface Harvest {
  /** A spin at `at` (the robot, on the floor strip). Returns how many carrots it kicked up. */
  spin(at: FloorPoint): number;
  /** Grows picked carrots back. */
  update(dt: number): void;
  /** Whether a spin at `at` would kick anything up (for the prompt). */
  ripeNear(at: FloorPoint): boolean;
  /** How many planted carrots are growing back right now (for tests). */
  readonly growing: number;
}

/** A regrowing carrot's look is only redrawn when it has grown this much more (its whole bed is sent to the GPU). */
const REDRAW_STEP = 0.05;

/** `kick` makes a loose carrot. `fx` is the cosmetic random stream (a `mulberry`), never Math.random. */
export function createHarvest(beds: CarrotBedsScene, kick: (k: Kick) => void, fx: () => number): Harvest {
  /** Picked carrots, by index: seconds since picked, and how grown they were last drawn. */
  const growing = new Map<number, { since: number; drawn: number }>();
  const ripe = (i: number) => !growing.has(i);

  return {
    spin(at) {
      if (bedAt(at.x, at.z, KICK_RADIUS) === undefined) return 0;
      const picked = kickedBy(PLANTED, ripe, at, fx);
      for (const i of picked) {
        const c = PLANTED[i];
        if (!c) continue;
        growing.set(i, { since: 0, drawn: 0 });
        beds.setGrowth(i, 0);
        const v = kickVelocity(c, at, fx);
        // Next to the robot, however far round the ring it has driven (the floor strip's z doesn't wrap by itself).
        kick({ x: c.x, z: at.z + wrapD(c.z - at.z), vel: { x: v.x, y: v.y, z: v.z }, spin: v.spin });
      }
      return picked.length;
    },
    update(dt) {
      for (const [i, g] of growing) {
        g.since += dt;
        if (ripeAgain(g.since)) {
          growing.delete(i);
          beds.setGrowth(i, 1);
          continue;
        }
        const k = regrowth(g.since);
        if (k - g.drawn >= REDRAW_STEP) {
          g.drawn = k;
          beds.setGrowth(i, k);
        }
      }
    },
    ripeNear(at) {
      if (bedAt(at.x, at.z, KICK_RADIUS) === undefined) return false;
      return kickedBy(PLANTED, ripe, at, () => 0).length > 0;
    },
    get growing() {
      return growing.size;
    },
  };
}
