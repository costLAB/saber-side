import { describe, expect, it } from 'vitest';
import { POSE, readPose } from './pose.ts';

describe('pose messages', () => {
  const good = POSE.map(() => 0.5);

  it('accepts one finite number per field', () => {
    expect(readPose(good)).toBe(good);
  });

  it('rejects anything else', () => {
    for (const bad of [undefined, 'x', {}, [], good.slice(1), [...good, 1], good.map(() => Number.NaN)]) {
      expect(readPose(bad)).toBeUndefined();
    }
    expect(readPose(good.map((v, i) => (i === 0 ? 1e9 : v)))).toBeUndefined();
    expect(readPose(good.map((v, i) => (i === 3 ? '1' : v)))).toBeUndefined();
  });

  it('has unique field names', () => {
    expect(new Set(POSE.map(([name]) => name)).size).toBe(POSE.length);
  });
});
