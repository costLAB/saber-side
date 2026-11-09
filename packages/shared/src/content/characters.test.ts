import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterOf, wearCharacter } from './characters.ts';
import { classicBuild, cleanRobotBuild, isPart, ORIGINAL_PAINT } from './robot-parts.ts';

const SKY = '#8fc4f2';

describe('characters', () => {
  it('are made of parts that exist, each in its own slot', () => {
    expect(CHARACTERS.map((c) => c.name)).toContain('Snatch');
    for (const c of CHARACTERS) {
      expect(isPart('body', c.parts.body)).toBe(true);
      expect(isPart('head', c.parts.head)).toBe(true);
      expect(isPart('arms', c.parts.arms)).toBe(true);
      expect(isPart('mobility', c.mobility)).toBe(true);
    }
  });

  it('put on a head, body, and arms in their original skins, on their own roller in the old paint', () => {
    const snatch = CHARACTERS.find((c) => c.id === 'snatch');
    if (!snatch) throw new Error('no Snatch');
    const start = { ...classicBuild(SKY), mobility: { part: 'wheel' as const, paint: SKY } };
    const worn = wearCharacter(start, snatch);
    expect(worn).toEqual({
      mobility: { part: 'roller', paint: SKY },
      body: { part: 'cat', paint: ORIGINAL_PAINT },
      head: { part: 'cat', paint: ORIGINAL_PAINT },
      arms: { part: 'cat', paint: ORIGINAL_PAINT },
    });
    expect(cleanRobotBuild(worn)).toEqual(worn);
    expect(characterOf(worn)).toBe(snatch);
    // Painted, it's still Snatch; with any part swapped, it's a mix.
    expect(characterOf({ ...worn, body: { part: 'cat', paint: SKY } })).toBe(snatch);
    expect(characterOf({ ...worn, head: { part: 'dome', paint: ORIGINAL_PAINT } })).toBeUndefined();
    expect(characterOf(classicBuild())).toBeUndefined();
    // On the big wheel, it's still Snatch.
    expect(characterOf({ ...worn, mobility: { part: 'wheel', paint: SKY } })).toBe(snatch);
  });

  it('mix with the classic parts', () => {
    const mixed = { ...classicBuild(), head: { part: 'cat', paint: SKY } };
    expect(cleanRobotBuild(mixed)).toEqual(mixed);
    const catOnBall = { ...classicBuild(), body: { part: 'cat', paint: ORIGINAL_PAINT }, arms: null };
    expect(cleanRobotBuild(catOnBall)).toEqual(catOnBall);
  });
});
