import { describe, expect, it } from 'vitest';
import { CAT_TAIL } from '../content/cat-tail.ts';
import {
  createTailChain,
  resetTailChain,
  stepTailChain,
  TAIL_CHAIN,
  type TailChain,
  type TailInput,
  type TailPin,
  tailPoint,
  tailStretch,
} from './tail-chain.ts';

// Snatch's own tail, mounted where the client draws it: the cat body at y = 0.55 + 0.95 in the robot, scaled 0.9.
const SCALE = 0.9;
const LIFT = 1.5;

/** A mount matrix (column-major): turned `yaw` about up, scaled, and moved to x, y, z. */
function mount(x = 0, y = LIFT, z = 0, yaw = 0, sx = SCALE, sy = SCALE): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sx, 0, c * sx, 0, x, y, z, 1];
}

const input = (m: number[], pin: TailPin | null = null, floorY = 0): TailInput => ({ mount: m, floorY, pin });

/** Runs the chain for `seconds` in 60 Hz frames. */
function run(chain: TailChain, seconds: number, at: (t: number) => TailInput) {
  for (let t = 0; t < seconds; t += 1 / 60) stepTailChain(chain, 1 / 60, at(t));
}

/** Where the rest pose puts point i on a mount. */
function restAt(m: number[], i: number): [number, number, number] {
  const [x, y, z] = CAT_TAIL.rest[i] as readonly [number, number, number];
  return [
    (m[0] as number) * x + (m[8] as number) * z + (m[12] as number),
    (m[5] as number) * y + (m[13] as number),
    (m[2] as number) * x + (m[10] as number) * z + (m[14] as number),
  ];
}

const gap = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(
    (a[0] as number) - (b[0] as number),
    (a[1] as number) - (b[1] as number),
    (a[2] as number) - (b[2] as number),
  );

function segmentLengths(chain: TailChain): number[] {
  const out: number[] = [];
  for (let i = 0; i < chain.count - 1; i++) out.push(gap(tailPoint(chain, i), tailPoint(chain, i + 1)));
  return out;
}

function restLengths(m: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < CAT_TAIL.rest.length - 1; i++) out.push(gap(restAt(m, i), restAt(m, i + 1)));
  return out;
}

function bendAngles(chain: TailChain): number[] {
  const out: number[] = [];
  for (let i = 1; i < chain.count - 1; i++) {
    const a = tailPoint(chain, i - 1);
    const b = tailPoint(chain, i);
    const c = tailPoint(chain, i + 1);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const dot =
      (u[0] as number) * (v[0] as number) + (u[1] as number) * (v[1] as number) + (u[2] as number) * (v[2] as number);
    out.push(Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...u) * Math.hypot(...v))))));
  }
  return out;
}

describe('the tail chain', () => {
  it('starts in the rest pose, and stays exactly there while the robot stands still', () => {
    const m = mount(3, LIFT, -2, 0.4);
    const chain = createTailChain(CAT_TAIL, m);
    run(chain, 3, () => input(m));
    for (let i = 0; i < chain.count; i++) {
      const p = tailPoint(chain, i);
      const r = restAt(m, i);
      for (let a = 0; a < 3; a++) expect(p[a]).toBeCloseTo(r[a] as number, 6);
    }
  });

  it('trails behind as the robot rolls forward, then settles back into the rest pose', () => {
    const chain = createTailChain(CAT_TAIL, mount());
    // Rolling forward (+z) at the robot's top speed for a second.
    run(chain, 1, (t) => input(mount(0, LIFT, 7 * t)));
    const m = mount(0, LIFT, 7);
    const tip = tailPoint(chain, chain.count - 1);
    expect(tip[2]).toBeLessThan(restAt(m, chain.count - 1)[2] - 0.05);
    // Then standing still: back to the curl it was drawn with.
    run(chain, 6, () => input(m));
    expect(gap(tailPoint(chain, chain.count - 1), restAt(m, chain.count - 1))).toBeLessThan(1e-3);
  });

  it('swings out on a spin attack, keeping every segment its length and every joint within its limit', () => {
    const chain = createTailChain(CAT_TAIL, mount());
    const lengths = restLengths(mount());
    let widest = 0;
    run(chain, 0.72, (t) => {
      const q = Math.min(t / 0.72, 1);
      const m = mount(0, LIFT, 0, q * q * (3 - 2 * q) * Math.PI * 6);
      const got = segmentLengths(chain);
      got.forEach((l, i) => {
        expect(l).toBeCloseTo(lengths[i] as number, 1);
      });
      bendAngles(chain).forEach((a, i) => {
        expect(a).toBeLessThanOrEqual((chain.bendLimit[i + 1] as number) + 0.05);
      });
      widest = Math.max(widest, gap(tailPoint(chain, chain.count - 1), restAt(m, chain.count - 1)));
      return input(m);
    });
    expect(widest).toBeGreaterThan(0.3);
  });

  it('never sinks through the floor, even limp with the body squashed flat', () => {
    const chain = createTailChain(CAT_TAIL, mount());
    // A hard squash: the body flattened onto the floor, then the tail let go limp so gravity has it.
    const flat = mount(0, 0.25, 0, 0, SCALE * 1.3, SCALE * 0.1);
    run(chain, 2, () => input(flat, { segment: 1, ...pointOf(restAt(flat, 1)) }));
    for (let i = 1; i < chain.count; i++) expect(tailPoint(chain, i)[1]).toBeGreaterThanOrEqual(-1e-9);
  });

  it('stays out of the body', () => {
    const m = mount();
    const chain = createTailChain(CAT_TAIL, m);
    // Held right through the middle of the body, from the far side.
    const center = [m[12] as number, (m[13] as number) + 0.6 * SCALE, m[14] as number];
    run(chain, 1, () =>
      input(m, { segment: 8, x: (center[0] as number) + 3, y: center[1] as number, z: center[2] as number }),
    );
    for (let i = 1; i < chain.count - 1; i++) {
      const reach = Math.min(CAT_TAIL.body.radius, chain.restReach[i] as number) * SCALE;
      expect(gap(tailPoint(chain, i), center)).toBeGreaterThanOrEqual(reach - 1e-6);
    }
  });

  it('hangs between its root and the hand that holds it, and swings back when let go', () => {
    const m = mount();
    const chain = createTailChain(CAT_TAIL, m);
    // A friend holds point 5, a little off to the side and lower than it rests.
    const r5 = restAt(m, 5);
    const hand = { segment: 5, x: r5[0] - 0.6, y: r5[1] - 0.5, z: r5[2] - 0.4 };
    run(chain, 2, () => input(m, hand));
    expect(gap(tailPoint(chain, 5), [hand.x, hand.y, hand.z])).toBeLessThan(1e-9);
    expect(chain.muscle).toBeLessThan(TAIL_CHAIN.limp + 0.01);
    // Limp, between root and hand, the middle sags below the straight line.
    const root = tailPoint(chain, 0);
    const mid = tailPoint(chain, 2);
    expect(mid[1]).toBeLessThan(Math.max(root[1], hand.y));
    // The rest dangles past the hand: the tip hangs below it.
    expect(tailPoint(chain, chain.count - 1)[1]).toBeLessThan(hand.y);
    // Let go, it swings home to the rest pose.
    run(chain, 0.2, () => input(m));
    expect(gap(tailPoint(chain, 5), [hand.x, hand.y, hand.z])).toBeGreaterThan(0.01);
    run(chain, 8, () => input(m));
    expect(gap(tailPoint(chain, chain.count - 1), restAt(m, chain.count - 1))).toBeLessThan(1e-3);
    expect(chain.muscle).toBe(1);
  });

  it("says how far a hand stretches it past its slack, and isn't stretched within reach", () => {
    const m = mount();
    const chain = createTailChain(CAT_TAIL, m);
    const along = restLengths(m)
      .slice(0, 4)
      .reduce((a, b) => a + b, 0);
    const root = restAt(m, 0);
    expect(tailStretch(chain, input(m, { segment: 4, x: root[0] - along * 0.5, y: root[1], z: root[2] }))).toBe(0);
    expect(tailStretch(chain, input(m, { segment: 4, x: root[0] - along - 1, y: root[1], z: root[2] }))).toBeCloseTo(
      1,
      6,
    );
    expect(tailStretch(chain, input(m))).toBe(0);
  });

  it('goes straight back to rest after a teleport instead of whipping across the station', () => {
    const chain = createTailChain(CAT_TAIL, mount());
    const far = mount(0, 5000 + LIFT, 40);
    stepTailChain(chain, 1 / 60, input(far, null, -Infinity));
    expect(gap(tailPoint(chain, chain.count - 1), restAt(far, chain.count - 1))).toBeLessThan(1e-6);
  });

  it('waits for a robot that has no pose yet, then starts from its first one', () => {
    const unset = Array.from({ length: 16 }, () => Number.NaN);
    const chain = createTailChain(CAT_TAIL, unset);
    stepTailChain(chain, 1 / 60, input(unset));
    const m = mount(2, LIFT, 5);
    stepTailChain(chain, 1 / 60, input(m));
    for (const v of chain.pos) expect(Number.isFinite(v)).toBe(true);
    expect(gap(tailPoint(chain, chain.count - 1), restAt(m, chain.count - 1))).toBeLessThan(1e-6);
  });

  it('is deterministic: the same moves give the same tail, bit for bit, whatever the frame rate overflow', () => {
    const moves = (t: number) => input(mount(Math.sin(t * 3), LIFT + Math.abs(Math.sin(t * 5)), t * 4, t * 2));
    const a = createTailChain(CAT_TAIL, mount());
    const b = createTailChain(CAT_TAIL, mount());
    run(a, 2, moves);
    run(b, 2, moves);
    expect([...a.pos]).toEqual([...b.pos]);
    // A long frame steps at most maxSteps: the tail falls behind, it doesn't explode.
    stepTailChain(a, 1, moves(2));
    for (const v of a.pos) expect(Number.isFinite(v)).toBe(true);
    resetTailChain(a, mount());
    expect(gap(tailPoint(a, 0), restAt(mount(), 0))).toBeLessThan(1e-9);
  });
});

function pointOf(p: [number, number, number]) {
  return { x: p[0], y: p[1], z: p[2] };
}
