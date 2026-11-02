// Shop spots: the storefronts a player can lease (plan section 3, "Shops"; docs/initiatives/carrot-economy.md).
// They stand in a row on the plaza's +x side, across from the Bot Maker and the Robot Registry, their fronts facing
// the walkway. Each has a size and a foot-traffic score: the spots by the welcome arch get the most passers-by.
// A vacant spot shows "FOR LEASE"; driving in through its door opens the leasing kiosk.

import { wrapD } from '../ring-space.ts';

export type SpotSize = 'S' | 'M' | 'L';

export interface Spot {
  /** Stable id, saved on the shop (`shops.spot_id`). */
  id: string;
  /** What the sign and kiosk call it. */
  name: string;
  size: SpotSize;
  /** Foot traffic: 1 is an ordinary spot, more is busier. Rent and window-shoppers both scale with it. */
  traffic: number;
  /** The middle of its frontage, round the ring. */
  z: number;
  /** How wide its frontage is. */
  width: number;
}

/** The row of spots: its front wall (facing -x, the walkway), how deep and tall the shops are, and their doors. */
export const SHOP_ROW = {
  front: 26,
  depth: 11,
  height: 7,
  door: { width: 4.4, height: 4.2 },
} as const;

export const SPOT_SIZES: Record<SpotSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };

export const SPOTS: readonly Spot[] = [
  { id: 'plaza-1', name: 'P1', size: 'S', traffic: 1.3, z: -25, width: 10 },
  { id: 'plaza-2', name: 'P2', size: 'M', traffic: 1.15, z: -11, width: 12 },
  { id: 'plaza-3', name: 'P3', size: 'M', traffic: 1, z: 4, width: 12 },
  { id: 'plaza-4', name: 'P4', size: 'L', traffic: 0.9, z: 20, width: 14 },
];

export function spotById(id: string): Spot | undefined {
  return SPOTS.find((s) => s.id === id);
}

/** How far past the front wall a robot has to drive before it counts as inside a shop. */
const THRESHOLD = 1.2;

/** The spot a point on the floor strip is inside of, if any. */
export function insideSpot(x: number, z: number): Spot | undefined {
  if (x < SHOP_ROW.front + THRESHOLD || x > SHOP_ROW.front + SHOP_ROW.depth) return undefined;
  return SPOTS.find((s) => Math.abs(wrapD(z - s.z)) < s.width / 2 - 0.3);
}
