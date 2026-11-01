import {
  biteLength,
  type Crumb,
  chompsBetween,
  crumbs,
  type EatingFrame,
  eatingFrame,
  gulpsBetween,
  NOT_EATING,
} from '@saber-side/shared';
import { openMouth, type Robot } from '../avatar/robot';

// Eating the carrot you're holding: each press of use is a bite, timed by the shared timeline (sim/eating.ts). This
// keeps the bite going (the gulp outlasts the carrot itself), opens the robot's mouth, and says when the teeth meet
// so the legacy game can take a chunk out of the carrot and throw the crumbs. Friends see the mouth through the pose's
// `jaw` field (app/presence.ts).

/** What one frame of eating did. */
export interface EatingStep extends EatingFrame {
  /** The teeth met this frame: the carrot loses a chunk. */
  chomp: boolean;
  /** The carrot went down this frame (the last bite's gulp). */
  gulp: boolean;
}

export interface Eating {
  /** Takes bite number `bite` (1 for the first) of the held carrot, unless a bite is already going. */
  bite(bite: number): boolean;
  /** The carrot left the robot's hand: a bite whose teeth haven't met yet stops (a gulp already under way goes on). */
  letGo(): void;
  /** Moves the bite on by `dt` seconds and opens the robot's mouth to match. */
  update(dt: number, robot: Robot): EatingStep;
  /** The latest frame (the arm and grip read it while posing). */
  readonly frame: Readonly<EatingFrame>;
  /** The crumbs off a chomp, from the cosmetic stream. */
  crumbs(): Crumb[];
}

/** `fx` is the cosmetic random stream (a `mulberry`), never Math.random. */
export function createEating(fx: () => number): Eating {
  let bite = 0;
  let t = 0;
  let chomped = false;
  let frame: EatingFrame = { ...NOT_EATING };
  const busy = () => bite > 0 && t < biteLength(bite);

  return {
    bite(n) {
      if (busy()) return false;
      bite = n;
      t = 0;
      chomped = false;
      return true;
    },
    letGo() {
      if (busy() && !chomped) bite = 0;
    },
    update(dt, robot) {
      let chomp = false;
      let gulp = false;
      if (busy()) {
        const t0 = t;
        t += dt;
        chomp = chompsBetween(t0, t);
        if (chomp) chomped = true;
        gulp = gulpsBetween(bite, t0, t);
        frame = eatingFrame(t, bite);
        if (!busy()) bite = 0;
      } else frame = { ...NOT_EATING };
      openMouth(robot, frame.jaw);
      return { ...frame, chomp, gulp };
    },
    get frame() {
      return frame;
    },
    crumbs: () => crumbs(fx),
  };
}
