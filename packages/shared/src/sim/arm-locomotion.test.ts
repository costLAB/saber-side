import { describe, expect, it } from 'vitest';
import {
  ARM_LOCO,
  armLocoStep,
  armPivot,
  armSpeed,
  armStretch,
  floorContact,
  glide,
  longArm,
  newArmLoco,
  type Point,
  shortArm,
} from './arm-locomotion.ts';

/** A grown-up's rig scale (scene units per meter). */
const SCALE = 1.35;
const REST = ARM_LOCO.handRest;

/**
 * Runs frames of hands, each given from the body (scene units), so a hand held still moves with the body. The body
 * starts on the floor and moves as each step says. Returns every step, and where the body was after it.
 */
function run(frames: (Point | null)[][], dt = 1 / 72) {
  let s = newArmLoco();
  const body = { x: 0, y: 0, z: 0 };
  return frames.map((hands) => {
    const world = hands.map((h) => (h ? { x: body.x + h.x, y: body.y + h.y, z: body.z + h.z } : null));
    const step = armLocoStep(s, world, SCALE, dt);
    s = step.state;
    body.x += step.move.x;
    body.y += step.move.y;
    body.z += step.move.z;
    return { ...step, body: { ...body } };
  });
}

/** A hand moving in a straight line over n frames. */
function line(from: Point, to: Point, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
  });
}

describe('long arms', () => {
  it('stretch your hands out from your neck, further when seated, and back again', () => {
    const head = { x: 0.1, y: 1.6, z: -0.2 };
    const neck = armPivot(head, 1.6);
    expect(neck).toEqual({ x: 0.1, y: 1.6 - 1.6 * ARM_LOCO.neckDrop, z: -0.2 });
    expect(longArm(neck, neck, 2)).toEqual(neck);
    const hand = { x: 0.4, y: 1.1, z: -0.5 };
    const far = longArm(hand, neck, armStretch(false));
    expect(Math.hypot(far.x - neck.x, far.y - neck.y, far.z - neck.z)).toBeCloseTo(
      Math.hypot(hand.x - neck.x, hand.y - neck.y, hand.z - neck.z) * ARM_LOCO.stretch,
      9,
    );
    const back = shortArm(far, neck, armStretch(false));
    expect(back.x).toBeCloseTo(hand.x, 9);
    expect(back.y).toBeCloseTo(hand.y, 9);
    expect(back.z).toBeCloseTo(hand.z, 9);
    expect(armStretch(true)).toBeGreaterThan(armStretch(false));
  });

  it('reach the floor from about knee height standing, and from your lap seated', () => {
    const standing = floorContact(1.6, false);
    expect(standing / 1.6).toBeGreaterThan(0.28);
    expect(standing / 1.6).toBeLessThan(0.38);
    // a hand there, stretched from the neck, lands on the floor
    const neck = armPivot({ x: 0, y: 1.6, z: 0 }, 1.6);
    expect(longArm({ x: 0, y: standing, z: 0 }, neck, armStretch(false)).y).toBeCloseTo(0, 9);
    expect(floorContact(1.2, true) / 1.2).toBeGreaterThan(standing / 1.6);
  });
});

describe('arm locomotion', () => {
  it('leaves the body be while your hands are off the floor', () => {
    const hand = line({ x: 0.5, y: 1, z: 1 }, { x: 0.5, y: 1, z: -1 }, 11);
    const steps = run(hand.map((h) => [h, h]));
    expect(steps.every((st) => !st.holding && st.move.x === 0 && st.move.y === 0 && st.move.z === 0)).toBe(true);
  });

  it('holds a hand on the floor where it lands, and draws it there, not through the floor', () => {
    const steps = run([[null, { x: -0.6, y: -0.3, z: 0.8 }]]);
    const first = steps[0];
    expect(first?.touched).toEqual([false, true]);
    expect(first?.holding).toBe(true);
    // it went 0.42 below where a resting hand sits, so the body rises by as much, and the hand is on the floor
    expect(first?.move.y).toBeCloseTo(REST + 0.3, 9);
    expect(first?.hands[1]).toEqual({ x: -0.6, y: REST, z: 0.8 });
    expect(first?.state.hold[1]).toEqual({ x: -0.6, y: REST, z: 0.8 });
  });

  it('moves the body against a hand pulled back along the floor, which stays where it holds on', () => {
    const hand = line({ x: 0.5, y: REST - 0.01, z: 1 }, { x: 0.5, y: REST - 0.01, z: 0 }, 11);
    const steps = run(hand.map((h) => [h, null]));
    // the hand went 1 back (-z), so the body went 1 forward (+z)
    expect(steps.at(-1)?.body.z).toBeCloseTo(1, 9);
    // and the robot's hand never left the spot it landed on
    for (const st of steps) {
      expect(st.hands[0]?.x).toBeCloseTo(0.5, 9);
      expect(st.hands[0]?.y).toBeCloseTo(REST, 9);
      expect(st.hands[0]?.z).toBeCloseTo(1, 9);
    }
  });

  it('averages two hands pulling together', () => {
    const a = line({ x: -0.5, y: REST - 0.01, z: 1 }, { x: -0.5, y: REST - 0.01, z: 0 }, 11);
    const b = line({ x: 0.5, y: REST - 0.01, z: 1 }, { x: 0.5, y: REST - 0.01, z: 0.5 }, 11);
    const steps = run(a.map((h, i) => [h, b[i] as Point]));
    expect(steps.at(-1)?.body.z).toBeCloseTo(0.75, 9);
  });

  it('lifts the body off the floor as a hand pushes down, and jumps when you let go after a hard shove', () => {
    // a hard shove: 0.5 down in 7 frames (about 5 a second), then the hand comes up
    const shove = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.5, z: 0.8 }, 8);
    const steps = run([...shove.map((h) => [h, null]), [{ x: 0, y: 1, z: 0.8 }, null]]);
    expect(steps.at(-2)?.body.y).toBeCloseTo(0.5, 9);
    const last = steps.at(-1);
    expect(last?.holding).toBe(false);
    expect(last?.jump).toBeGreaterThan(ARM_LOCO.jumpMin);
    expect(last?.jump).toBeLessThanOrEqual(ARM_LOCO.jumpCap);
  });

  it('still jumps when the hand pauses at the bottom of the shove before coming up', () => {
    const shove = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.5, z: 0.8 }, 8);
    const bottom = shove.at(-1) as Point;
    const steps = run([...shove.map((h) => [h, null]), [bottom, null], [{ x: 0, y: 1, z: 0.8 }, null]]);
    expect(steps.at(-1)?.jump).toBeGreaterThan(ARM_LOCO.jumpMin * ARM_LOCO.jumpGain);
    // only the last tenth of a second counts
    expect(armSpeed(steps.at(-2)?.state.recent ?? []).y).toBeGreaterThan(ARM_LOCO.jumpMin);
    expect((steps.at(-2)?.state.recent ?? []).reduce((t, m) => t + m.dt, 0)).toBeLessThan(ARM_LOCO.window + 1 / 72);
  });

  it('doesn’t jump for a slow push-up, and never jumps faster than the cap', () => {
    const slow = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.2, z: 0.8 }, 72);
    const lazy = run([...slow.map((h) => [h, null]), [{ x: 0, y: 1, z: 0.8 }, null]]);
    expect(lazy.at(-1)?.holding).toBe(false);
    expect(lazy.at(-1)?.jump).toBeUndefined();
    const huge = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 4, z: 0.8 }, 8);
    const wild = run([...huge.map((h) => [h, null]), [{ x: 0, y: 10, z: 0.8 }, null]]);
    expect(wild.at(-1)?.jump).toBe(ARM_LOCO.jumpCap);
  });

  it('flings on letting go, no faster than the cap; the glide slows on the floor, and keeps going in the air', () => {
    // a fast pull: 2 back in 10 frames, then the hand lifts
    const pull = line({ x: 0, y: REST - 0.01, z: 1 }, { x: 0, y: REST - 0.01, z: -1 }, 11);
    const steps = run([...pull.map((h) => [null, h]), [null, { x: 0, y: 1.5, z: -1 }]]);
    const fling = steps.at(-1)?.fling;
    expect(fling).toBeDefined();
    expect(Math.hypot(fling?.x ?? 0, fling?.z ?? 0)).toBeCloseTo(ARM_LOCO.flingCap, 3);
    expect(fling?.z).toBeGreaterThan(0);
    expect(steps.at(-1)?.jump).toBeUndefined();
    const v = fling ?? { x: 0, z: 0 };
    expect(glide(v, 1, true)).toEqual(v);
    let rolling = v;
    for (let i = 0; i < 72 * 6; i++) rolling = glide(rolling, 1 / 72);
    expect(rolling).toEqual({ x: 0, z: 0 });
  });

  it('keeps a hand held until it rises a little off the floor, without dragging the body down', () => {
    const at = { x: 0.3, y: REST - 0.01, z: 0.6 };
    const steps = run([
      [at, null],
      [{ ...at, y: at.y + ARM_LOCO.releaseSlack * SCALE * 0.5 }, null],
      [{ ...at, y: at.y + 0.3 }, null],
    ]);
    expect(steps.map((st) => st.holding)).toEqual([true, true, false]);
    expect(steps[1]?.move.y).toBe(0);
    // let go slowly: no fling to speak of, and no jump
    expect(Math.hypot(steps[2]?.fling?.x ?? 0, steps[2]?.fling?.z ?? 0)).toBeLessThan(0.5);
    expect(steps[2]?.jump).toBeUndefined();
  });

  it('lets go of a hand that jumps away (tracking lost), and ignores a hand that isn’t tracked', () => {
    const steps = run([
      [{ x: 0, y: REST - 0.01, z: 0.5 }, null],
      [{ x: 0, y: -0.5, z: 3 }, null],
      [null, null],
    ]);
    expect(steps[1]?.holding).toBe(false);
    expect(steps[1]?.move).toEqual({ x: 0, y: 0, z: 0 });
    // drawn where it reaches, but not through the floor
    expect(steps[1]?.hands[0]?.y).toBe(REST);
    expect(steps[2]?.holding).toBe(false);
    expect(steps[2]?.hands).toEqual([null, null]);
  });
});
