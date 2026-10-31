import { describe, expect, it } from 'vitest';
import { bendPoint, bendUp, CIRC, OMEGA, R_IN, RPM, UNIT_M, unbend, wrapD, type XYZ } from './ring-space';

class V implements XYZ {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

describe('ring geometry', () => {
  it('spins for 1 g at the floor, about 3.05 rpm', () => {
    const rMeters = R_IN * UNIT_M;
    expect(OMEGA * OMEGA * rMeters).toBeCloseTo(9.81, 6);
    expect(RPM).toBeCloseTo(3.05, 2);
  });

  it('keeps the 4 ft robot at 3.35 units, about 1.22 m', () => {
    expect(3.35 * UNIT_M).toBeCloseTo(1.2192, 4);
  });
});

describe('bendPoint / unbend', () => {
  it('puts the floor at the floor radius and strip z = 0 at the bottom', () => {
    const p = bendPoint(new V(0, 0, 0), new V());
    expect(p.y).toBeCloseTo(-R_IN, 9);
    expect(p.z).toBeCloseTo(0, 9);
    for (const z of [0, 10, 100, CIRC / 3]) {
      const q = bendPoint(new V(5, 0, z), new V());
      expect(Math.hypot(q.y, q.z)).toBeCloseTo(R_IN, 9);
    }
  });

  it('puts height R_IN on the spin axis', () => {
    const p = bendPoint(new V(3, R_IN, 42), new V());
    expect(Math.hypot(p.y, p.z)).toBeCloseTo(0, 9);
  });

  it('round-trips strip → real → strip', () => {
    for (const [x, y, z] of [
      [0, 0, 0],
      [12.5, 3, 40],
      [-80, 30, -150],
      [100, 200, CIRC / 2 - 1],
    ] as const) {
      const back = unbend(bendPoint(new V(x, y, z), new V()), new V());
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
      expect(back.z).toBeCloseTo(z, 9);
    }
  });

  it('bendUp points from the floor toward the axis', () => {
    for (const z of [0, 33, -200, CIRC / 4]) {
      const up = bendUp(z, new V());
      const floor = bendPoint(new V(0, 0, z), new V());
      expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 12);
      // the floor point plus R_IN along "up" lands on the axis
      expect(floor.y + up.y * R_IN).toBeCloseTo(0, 9);
      expect(floor.z + up.z * R_IN).toBeCloseTo(0, 9);
    }
  });
});

describe('wrapD', () => {
  it('takes the short way around the ring', () => {
    expect(wrapD(10)).toBeCloseTo(10, 9);
    expect(wrapD(CIRC - 10)).toBeCloseTo(-10, 9);
    expect(wrapD(-CIRC + 10)).toBeCloseTo(10, 9);
    expect(wrapD(3 * CIRC + 5)).toBeCloseTo(5, 6);
  });
});
