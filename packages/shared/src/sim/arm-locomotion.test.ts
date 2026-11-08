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
  releaseSpeed,
  shortArm,
  vrGravity,
} from './arm-locomotion.ts';
import { floorTouch, type Point, type Solid, solidsTouch, type TouchFn } from './solids.ts';

/** A grown-up's rig scale (scene units per meter). */
const SCALE = 1.35;
const REST = ARM_LOCO.handRest;
const FLOOR = floorTouch(REST);

/**
 * Runs frames of hands, each given from the body (scene units), so a hand held still moves with the body. The body
 * starts at `start` and moves as each step says. Returns every step, and where the body was after it.
 */
function run(frames: (Point | null)[][], touch: TouchFn = FLOOR, dt = 1 / 72, start = { x: 0, y: 0, z: 0 }) {
  let s = newArmLoco();
  const body = { ...start };
  return frames.map((hands) => {
    const world = hands.map((h) => (h ? { x: body.x + h.x, y: body.y + h.y, z: body.z + h.z } : null));
    const step = armLocoStep(s, world, touch, SCALE, dt);
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
    const neck = armPivot({ x: 0, y: 1.6, z: 0 }, 1.6);
    expect(longArm({ x: 0, y: standing, z: 0 }, neck, armStretch(false)).y).toBeCloseTo(0, 9);
    expect(floorContact(1.2, true) / 1.2).toBeGreaterThan(standing / 1.6);
  });
});

describe('arm locomotion', () => {
  it('leaves the body be while your hands touch nothing', () => {
    const hand = line({ x: 0.5, y: 1, z: 1 }, { x: 0.5, y: 1, z: -1 }, 11);
    const steps = run(hand.map((h) => [h, h]));
    expect(steps.every((st) => !st.holding && st.move.x === 0 && st.move.y === 0 && st.move.z === 0)).toBe(true);
  });

  it('holds a hand on the floor where it lands, and draws it there, not through the floor', () => {
    const first = run([[null, { x: -0.6, y: -0.3, z: 0.8 }]])[0];
    expect(first?.touched).toEqual([false, true]);
    expect(first?.holding).toBe(true);
    // it went 0.42 below where a resting hand sits, so the body rises by as much, and the hand is on the floor
    expect(first?.move.y).toBeCloseTo(REST + 0.3, 9);
    expect(first?.hands[1]?.y).toBeCloseTo(REST, 9);
    expect(first?.state.hold[1]?.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('moves the body against a hand pulled back along the floor, which stays where it holds on', () => {
    const hand = line({ x: 0.5, y: REST - 0.01, z: 1 }, { x: 0.5, y: REST - 0.01, z: 0 }, 11);
    const steps = run(hand.map((h) => [h, null]));
    expect(steps.at(-1)?.body.z).toBeCloseTo(1, 9);
    for (const st of steps) {
      expect(st.hands[0]?.x).toBeCloseTo(0.5, 9);
      expect(st.hands[0]?.y).toBeCloseTo(REST, 9);
      expect(st.hands[0]?.z).toBeCloseTo(1, 9);
    }
  });

  it('averages two hands pulling together', () => {
    const a = line({ x: -0.5, y: REST - 0.01, z: 1 }, { x: -0.5, y: REST - 0.01, z: 0 }, 11);
    const b = line({ x: 0.5, y: REST - 0.01, z: 1 }, { x: 0.5, y: REST - 0.01, z: 0.5 }, 11);
    expect(run(a.map((h, i) => [h, b[i] as Point])).at(-1)?.body.z).toBeCloseTo(0.75, 9);
  });

  it('lifts the body as a hand pushes down into the floor, and the hand stays on it', () => {
    const shove = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.5, z: 0.8 }, 8);
    const steps = run(shove.map((h) => [h, null]));
    expect(steps.at(-1)?.body.y).toBeCloseTo(0.5, 9);
    expect(steps.at(-1)?.hands[0]?.y).toBeCloseTo(REST, 9);
  });

  it('climbs a wall: a hand pulled down the wall lifts the body, and coming away from it lets go', () => {
    // a wall ahead (+z), its face at z = 1
    const wall: Solid = { x: 0, z: 1.5, hw: 3, hd: 0.5, top: 6 };
    const touch = solidsTouch([[wall]], REST);
    const reach = { x: 0, y: 2, z: 1 - REST + 0.02 };
    const pull = line(reach, { ...reach, y: 0.5 }, 16);
    const steps = run([...pull.map((h) => [h, null]), [{ ...reach, y: 0.5, z: 0.2 }, null]], touch);
    expect(steps[0]?.touched).toEqual([true, false]);
    expect(steps[0]?.state.hold[0]?.normal).toEqual({ x: 0, y: 0, z: -1 });
    const climbed = steps.at(-2);
    expect(climbed?.body.y).toBeCloseTo(1.5, 9);
    // the robot's hand never left the spot on the wall
    expect(climbed?.hands[0]?.y).toBeCloseTo(2, 9);
    expect(climbed?.hands[0]?.z).toBeCloseTo(1 - REST, 9);
    // the hand coming back off the wall lets go
    expect(steps.at(-1)?.holding).toBe(false);
  });

  it('pushes off a wall, and a hand easing off it doesn’t pull the body in', () => {
    const wall: Solid = { x: 0, z: 1.5, hw: 3, hd: 0.5, top: 6 };
    const touch = solidsTouch([[wall]], REST);
    const at = { x: 0, y: 2, z: 1 - REST + 0.01 };
    const steps = run(
      [
        [at, null],
        [{ ...at, z: at.z + 0.2 }, null],
        [{ ...at, z: at.z + 0.2 - ARM_LOCO.releaseSlack * SCALE * 0.5 }, null],
      ],
      touch,
    );
    expect(steps[1]?.move.z).toBeCloseTo(-0.2, 9);
    expect(steps[2]?.holding).toBe(true);
    expect(steps[2]?.move.z).toBe(0);
  });

  it('flies on at Gorilla Tag’s speed when you let go: a little faster than you were moving, up to the cap', () => {
    // a pull along the floor at 5 a second, then the hand lifts
    const pull = line({ x: 0, y: REST - 0.01, z: 0.5 }, { x: 0, y: REST - 0.01, z: -0.2 }, 11);
    const steps = run([...pull.map((h) => [null, h]), [null, { x: 0, y: 1.5, z: -0.2 }]]);
    const fling = steps.at(-1)?.fling;
    const was = armSpeed(steps.at(-2)?.state.recent ?? []);
    expect(fling?.z).toBeCloseTo(was.z * ARM_LOCO.releaseGain, 9);
    expect(fling?.y).toBeCloseTo(0, 9);
    // too fast is capped (in meters of your room), too slow just stops
    const capped = releaseSpeed({ x: 0, y: 30, z: 0 }, SCALE);
    expect(capped.y).toBeCloseTo(ARM_LOCO.releaseCap * SCALE, 9);
    expect(releaseSpeed({ x: 0.2, y: 0, z: 0 }, SCALE)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('jumps when you let go after a shove down, even if the hand pauses at the bottom', () => {
    const shove = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.5, z: 0.8 }, 8);
    const bottom = shove.at(-1) as Point;
    const steps = run([...shove.map((h) => [h, null]), [bottom, null], [{ x: 0, y: 1, z: 0.8 }, null]]);
    expect(steps.at(-1)?.fling?.y).toBeGreaterThan(2);
    // only the last tenth of a second counts
    expect((steps.at(-2)?.state.recent ?? []).reduce((t, m) => t + m.dt, 0)).toBeLessThan(ARM_LOCO.window + 1 / 72);
  });

  it('doesn’t fling for a slow push-up', () => {
    const slow = line({ x: 0, y: REST, z: 0.8 }, { x: 0, y: REST - 0.1, z: 0.8 }, 72);
    const lazy = run([...slow.map((h) => [h, null]), [{ x: 0, y: 1, z: 0.8 }, null]]);
    expect(lazy.at(-1)?.fling).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('lets go of a hand that jumps away (tracking lost), and ignores a hand that isn’t tracked', () => {
    const steps = run([
      [{ x: 0, y: REST - 0.01, z: 0.5 }, null],
      [{ x: 0, y: 2, z: 3 }, null],
      [null, null],
    ]);
    expect(steps[1]?.holding).toBe(false);
    expect(steps[1]?.move).toEqual({ x: 0, y: 0, z: 0 });
    expect(steps[2]?.hands).toEqual([null, null]);
  });

  it('slows a glide on the wheel, keeps it in the air, and falls with Earth’s gravity for your body', () => {
    const v = { x: 0, z: 6 };
    expect(glide(v, 1, true)).toEqual(v);
    let rolling = v;
    for (let i = 0; i < 72 * 3; i++) rolling = glide(rolling, 1 / 72);
    expect(rolling).toEqual({ x: 0, z: 0 });
    expect(vrGravity(SCALE)).toBeCloseTo(9.8 * SCALE, 9);
  });
});
