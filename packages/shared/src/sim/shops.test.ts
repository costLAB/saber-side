import { describe, expect, it } from 'vitest';
import { insideSpot, SHOP_ROW, SPOTS, spotById } from '../content/spots.ts';
import {
  accrue,
  cleanShopName,
  RENT_PER_HOUR,
  rentPerHour,
  SETTLE_SECONDS,
  SHOP_NAME_MAX,
  TRICKLE_PER_HOUR,
  tricklePerHour,
} from './shops.ts';

describe('shop spots', () => {
  it('stand in a row on the plaza, side by side without overlapping', () => {
    const sorted = [...SPOTS].sort((a, b) => a.z - b.z);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a && b) expect(b.z - b.width / 2).toBeGreaterThan(a.z + a.width / 2);
    }
    for (const s of SPOTS) {
      expect(Math.abs(s.z) + s.width / 2).toBeLessThan(36); // the plaza's stretch, kept clear of other shops
      expect(spotById(s.id)).toBe(s);
    }
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
  });

  it('know which one a robot has driven into', () => {
    const p2 = spotById('plaza-2');
    if (!p2) throw new Error('no plaza-2');
    expect(insideSpot(SHOP_ROW.front + 3, p2.z)).toBe(p2);
    expect(insideSpot(SHOP_ROW.front - 1, p2.z)).toBeUndefined(); // still out on the walkway
    expect(insideSpot(SHOP_ROW.front + 3, 0.5 * (p2.z + p2.width / 2 + 2))).not.toBe(p2);
  });
});

describe('shop money', () => {
  it('pays a first shop more than its rent, wherever it is', () => {
    for (const s of SPOTS) expect(tricklePerHour(s)).toBeGreaterThan(rentPerHour(s));
    // busier spots earn more and cost more; bigger ones just cost more
    expect(tricklePerHour({ traffic: 1.3 })).toBeCloseTo(TRICKLE_PER_HOUR * 1.3);
    expect(rentPerHour({ traffic: 1, size: 'S' })).toBe(RENT_PER_HOUR);
    expect(rentPerHour({ traffic: 1, size: 'L' })).toBe(RENT_PER_HOUR * 2);
  });

  it('adds up to whole shards, carrying the fraction over so none is lost', () => {
    const first = accrue(0, 240, SETTLE_SECONDS); // 240 an hour for 5 minutes
    expect(first).toEqual({ shards: 20, carry: 0 });
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const step = accrue(carry, 70, SETTLE_SECONDS); // 70 an hour: 5.83 a settlement
      total += step.shards;
      carry = step.carry;
    }
    expect(total).toBe(70);
    expect(carry).toBeLessThan(1e-6);
    expect(accrue(0.5, 0, 100)).toEqual({ shards: 0, carry: 0.5 });
    expect(accrue(0, 100, -5)).toEqual({ shards: 0, carry: 0 });
  });

  it('cleans shop names', () => {
    expect(cleanShopName('  Mia’s   Carrots ')).toBeUndefined(); // curly apostrophes aren't on the list
    expect(cleanShopName("  Mia's   Carrots ")).toBe("Mia's Carrots");
    expect(cleanShopName('Rock & Roll!')).toBe('Rock & Roll!');
    for (const bad of ['', '   ', '!wow', 'x'.repeat(SHOP_NAME_MAX + 1), 7, undefined, 'a<b>']) {
      expect(cleanShopName(bad)).toBeUndefined();
    }
  });
});
