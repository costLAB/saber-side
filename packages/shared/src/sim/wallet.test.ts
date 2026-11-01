import { describe, expect, it } from 'vitest';
import { ccToShards, SHARDS_PER_CC, splitShards, walletText } from './wallet.ts';

describe('the wallet readout', () => {
  it('shows crystals and two-digit shards', () => {
    expect(walletText(0)).toBe('0 ◆ 00');
    expect(walletText(5)).toBe('0 ◆ 05');
    expect(walletText(1245)).toBe('12 ◆ 45');
    expect(walletText(SHARDS_PER_CC * 25)).toBe('25 ◆ 00');
    expect(walletText(-150)).toBe('-1 ◆ 50');
  });

  it('splits shards into crystals', () => {
    expect(splitShards(1245)).toEqual({ cc: 12, shards: 45 });
  });

  it('turns typed crystals into whole shards', () => {
    expect(ccToShards(1.5)).toBe(150);
    expect(ccToShards(-2)).toBe(-200);
    expect(ccToShards(0.123)).toBe(12);
    expect(ccToShards(Number.NaN)).toBeUndefined();
    expect(ccToShards(1e300)).toBeUndefined();
  });
});
