import { describe, expect, it } from 'vitest';
import {
  openOrbit,
  orbitOffset,
  robotToStrip,
  SELFIE,
  spinMini,
  steerOrbit,
  turnOrbit,
  twistMini,
  zoomOrbit,
} from './selfie.ts';

describe('the Selfie orbit', () => {
  it('starts in front of the robot, a little above level, at the set distance', () => {
    const p = orbitOffset(openOrbit());
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeGreaterThan(4);
    expect(p.y).toBeGreaterThan(SELFIE.lookHeight);
    expect(Math.hypot(p.x, p.y - SELFIE.lookHeight, p.z)).toBeCloseTo(SELFIE.distance);
  });

  it('goes round to the robot’s left with a bigger turn, and behind it at half a turn', () => {
    const left = orbitOffset(turnOrbit(openOrbit(), Math.PI / 2, 0));
    expect(left.x).toBeGreaterThan(4);
    expect(left.z).toBeCloseTo(0);
    const behind = orbitOffset(turnOrbit(openOrbit(), Math.PI, 0));
    expect(behind.z).toBeLessThan(-4);
  });

  it('keeps the tilt within its limits, and the zoom too', () => {
    expect(turnOrbit(openOrbit(), 0, 10).tilt).toBe(SELFIE.tiltMax);
    expect(turnOrbit(openOrbit(), 0, -10).tilt).toBe(SELFIE.tiltMin);
    expect(zoomOrbit(openOrbit(), 100).zoom).toBe(SELFIE.zoomMax);
    expect(zoomOrbit(openOrbit(), 0.01).zoom).toBe(SELFIE.zoomMin);
    const near = orbitOffset(zoomOrbit(openOrbit(), 0.6));
    expect(near.z).toBeLessThan(orbitOffset(openOrbit()).z);
  });

  it('turns right with the right arrow and tilts up with the up arrow, at the set rate', () => {
    const o = steerOrbit(openOrbit(), 1, 1, 0.5);
    expect(o.turn).toBeCloseTo(-SELFIE.turnRate * 0.5);
    expect(o.tilt).toBeGreaterThan(openOrbit().tilt);
  });

  it('turns the robot’s frame onto the strip by its heading', () => {
    const ahead = robotToStrip({ x: 0, y: 2, z: 1 }, Math.PI / 2);
    expect(ahead.x).toBeCloseTo(1);
    expect(ahead.y).toBe(2);
    expect(ahead.z).toBeCloseTo(0);
    const left = robotToStrip({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    expect(left.z).toBeCloseTo(-1);
  });
});

describe('the mini-me in VR', () => {
  it('spins with the stick and tilts within its limits', () => {
    const o = spinMini(openOrbit(), 1, 0, 1);
    expect(o.turn).toBeCloseTo(SELFIE.turnRate);
    expect(spinMini(openOrbit(), 0, -1, 100).tilt).toBe(SELFIE.miniTiltMax);
    expect(spinMini(openOrbit(), 0, 1, 100).tilt).toBe(-SELFIE.miniTiltMax);
  });

  it('follows a grabbing hand’s twist from where it was grabbed', () => {
    const start = { turn: 1, tilt: 0.2, zoom: 1 };
    const o = twistMini(start, 0.5, 0.3);
    expect(o.turn).toBeCloseTo(1.5);
    expect(o.tilt).toBeCloseTo(0.5);
    expect(twistMini(start, 0, 5).tilt).toBe(SELFIE.miniTiltMax);
  });
});
