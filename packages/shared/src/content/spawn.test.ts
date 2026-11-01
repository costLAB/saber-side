import { describe, expect, it } from 'vitest';
import { CIRC } from '../ring-space.ts';
import { BOT_MAKER, insideBotMaker } from './spawn.ts';

describe('insideBotMaker', () => {
  const B = BOT_MAKER;

  it('counts where a new robot starts as inside', () => {
    expect(insideBotMaker(B.spawn.x, B.spawn.z)).toBe(true);
  });

  it("doesn't count the walkway, or the doorway itself", () => {
    expect(insideBotMaker(B.spawn.rollToX, B.z)).toBe(false);
    expect(insideBotMaker(B.front + 1, B.z)).toBe(false);
    expect(insideBotMaker(B.front - 0.5, B.z)).toBe(false);
    expect(insideBotMaker(B.front - 1.5, B.z)).toBe(true);
  });

  it('ends at the side walls, the same on every lap of the ring', () => {
    expect(insideBotMaker(B.spawn.x, B.z + B.width / 2 + 0.1)).toBe(false);
    expect(insideBotMaker(B.spawn.x, B.z - B.width / 2 + 0.1)).toBe(true);
    expect(insideBotMaker(B.spawn.x, B.z + CIRC)).toBe(true);
  });
});
