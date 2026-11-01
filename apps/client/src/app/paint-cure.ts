import { coatOpacity } from '@saber-side/shared';
import type { CoatCure, Robot } from '../avatar/robot';

// Drawing paint that cures (shared sim/paint-cure.ts): each robot's coats are as opaque as its cure, which the station
// keeps. When the cure changes (a carrot lands, an owner sets it), the coat eases to it over about a second. A robot
// just built (coming aboard, a rebuild) shows its cure straight away rather than fading in from full color.

/** How quickly a coat eases to a new cure: about a second to get there. */
const EASE_PER_SECOND = 4;

/** Coats already showing a cure. Anything else is new, and jumps straight to it. */
const showing = new WeakSet<CoatCure>();

/**
 * Eases a robot's coats toward its cure. `cure` is the robot's cure in percent, or undefined where there's none to
 * show (not aboard a station): then its coats are drawn fully cured, as they are offline.
 */
export function showCure(robot: Robot, cure: number | undefined, paintCure: boolean, dt: number) {
  const target = cure === undefined ? 1 : coatOpacity(cure, paintCure);
  const coat = robot.coat;
  if (!showing.has(coat)) {
    showing.add(coat);
    coat.value = target;
    return;
  }
  const next = coat.value + (target - coat.value) * (1 - Math.exp(-EASE_PER_SECOND * dt));
  coat.value = Math.abs(target - next) < 1e-3 ? target : next;
}
