// Grabbing a friend's tail (docs/initiatives/sketchbook-characters.md, "Friends grab the tail"). Each client owns its
// own robot (D7), so a grab is a request: the grabber's client asks, the station checks it with these rules against
// the poses it holds, and tells everyone aboard who holds which tail at which point. Every client then pins that
// tail's chain (sim/tail-chain.ts) to the grabber's hand.
//
// The station only knows where each robot stands, not where its tail is (that's cosmetic, worked out on each
// client), so the reach is from robot to robot: an arm's length, plus the tail's, plus slack for the pose lag.

import { CAT_TAIL } from '../content/cat-tail.ts';
import type { RobotBuild } from '../content/robot-parts.ts';
import { wrapD } from '../ring-space.ts';

export const TAIL_GRAB = {
  /** The chain's points, root first. The root is inside the body, so points 1 to `points - 1` can be held. */
  points: CAT_TAIL.rest.length,
  /** A grab is in reach when the two robots stand this close (world units, robot to robot). */
  reach: 4.5,
  /** The grip breaks when they're pulled this far apart. */
  breakAt: 7,
  /** A held tail tugs its cat toward the hand once the hand is this far past the tail's slack (world units). */
  tugSlack: 0.4,
  /** How hard the tug pulls: speed per unit of stretch past the slack (per second). */
  tug: 2.5,
  /** The fastest a tug drags the cat, in world units per second (it drives at 7). */
  tugMax: 2.4,
} as const;

/** Whether a build has a tail to grab: only the cat's body carries one. */
export function hasTail(build: RobotBuild | undefined | null): boolean {
  return build?.body?.part === 'cat';
}

/** Whether a build has a hand to grab with. */
export function hasHands(build: RobotBuild | undefined | null): boolean {
  return !!build?.arms;
}

/** Where a robot is, as the station holds it: from its pose. */
export interface Placed {
  px: number;
  py: number;
  pz: number;
  shown: boolean;
}

/** How far apart two robots stand, z the short way round the ring. */
export function robotGap(a: Placed, b: Placed): number {
  return Math.hypot(a.px - b.px, a.py - b.py, wrapD(a.pz - b.pz));
}

/** A seat as the grab rules see it. */
export interface TailSeat extends Placed {
  id: string;
  build: RobotBuild | undefined;
  /** The tail this seat holds, if any (the other seat's id). */
  holding: string;
  /** Who holds this seat's tail, if anyone. */
  heldBy: string;
}

/** What a client asks for. */
export interface TailGrabAsk {
  segment: number;
  hand: number;
}

/** Checks a grab. Returns why it's refused, or undefined to let it through. */
export function refuseTailGrab(grabber: TailSeat, target: TailSeat | undefined, ask: TailGrabAsk): string | undefined {
  if (!target) return "That robot isn't aboard.";
  if (target.id === grabber.id) return "You can't grab your own tail.";
  if (!hasTail(target.build)) return "That robot hasn't got a tail.";
  if (!hasHands(grabber.build)) return 'You need arms to grab a tail.';
  if (!Number.isInteger(ask.segment) || ask.segment < 1 || ask.segment >= TAIL_GRAB.points) return 'No such spot.';
  if (ask.hand !== 0 && ask.hand !== 1) return 'No such hand.';
  if (grabber.holding) return "You're holding a tail already.";
  if (target.heldBy) return 'Someone has that tail.';
  if (!grabber.shown || !target.shown) return "That robot isn't here.";
  if (robotGap(grabber, target) > TAIL_GRAB.reach) return 'Too far away.';
  return undefined;
}

/** Whether a held tail's grip breaks: they're too far apart, or either one is gone from view. */
export function tailGripBreaks(grabber: Placed, target: Placed): boolean {
  return !grabber.shown || !target.shown || robotGap(grabber, target) > TAIL_GRAB.breakAt;
}
