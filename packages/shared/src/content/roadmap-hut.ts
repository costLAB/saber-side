import { wrapD } from '../ring-space.ts';

/**
 * The Roadmap hut: a little planning hut tucked away in the park behind the Robot Registry, out of sight from the
 * plaza. Driving in through its door opens the Roadmap, what's been built and what's next (apps/client/src/roadmap).
 * Its door faces the backs of the Registry and the Bot Maker (+x), so you find it by going round behind them.
 * Floor-strip coordinates (x across the ring, z around it), like the Registry's.
 */
export const ROADMAP_HUT = {
  /** The x of the front wall (with the door) and of the back wall. */
  front: -54,
  back: -61,
  /** The z the hut (and its door) is centered on, and how wide it is along z. */
  z: 3.2,
  width: 7,
  /** The height of its walls; the pitched roof rises above them. */
  height: 4,
  door: { width: 3.2, height: 3.2 },
  /** A clearing round it, kept free of the park's trees. */
  clearing: { x: -57.5, z: 3.2, r: 10 },
} as const;

/** How far past the front wall a robot has to drive before it counts as inside. */
const THRESHOLD = 1;

/** Whether a floor-strip point is inside the Roadmap hut, past its doorway. */
export function insideRoadmapHut(x: number, z: number): boolean {
  const H = ROADMAP_HUT;
  return x > H.back && x < H.front - THRESHOLD && Math.abs(wrapD(z - H.z)) < H.width / 2;
}
