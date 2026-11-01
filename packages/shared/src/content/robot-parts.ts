// The robot builder's parts. A robot is put together from one part per slot: something to move on, then a body, a
// head, and arms. Only mobility is required (a robot needs a wheel to play); the rest can be left off. Each part has
// its own paint, or keeps the original rusty skin. The classic robot is just one build among the rest.

import { isRobotColor, ROBOT_COLORS } from '../roster.ts';

/** The slots, in the order a robot is assembled (and listed in the builder). */
export const PART_SLOTS = ['mobility', 'body', 'head', 'arms'] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

/** Every part there is, by slot. The client draws each id (apps/client/src/avatar/parts). */
export const ROBOT_PARTS = {
  mobility: [{ id: 'wheel', name: 'Single wheel' }],
  body: [
    { id: 'ball', name: 'Rust ball' },
    { id: 'barrel', name: 'Barrel' },
    { id: 'crate', name: 'Crate' },
  ],
  head: [
    { id: 'dome', name: 'Big eye' },
    { id: 'visor', name: 'Visor' },
    { id: 'stalk', name: 'Stalk eye' },
  ],
  arms: [
    { id: 'grabber', name: 'Grabbers' },
    { id: 'pincer', name: 'Pincers' },
    { id: 'noodle', name: 'Noodles' },
  ],
} as const;

export type PartId<S extends PartSlot = PartSlot> = (typeof ROBOT_PARTS)[S][number]['id'];

/** Slots a robot can't come aboard without. */
export const REQUIRED_SLOTS: readonly PartSlot[] = ['mobility'];

/** The paint that leaves a part in its original skin (it tints the texture by white, which changes nothing). */
export const ORIGINAL_PAINT: string = ROBOT_COLORS[0].hex;

/** One part in one slot, and its paint (one of ROBOT_COLORS; ORIGINAL_PAINT keeps the skin as it is). */
export interface PartPick<S extends PartSlot = PartSlot> {
  part: PartId<S>;
  paint: string;
}

/** A whole robot: a part (or nothing) in every slot. */
export interface RobotBuild {
  mobility: PartPick<'mobility'>;
  body: PartPick<'body'> | null;
  head: PartPick<'head'> | null;
  arms: PartPick<'arms'> | null;
}

/**
 * The original robot: ball body, big-eye dome, and grabber arms on a single wheel. Robots made before the builder
 * had one paint color for their shell and head, so `color` paints those two the way it always did.
 */
export function classicBuild(color: string = ORIGINAL_PAINT): RobotBuild {
  return {
    mobility: { part: 'wheel', paint: ORIGINAL_PAINT },
    body: { part: 'ball', paint: color },
    head: { part: 'dome', paint: color },
    arms: { part: 'grabber', paint: ORIGINAL_PAINT },
  };
}

export function isPart<S extends PartSlot>(slot: S, id: unknown): id is PartId<S> {
  return (ROBOT_PARTS[slot] as readonly { id: string }[]).some((p) => p.id === id);
}

/** The display name of a part. */
export function partName<S extends PartSlot>(slot: S, id: PartId<S>): string {
  return (ROBOT_PARTS[slot] as readonly { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;
}

/**
 * Checks a build that came over the wire (or out of the database). Returns a clean copy, or undefined if it isn't a
 * robot that can play: an unknown part or paint, or a missing required part.
 */
export function cleanRobotBuild(raw: unknown): RobotBuild | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const out: Partial<Record<PartSlot, PartPick | null>> = {};
  for (const slot of PART_SLOTS) {
    const pick = input[slot];
    if (pick === null || pick === undefined) {
      if (REQUIRED_SLOTS.includes(slot)) return undefined;
      out[slot] = null;
      continue;
    }
    if (typeof pick !== 'object') return undefined;
    const { part, paint } = pick as Record<string, unknown>;
    if (!isPart(slot, part)) return undefined;
    if (typeof paint !== 'string' || !isRobotColor(paint)) return undefined;
    out[slot] = { part, paint };
  }
  return out as RobotBuild;
}

/**
 * The one color the roster shows for a robot: the first painted part, looking at the body first, then the head, the
 * arms, and the wheel. A robot left entirely in its original skin shows ORIGINAL_PAINT.
 */
export function buildColor(build: RobotBuild): string {
  for (const slot of ['body', 'head', 'arms', 'mobility'] as const) {
    const paint = build[slot]?.paint;
    if (paint && paint !== ORIGINAL_PAINT) return paint;
  }
  return ORIGINAL_PAINT;
}

export function sameBuild(a: RobotBuild, b: RobotBuild): boolean {
  return PART_SLOTS.every((slot) => a[slot]?.part === b[slot]?.part && a[slot]?.paint === b[slot]?.paint);
}
