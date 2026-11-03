import { describe, expect, it } from 'vitest';
import type { XYZ } from '../ring-space.ts';
import { distance } from '../vec3.ts';
import { type ArmShape, armJoints, handDirection, REST_ARM, reachFor } from './arm-ik.ts';

// The classic grabber arms: shoulders out at x = ±0.93, a 0.44 upper arm, a 0.45 forearm, and the grip 0.29 down the
// hand (0.24 in a wrist scaled 1.2).
const left: ArmShape = { s: 1, shoulder: { x: 0.93, y: 0.22, z: 0.03 }, upper: 0.44, fore: 0.45, hand: 0.288 };
const right: ArmShape = { ...left, s: -1, shoulder: { x: -0.93, y: 0.22, z: 0.03 } };

const mirror = (p: XYZ): XYZ => ({ x: -p.x, y: p.y, z: p.z });
const unit = (p: XYZ): XYZ => {
  const l = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};
const FORWARD = { x: 0, y: 0, z: 1 };

describe('armJoints', () => {
  it('hangs a straight arm straight down', () => {
    const j = armJoints(left, { ab: 0, sw: 0, el: 0, ez: 0, wr: 0, wz: 0 });
    expect(j.grip.x).toBeCloseTo(0.93, 6);
    expect(j.grip.y).toBeCloseTo(0.22 - 0.44 - 0.45 - 0.288, 6);
    expect(j.grip.z).toBeCloseTo(0.03, 6);
  });

  it('lifts the left arm out to +x, and the right to -x, with a positive ab', () => {
    const a = { ab: Math.PI / 2, sw: 0, el: 0, ez: 0, wr: 0, wz: 0 };
    expect(armJoints(left, a).grip.x).toBeGreaterThan(1.9);
    expect(armJoints(right, a).grip.x).toBeLessThan(-1.9);
  });

  it('swings the arm forward (+z) with a negative sw, as the blaster aim does', () => {
    expect(armJoints(left, { ab: 0, sw: -Math.PI / 2, el: 0, ez: 0, wr: 0, wz: 0 }).grip.z).toBeGreaterThan(1);
  });
});

describe('reachFor', () => {
  const targets: XYZ[] = [
    { x: 0.9, y: -0.4, z: 0.6 }, // in front, low
    { x: 0.5, y: 0.3, z: 0.7 }, // in front, at the chest
    { x: 1.4, y: 0.4, z: 0.2 }, // out to the side
    { x: 1.0, y: 0.9, z: 0.3 }, // up high
    { x: 1.1, y: -0.5, z: 0.1 }, // low at the side
  ];

  it('brings the grip to a target in reach, with the hand pointing where asked', () => {
    for (const t of targets) {
      const r = reachFor(left, t, FORWARD);
      expect(r.reached).toBe(true);
      expect(distance(r.grip, t)).toBeLessThan(1e-6);
      const h = handDirection(left, r.angles);
      expect(h.z).toBeGreaterThan(0.999);
    }
  });

  it('points the hand any comfortable way', () => {
    const t = { x: 0.8, y: -0.2, z: 0.6 };
    for (const point of [
      unit({ x: 0, y: -1, z: 1 }),
      unit({ x: 0.3, y: 0.2, z: 1 }),
      unit({ x: -0.4, y: -1, z: 0.3 }),
    ]) {
      const r = reachFor(left, t, point);
      expect(r.reached).toBe(true);
      expect(distance(r.grip, t)).toBeLessThan(1e-6);
      const h = handDirection(left, r.angles);
      expect(h.x * point.x + h.y * point.y + h.z * point.z).toBeGreaterThan(0.999);
    }
  });

  it('stretches straight toward a target out of reach, and gets as near as the arm allows', () => {
    const t = { x: 0.93, y: 0.22, z: 5 };
    const r = reachFor(left, t, FORWARD);
    expect(r.reached).toBe(false);
    // the whole arm, hand and all, lies along the line to it
    const full = left.upper + left.fore + left.hand;
    expect(distance(r.grip, t)).toBeCloseTo(distance(left.shoulder, t) - full, 3);
    expect(r.grip.z).toBeCloseTo(0.03 + full, 3);
    expect(Math.abs(r.angles.el)).toBeLessThan(0.05);
  });

  it('keeps the elbow bent when the target is right at the shoulder', () => {
    const r = reachFor(left, { ...left.shoulder }, FORWARD);
    expect(r.reached).toBe(false);
    expect(Math.abs(r.angles.el)).toBeGreaterThan(1);
    for (const k of ['ab', 'sw', 'el', 'ez', 'wr', 'wz'] as const) expect(Number.isFinite(r.angles[k])).toBe(true);
  });

  it('points the elbow down, out to the side, and back, like a person', () => {
    for (const t of targets.slice(0, 3)) {
      const r = reachFor(left, t, FORWARD);
      // the elbow sits on the outer side of the line from shoulder to wrist, and below it
      const wrist = armJoints(left, r.angles).wrist;
      const mid = { x: (left.shoulder.x + wrist.x) / 2, y: (left.shoulder.y + wrist.y) / 2 };
      expect(r.elbow.y).toBeLessThan(mid.y + 1e-9);
      expect(r.elbow.x).toBeGreaterThan(mid.x - 0.05);
    }
  });

  it('mirrors the right arm off the left', () => {
    for (const t of targets) {
      const l = reachFor(left, t, FORWARD);
      const r = reachFor(right, mirror(t), FORWARD);
      expect(r.reached).toBe(true);
      expect(distance(r.grip, mirror(t))).toBeLessThan(1e-6);
      expect(distance(r.elbow, mirror(l.elbow))).toBeLessThan(1e-6);
      // `s` flips the side-to-side angles at the shoulder and wrist, so those come out the same for both arms; the
      // elbow's side-to-side angle isn't flipped by `s`, so it comes out opposite (as the legacy wave poses it)
      for (const k of ['ab', 'sw', 'el', 'wr', 'wz'] as const) expect(r.angles[k]).toBeCloseTo(l.angles[k], 6);
      expect(r.angles.ez).toBeCloseTo(-l.angles.ez, 6);
    }
  });

  it('still lands the grip on the target when the wrist can’t bend the hand the way asked', () => {
    // the hand asked to point straight back up the arm: the wrist can't, so it points as near as it bends
    const t = { x: 1.0, y: -0.3, z: 0.5 };
    const r = reachFor(left, t, unit({ x: -0.3, y: 1, z: -0.6 }));
    expect(r.reached).toBe(true);
    expect(distance(r.grip, t)).toBeLessThan(1e-3);
  });

  it('keeps angles in the pose messages’ range', () => {
    for (const t of targets) {
      const r = reachFor(left, t, unit({ x: 0.2, y: 1, z: 0.3 }));
      for (const k of ['ab', 'sw', 'el', 'ez', 'wr', 'wz'] as const)
        expect(Math.abs(r.angles[k])).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('stays near the angles the arm already has, so a hand raised overhead doesn’t flip', () => {
    // raise the hand in small steps from the side up over the head: each step moves the elbow only a little, and the
    // arm never flips round to the other way of making the same pose
    let near = REST_ARM;
    let elbow: XYZ | null = null;
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * 1.4;
      const t = { x: 0.93 + 1.0 * Math.cos(a), y: 0.22 + 1.0 * Math.sin(a) - 0.3, z: 0.25 };
      const r = reachFor(left, t, unit({ x: Math.cos(a), y: Math.sin(a), z: 0.2 }), near);
      expect(r.reached).toBe(true);
      if (elbow) expect(distance(r.elbow, elbow)).toBeLessThan(0.15);
      if (i > 0) expect(Math.abs(r.angles.ab - near.ab)).toBeLessThan(0.3);
      near = r.angles;
      elbow = r.elbow;
    }
  });
});
