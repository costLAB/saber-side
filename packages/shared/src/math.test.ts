import { describe, expect, it } from 'vitest';
import { clamp, damp, lerp, smooth } from './math';

describe('math helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('lerps', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
  });

  it('damps the same distance whether the time is taken in one step or many', () => {
    const once = damp(0, 10, 3, 0.5);
    let many = 0;
    for (let i = 0; i < 50; i++) many = damp(many, 10, 3, 0.01);
    expect(many).toBeCloseTo(once, 10);
  });

  it('smoothsteps between the edges', () => {
    expect(smooth(0, 1, -1)).toBe(0);
    expect(smooth(0, 1, 2)).toBe(1);
    expect(smooth(0, 1, 0.5)).toBe(0.5);
  });
});
