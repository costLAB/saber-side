import { describe, expect, it } from 'vitest';
import { BOOST, CRUISE_SPACE, CRUISE_SURFACE, makeShip, NO_INPUT, steerShip } from './ship.ts';
import { COCKPIT, stickInput, throttleInput, throttleSpeed, withinReach } from './vr-cockpit.ts';

describe('the cockpit controls', () => {
  it('pushes the stick forward to dive, pulls it back to climb, and tilts it to turn', () => {
    const t = COCKPIT.tiltFull;
    expect(stickInput({ x: 0, y: 0, z: -t }, 0).pitch).toBe(-1);
    expect(stickInput({ x: 0, y: 0, z: t }, 0).pitch).toBe(1);
    expect(stickInput({ x: -t, y: 0, z: 0 }, 0).turn).toBe(1);
    expect(stickInput({ x: t, y: 0, z: 0 }, 0).turn).toBe(-1);
  });

  it('twists to turn, and ignores a hand resting near the middle', () => {
    expect(stickInput({ x: 0, y: 0, z: 0 }, COCKPIT.twistFull).turn).toBe(1);
    expect(stickInput({ x: 0, y: 0, z: 0 }, -COCKPIT.twistFull * 2).turn).toBe(-1);
    const small = stickInput({ x: COCKPIT.tiltFull * 0.05, y: 0, z: COCKPIT.tiltFull * 0.05 }, 0.02);
    expect(small.pitch).toBe(0);
    expect(small.turn).toBe(0);
  });

  it('slides the throttle forward and back from where it was grabbed, within its travel', () => {
    expect(throttleInput(0.5, -COCKPIT.throttleTravel / 2)).toBeCloseTo(1);
    expect(throttleInput(0.5, COCKPIT.throttleTravel / 4)).toBeCloseTo(0.25);
    expect(throttleInput(0.2, 5)).toBe(0);
  });

  it('brakes at the back, cruises in the middle, and boosts at the front', () => {
    expect(throttleSpeed(0, false)).toBe(0);
    expect(throttleSpeed(0.5, false)).toBe(CRUISE_SPACE);
    expect(throttleSpeed(1, false)).toBe(CRUISE_SPACE * BOOST);
    expect(throttleSpeed(0.5, true)).toBe(CRUISE_SURFACE);
    expect(throttleSpeed(0, true)).toBeGreaterThan(0);
  });

  it('takes hold of a control only within reach', () => {
    expect(withinReach({ ...COCKPIT.stick, x: COCKPIT.stick.x + 0.05 }, COCKPIT.stick)).toBe(true);
    expect(withinReach({ ...COCKPIT.stick, x: COCKPIT.stick.x + 0.3 }, COCKPIT.stick)).toBe(false);
  });

  it('flies the ship at the throttle’s speed, and from the keyboard as before', () => {
    const s = makeShip();
    for (let i = 0; i < 600; i++) steerShip(s, { ...NO_INPUT, speed: throttleSpeed(1, false) }, 1 / 60, false);
    expect(s.speed).toBeCloseTo(CRUISE_SPACE * BOOST, 0);
    const k = makeShip();
    for (let i = 0; i < 600; i++) steerShip(k, NO_INPUT, 1 / 60, false);
    expect(k.speed).toBeCloseTo(CRUISE_SPACE, 0);
  });
});
