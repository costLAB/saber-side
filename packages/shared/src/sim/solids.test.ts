import { describe, expect, it } from 'vitest';
import { CIRC } from '../ring-space.ts';
import { floorTouch, groundUnder, pushOut, type Solid, solidContact, solidsTouch } from './solids.ts';

const R = 0.1;
const box: Solid = { x: 0, z: 0, hw: 1, hd: 2, top: 3 };
const post: Solid = { x: 5, z: 0, r: 0.5, top: 4 };

describe('solids', () => {
  it('finds the floor under a ball that dips below its radius', () => {
    const floor = floorTouch(R);
    expect(floor({ x: 0, y: 1, z: 0 })).toBeNull();
    const c = floor({ x: 0, y: 0.04, z: 0 });
    expect(c?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(c?.depth).toBeCloseTo(0.06, 9);
  });

  it('pushes a ball out of a box through its nearest side, or up through its top', () => {
    expect(solidContact({ x: 1.2, y: 1, z: 0 }, box, R)).toBeNull();
    const side = solidContact({ x: 0.95, y: 1, z: 0 }, box, R);
    expect(side?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(side?.depth).toBeCloseTo(0.15, 9);
    expect(solidContact({ x: 0, y: 1, z: -1.98 }, box, R)?.normal).toEqual({ x: 0, y: 0, z: -1 });
    const top = solidContact({ x: 0, y: 3.05, z: 0 }, box, R);
    expect(top?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(top?.depth).toBeCloseTo(0.05, 9);
    expect(solidContact({ x: 0, y: 3.2, z: 0 }, box, R)).toBeNull();
  });

  it('pushes a ball out of a round post sideways, and finds its top', () => {
    const side = solidContact({ x: 5.4, y: 2, z: 0.3 }, post, R);
    expect(side?.normal.x).toBeCloseTo(0.8, 9);
    expect(side?.normal.z).toBeCloseTo(0.6, 9);
    expect(side?.depth).toBeCloseTo(0.1, 9);
    expect(solidContact({ x: 5, y: 4.05, z: 0 }, post, R)?.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('leaves a solid without a top alone, and finds solids across the seam of the ring', () => {
    expect(solidContact({ x: 0, y: 1, z: 0 }, { x: 0, z: 0, hw: 1, hd: 1 }, R)).toBeNull();
    const seam: Solid = { x: 0, z: CIRC / 2 - 0.2, hw: 1, hd: 1, top: 2 };
    expect(solidContact({ x: 0, y: 1, z: -CIRC / 2 + 0.2 }, seam, R)).not.toBeNull();
  });

  it('touches whichever is deepest, the floor included, and pushes out of a corner', () => {
    const touch = solidsTouch([[box, post]], R);
    expect(touch({ x: 0.9, y: 2, z: 0 })?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(touch({ x: 3, y: 0.05, z: 0 })?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(touch({ x: 3, y: 2, z: 0 })).toBeNull();
    const out = pushOut({ x: 0.95, y: 0.02, z: 1.95 }, touch);
    expect(touch(out)).toBeNull();
  });

  it('stands a robot on the highest top under it that isn’t above it', () => {
    const lists = [[box, post]];
    expect(groundUnder(0, 0, 5, lists, 0.3)).toBe(3);
    expect(groundUnder(0, 0, 2, lists, 0.3)).toBe(0);
    // within the margin of a narrow top
    expect(groundUnder(5.7, 0, 4, lists, 0.3)).toBe(4);
    expect(groundUnder(6, 0, 4, lists, 0.3)).toBe(0);
  });
});
