// A robot's pose as other players see it: where it is, which way it faces, and how its body is posed right now. Each
// device sends its own robot's pose a few times a second; the station stores it on that player's entry, and Colyseus
// sends only the numbers that changed to everyone else, who draw the robot a moment behind (smoothly in between).
//
// It's the robot as drawn, not the simulation behind it, so other players see exactly what its owner sees. In the
// hub and on lifts the robot lives in "real space" (y above 5000, drawn unbent), and the same numbers cover that too.

/**
 * How each number travels:
 * - `position`: a world coordinate (float32)
 * - `unit`: a quaternion component in [-1, 1]
 * - `angle`: a joint angle in [-π, π]
 * - `turn`: an angle that keeps going round (the drive ball, the spin): wraps at 2π
 * - `scale`: a squash factor in [0, 3]
 * - `flag`: on or off (sent as 1 or 0)
 */
export type PoseKind = 'position' | 'unit' | 'angle' | 'turn' | 'scale' | 'flag';

const ARM = ['ab', 'sw', 'el', 'ez', 'wr', 'wz', 'curl'] as const;

/** The numbers in a pose message, in order. The server stores each under its name. */
export const POSE = [
  ['px', 'position'],
  ['py', 'position'],
  ['pz', 'position'],
  ['qx', 'unit'],
  ['qy', 'unit'],
  ['qz', 'unit'],
  ['qw', 'unit'],
  ['leanX', 'angle'],
  ['leanZ', 'angle'],
  ['squashX', 'scale'],
  ['squashY', 'scale'],
  ['spin', 'turn'],
  ['headX', 'angle'],
  ['headY', 'angle'],
  ['headZ', 'angle'],
  ['drive', 'turn'],
  ...ARM.map((k) => [`arm0${k}`, 'angle'] as const),
  ...ARM.map((k) => [`arm1${k}`, 'angle'] as const),
  ['shown', 'flag'],
  // how far the mouth is open (0 shut to 1 wide), for eating (sim/eating.ts)
  ['jaw', 'scale'],
] as const satisfies readonly (readonly [string, PoseKind])[];

export type PoseField = (typeof POSE)[number][0];

/** The arm pose numbers, in the order a robot arm keeps them (`RobotArm.cur`). */
export const ARM_POSE = ARM;

/** How often a device sends its robot's pose. Remote robots are drawn this far behind, plus a little. */
export const POSE_HZ = 15;

/** Anything farther out than this isn't on (or near) the station; a pose like that is ignored. */
export const POSE_REACH = 50_000;

/** A pose message: one number per POSE entry. */
export type PoseMessage = number[];

/** Checks a pose message from a client. Returns undefined if it isn't one. */
export function readPose(msg: unknown): PoseMessage | undefined {
  if (!Array.isArray(msg) || msg.length !== POSE.length) return undefined;
  for (const v of msg) if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > POSE_REACH) return undefined;
  return msg as PoseMessage;
}
