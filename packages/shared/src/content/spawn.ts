import { wrapD, type XYZ } from '../ring-space.ts';

/**
 * The Bot Maker: the workshop on the promenade where new robots are made. It stands on the west (-x) side of the
 * start plaza, between two lamp posts, with its bay door facing the walkway. Coming aboard, a robot is put together
 * inside and rolls itself out through the door into the walkway, and then it's yours to drive. Driving back in
 * through the door is how a player switches robots: it opens the roster, to pick another robot or build a new one.
 *
 * Floor-strip coordinates (x across the ring, z around it).
 */
export const BOT_MAKER = {
  /** The x of the front wall (facing the walkway) and of the back wall. */
  front: -26,
  back: -40,
  /** The z the shop (and its door) is centered on, and how wide it is along z. */
  z: 19.2,
  width: 18,
  height: 8.5,
  /** The open bay door in the middle of the front wall. */
  door: { width: 7, height: 5.6 },
  spawn: {
    /** Where a new robot starts, inside the shop, facing the door (+x). */
    x: -35,
    z: 19.2,
    yaw: Math.PI / 2,
    /** It drives itself out until it reaches this x, out in the walkway (or for `maxSeconds`, if something's in the way). */
    rollToX: -15,
    maxSeconds: 6,
    /** The camera watches from the walkway while it rolls out, then swings in behind it. */
    camera: { x: -12, y: 3.4, z: 31 } satisfies XYZ,
  },
} as const;

/** How far past the front wall a robot has to drive before it counts as inside the Bot Maker. */
const THRESHOLD = 1;

/** Whether a floor-strip point is inside the Bot Maker, past its doorway. */
export function insideBotMaker(x: number, z: number): boolean {
  const B = BOT_MAKER;
  return x > B.back && x < B.front - THRESHOLD && Math.abs(wrapD(z - B.z)) < B.width / 2;
}
