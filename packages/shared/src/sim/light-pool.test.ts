import { describe, expect, it } from 'vitest';
import { assignLights, pickLit, SABER_LIGHTS } from './light-pool.ts';

describe('the saber light pool', () => {
  it('lights the nearest lit sabers, no more than the pool holds', () => {
    expect(SABER_LIGHTS).toBe(2);
    // five sabers: the third is unlit, the rest are lit at different distances
    const levels = [1.6, 1.6, 0, 1.2, 0.8];
    const dists = [9, 2, 1, 5, 3];
    expect(pickLit(levels, dists, 2)).toEqual([1, 4]);
    expect(pickLit([0, 0.01], [1, 1], 2)).toEqual([]);
  });

  it('keeps a light on its saber while that saber is still picked', () => {
    expect(assignLights([0, 1], [1, 0])).toEqual([0, 1]);
    expect(assignLights([0, 1], [1, 4])).toEqual([4, 1]);
    expect(assignLights([0, 1], [3])).toEqual([3, -1]);
    expect(assignLights([-1, -1], [2, 5])).toEqual([2, 5]);
  });
});
