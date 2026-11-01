import { describe, expect, it } from 'vitest';
import { mulberry } from '../rng.ts';
import {
  BITE_TIME,
  BITES_PER_CARROT,
  biteLength,
  CHOMP_AT,
  CRUMBS_PER_CHOMP,
  chompsBetween,
  crumbs,
  eatingFrame,
  GULP_AT,
  GULP_TIME,
  gulpsBetween,
  isGulp,
  jawAt,
  NOT_EATING,
} from './eating.ts';

/** Samples a bite every `dt` seconds, from its start to just past its end. */
function samples(bite: number, dt = 1 / 120) {
  const out: { t: number; jaw: number }[] = [];
  for (let t = 0; t <= biteLength(bite) + dt; t += dt) out.push({ t, jaw: jawAt(t, bite) });
  return out;
}

describe('the eating timeline', () => {
  it('takes three bites, and only the last is the gulp', () => {
    expect(BITES_PER_CARROT).toBe(3);
    expect([1, 2, 3].map(isGulp)).toEqual([false, false, true]);
    expect(biteLength(1)).toBe(BITE_TIME);
    expect(biteLength(3)).toBe(GULP_TIME);
    expect(GULP_TIME).toBeGreaterThan(BITE_TIME);
  });

  it('starts and ends with the jaw shut and the robot as it stands', () => {
    for (const bite of [1, 2, 3]) {
      expect(eatingFrame(0, bite)).toEqual(NOT_EATING);
      expect(eatingFrame(biteLength(bite), bite)).toEqual(NOT_EATING);
      expect(eatingFrame(-1, bite)).toEqual(NOT_EATING);
      expect(eatingFrame(biteLength(bite) + 1, bite)).toEqual(NOT_EATING);
    }
  });

  it('opens the jaw wide before the chomp, and has it shut at the chomp', () => {
    for (const bite of [1, 2, 3]) {
      const before = samples(bite).filter((s) => s.t < CHOMP_AT);
      expect(Math.max(...before.map((s) => s.jaw))).toBe(1);
      expect(jawAt(CHOMP_AT, bite)).toBe(0);
    }
  });

  it('keeps the jaw between shut and wide open', () => {
    for (const bite of [1, 3]) {
      for (const { jaw } of samples(bite)) {
        expect(jaw).toBeGreaterThanOrEqual(0);
        expect(jaw).toBeLessThanOrEqual(1);
      }
    }
  });

  it('chews a little after a chomp, but holds the jaw shut through a gulp', () => {
    const chew = samples(1).filter((s) => s.t > CHOMP_AT);
    expect(Math.max(...chew.map((s) => s.jaw))).toBeGreaterThan(0.1);
    expect(Math.max(...chew.map((s) => s.jaw))).toBeLessThan(0.5);
    const gulp = samples(3).filter((s) => s.t > CHOMP_AT);
    expect(Math.max(...gulp.map((s) => s.jaw))).toBe(0);
  });

  it('nods and squashes only on the gulp', () => {
    const chomp = eatingFrame(GULP_AT, 1);
    expect(chomp.nod).toBe(0);
    expect(chomp.squash).toBe(1);
    const gulp = eatingFrame(GULP_AT + 0.1, 3);
    expect(gulp.nod).toBeGreaterThan(0);
    expect(gulp.squash).toBeLessThan(1);
    expect(gulp.squash).toBeGreaterThan(0.85);
  });

  it('lifts the carrot to the mouth for the chomp', () => {
    expect(eatingFrame(CHOMP_AT, 1).arm).toBeCloseTo(1, 5);
    expect(eatingFrame(CHOMP_AT, 3).arm).toBeCloseTo(1, 5);
  });

  it('lands each chomp, and the gulp, exactly once however the frames fall', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 90, 0.07]) {
      for (const bite of [1, 3]) {
        let chomps = 0;
        let gulps = 0;
        for (let t = 0; t < biteLength(bite); t += dt) {
          if (chompsBetween(t, t + dt)) chomps++;
          if (gulpsBetween(bite, t, t + dt)) gulps++;
        }
        expect(chomps).toBe(1);
        expect(gulps).toBe(isGulp(bite) ? 1 : 0);
      }
    }
  });
});

describe('crumbs', () => {
  it('fly up and out, the same way every time from the same seed', () => {
    const a = crumbs(mulberry(7));
    expect(a).toHaveLength(CRUMBS_PER_CHOMP);
    expect(crumbs(mulberry(7))).toEqual(a);
    for (const c of a) {
      expect(Math.abs(c.vx)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(c.vz)).toBeLessThanOrEqual(1.5);
      expect(c.vy).toBeGreaterThanOrEqual(0);
      expect(c.life).toBeGreaterThanOrEqual(0.5);
      expect(c.life).toBeLessThan(0.8);
    }
  });

  it('draw only from the stream they are given', () => {
    let calls = 0;
    const rand = () => {
      calls++;
      return 0.5;
    };
    crumbs(rand, 5);
    expect(calls).toBe(20);
  });
});
