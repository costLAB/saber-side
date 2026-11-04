import { describe, expect, it } from 'vitest';
import { ARM_LOCO, armLocoStep, floorContact, glide, newArmLoco, type Point } from './arm-locomotion.ts';

const EYE = 1.6;
const FLOOR = floorContact(EYE, false);

/** Runs frames of hands, returning every step. */
function run(frames: (Point | null)[][], dt = 1 / 72) {
  let s = newArmLoco();
  return frames.map((hands) => {
    const step = armLocoStep(s, hands, FLOOR, dt);
    s = step.state;
    return step;
  });
}

/** A hand moving in a straight line over n frames. */
function line(from: Point, to: Point, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
  });
}

describe('arm locomotion', () => {
  it('finds the floor at a share of your eye height, higher when seated', () => {
    expect(floorContact(1.6, false)).toBeCloseTo(1.6 * ARM_LOCO.contactShare);
    expect(floorContact(1.2, true)).toBeGreaterThan(floorContact(1.2, false));
  });

  it('moves the body against a hand pushing on the floor', () => {
    const hand = line({ x: 0.2, y: 0.3, z: -0.3 }, { x: 0.2, y: 0.3, z: 0.1 }, 11);
    const steps = run(hand.map((h) => [null, h]));
    expect(steps[0]?.touched).toEqual([false, true]);
    const moved = steps.reduce((a, st) => a + st.move.z, 0);
    // the hand went 0.4 m back (+z), so the body went 0.4 m forward (-z): the first frame only touches down
    expect(moved).toBeCloseTo(-0.4, 5);
  });

  it('doesn’t move for a hand held up off the floor', () => {
    const hand = line({ x: 0, y: 1, z: -0.3 }, { x: 0, y: 1, z: 0.1 }, 11);
    const steps = run(hand.map((h) => [h, null]));
    expect(steps.every((st) => st.move.x === 0 && st.move.z === 0 && !st.holding)).toBe(true);
  });

  it('averages two hands pushing together', () => {
    const a = line({ x: -0.2, y: 0.3, z: -0.3 }, { x: -0.2, y: 0.3, z: 0.1 }, 11);
    const b = line({ x: 0.2, y: 0.3, z: -0.3 }, { x: 0.2, y: 0.3, z: 0.1 }, 11);
    const moved = run(a.map((h, i) => [h, b[i] as Point])).reduce((acc, st) => acc + st.move.z, 0);
    expect(moved).toBeCloseTo(-0.4, 5);
  });

  it('flings on letting go, no faster than the cap, and the glide slows to a stop', () => {
    // a fast push: 1 m in 10 frames (7.2 m/s), then the hand lifts
    const push = line({ x: 0, y: 0.3, z: -0.5 }, { x: 0, y: 0.3, z: 0.5 }, 11);
    const steps = run([...push.map((h) => [null, h]), [null, { x: 0, y: 1.2, z: 0.5 }]]);
    const fling = steps.at(-1)?.fling;
    expect(fling).toBeDefined();
    expect(Math.hypot(fling?.x ?? 0, fling?.z ?? 0)).toBeCloseTo(ARM_LOCO.flingCap, 3);
    expect(fling?.z).toBeLessThan(0);
    expect(steps.at(-1)?.jump).toBeUndefined();
    let v = fling ?? { x: 0, z: 0 };
    for (let i = 0; i < 72 * 6; i++) v = glide(v, 1 / 72);
    expect(v).toEqual({ x: 0, z: 0 });
  });

  it('jumps when you push down hard and let go', () => {
    const push = line({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.25, z: 0 }, 8);
    const steps = run([...push.map((h) => [h, null]), [{ x: 0, y: 1.2, z: 0 }, null]]);
    expect(steps.at(-1)?.jump).toBeGreaterThan(ARM_LOCO.jumpMin);
    expect(steps.at(-1)?.jump).toBeLessThanOrEqual(ARM_LOCO.jumpCap);
  });

  it('ignores a hand that jumps when tracking is lost, and a hand that’s not tracked', () => {
    const steps = run([
      [{ x: 0, y: 0.3, z: 0 }, null],
      [{ x: 0, y: 0.3, z: 2 }, null],
      [null, null],
    ]);
    expect(steps[1]?.move).toEqual({ x: 0, z: 0 });
    expect(steps[2]?.holding).toBe(false);
  });

  it('keeps a hand down until it rises a little past the floor', () => {
    const steps = run([
      [{ x: 0, y: FLOOR - 0.01, z: 0 }, null],
      [{ x: 0, y: FLOOR + 0.02, z: 0 }, null],
      [{ x: 0, y: FLOOR + 0.1, z: 0 }, null],
    ]);
    expect(steps.map((st) => st.holding)).toEqual([true, true, false]);
  });
});
