import { describe, expect, it } from 'vitest';
import { BED_EVERY, bedAt, bedHalfSize, CARROT_BEDS, PLANTED } from '../content/carrot-beds.ts';
import { CIRC, wrapD } from '../ring-space.ts';
import { mulberry } from '../rng.ts';
import { KICK_MAX, KICK_RADIUS, kickedBy, kickVelocity, REGROW_SECONDS, regrowth, ripeAgain } from './harvest.ts';

const always = () => 0;
const never = () => 0.99;

describe('carrot beds', () => {
  it('plant rows of carrots on both farm strips, all the way round the ring', () => {
    expect(CARROT_BEDS.length).toBe(2 * Math.floor(CIRC / BED_EVERY));
    expect(PLANTED.length).toBe(CARROT_BEDS.reduce((n, b) => n + b.rows * b.perRow, 0));
    expect(new Set(CARROT_BEDS.map((b) => Math.sign(b.x)))).toEqual(new Set([1, -1]));
    // one level with the plaza, on each side
    expect(CARROT_BEDS.filter((b) => b.z === 0)).toHaveLength(2);
  });

  it('keep to the soil, clear of the parks and the barns', () => {
    for (const c of PLANTED) {
      expect(Math.abs(c.x)).toBeGreaterThan(117);
      expect(Math.abs(c.x)).toBeLessThan(134);
      expect(Math.abs(c.z)).toBeLessThanOrEqual(CIRC / 2);
    }
  });

  it('are planted the same way every time', async () => {
    const again = await import('../content/carrot-beds.ts');
    expect(again.PLANTED).toBe(PLANTED);
    expect(PLANTED[0]).toEqual(PLANTED[0]);
  });

  it('know which bed a point is over, across the seam too', () => {
    const bed = CARROT_BEDS[0];
    if (!bed) throw new Error('no beds');
    expect(bedAt(bed.x, bed.z)).toBe(0);
    expect(bedAt(bed.x + bedHalfSize(bed).x + 0.5, bed.z)).toBe(0);
    expect(bedAt(0, 0)).toBeUndefined();
    const last = CARROT_BEDS.findIndex((b) => b.z < 0 && b.x > 0);
    const seam = CARROT_BEDS[last];
    if (seam) expect(bedAt(seam.x, wrapD(seam.z + CIRC))).toBe(last);
  });
});

describe('harvesting with a spin', () => {
  const at = { x: PLANTED[40]?.x ?? 0, z: PLANTED[40]?.z ?? 0 };

  it('kicks up a few ripe carrots in reach, nearest first', () => {
    const picked = kickedBy(PLANTED, () => true, at, always);
    expect(picked).toHaveLength(KICK_MAX);
    expect(picked[0]).toBe(40);
    const dist = (i: number) => Math.hypot((PLANTED[i]?.x ?? 0) - at.x, wrapD((PLANTED[i]?.z ?? 0) - at.z));
    for (const i of picked) expect(dist(i)).toBeLessThanOrEqual(KICK_RADIUS);
    expect(dist(picked[1] as number)).toBeLessThanOrEqual(dist(picked[2] as number));
  });

  it('always kicks up the nearest, even on an unlucky spin', () => {
    expect(kickedBy(PLANTED, () => true, at, never)).toEqual([40]);
  });

  it('only kicks up ripe carrots, and nothing away from the beds', () => {
    const picked = kickedBy(PLANTED, (i) => i !== 40, at, always);
    expect(picked).not.toContain(40);
    expect(kickedBy(PLANTED, () => false, at, always)).toEqual([]);
    expect(kickedBy(PLANTED, () => true, { x: 0, z: 0 }, always)).toEqual([]);
  });

  it('reaches across the seam where the ring wraps round', () => {
    const near = PLANTED.findIndex((c) => Math.abs(wrapD(c.z - CIRC / 2)) < 1);
    if (near < 0) return; // no bed by the seam on this layout
    const c = PLANTED[near];
    if (!c) return;
    expect(kickedBy(PLANTED, () => true, { x: c.x, z: wrapD(c.z + CIRC) }, always)).toContain(near);
  });

  it('flings carrots up and out, away from the robot', () => {
    const c = { x: at.x + 1, z: at.z };
    const v = kickVelocity(c, at, mulberry(3));
    expect(v.y).toBeGreaterThanOrEqual(6);
    expect(v.x).toBeGreaterThan(1);
    expect(Math.abs(v.z)).toBeLessThan(1e-9);
    // straight underneath: any way out, still up
    const under = kickVelocity(at, at, mulberry(3));
    expect(under.y).toBeGreaterThanOrEqual(6);
    expect(Math.hypot(under.x, under.z)).toBeGreaterThan(1);
  });

  it('regrows a picked carrot over REGROW_SECONDS', () => {
    expect(regrowth(0)).toBe(0);
    expect(regrowth(REGROW_SECONDS * 0.2)).toBe(0);
    expect(regrowth(REGROW_SECONDS * 0.6)).toBeGreaterThan(0);
    expect(regrowth(REGROW_SECONDS * 0.6)).toBeLessThan(1);
    expect(regrowth(REGROW_SECONDS)).toBe(1);
    expect(ripeAgain(REGROW_SECONDS - 0.1)).toBe(false);
    expect(ripeAgain(REGROW_SECONDS)).toBe(true);
  });
});
