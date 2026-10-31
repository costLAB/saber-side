import { describe, expect, it } from 'vitest';
import { mulberry } from './rng';

describe('mulberry', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry(101);
    const b = mulberry(101);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = mulberry(1);
    const b = mulberry(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b()) same++;
    }
    expect(same).toBe(0);
  });
});
