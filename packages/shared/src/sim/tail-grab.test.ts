import { describe, expect, it } from 'vitest';
import { CHARACTERS, wearCharacter } from '../content/characters.ts';
import { classicBuild } from '../content/robot-parts.ts';
import { CIRC } from '../ring-space.ts';
import { hasTail, refuseTailGrab, robotGap, TAIL_GRAB, type TailSeat, tailGripBreaks } from './tail-grab.ts';

const snatch = wearCharacter(classicBuild(), CHARACTERS[0] as (typeof CHARACTERS)[number]);
const seat = (id: string, more: Partial<TailSeat> = {}): TailSeat => ({
  id,
  build: classicBuild(),
  px: 0,
  py: 0,
  pz: 0,
  shown: true,
  holding: '',
  heldBy: '',
  ...more,
});
const ask = { segment: 5, hand: 1 };

describe('grabbing a tail', () => {
  it('only the cat body has a tail', () => {
    expect(hasTail(snatch)).toBe(true);
    expect(hasTail(classicBuild())).toBe(false);
    expect(hasTail({ ...classicBuild(), body: null })).toBe(false);
    // Snatch's head on another body has no tail; the cat body under another head does.
    expect(hasTail({ ...snatch, body: { part: 'ball', paint: '#ffffff' } })).toBe(false);
    expect(hasTail({ ...snatch, head: { part: 'dome', paint: '#ffffff' } })).toBe(true);
  });

  it('lets a robot within reach grab a cat by the tail', () => {
    const cat = seat('cat', { build: snatch, px: 3, pz: 2 });
    expect(refuseTailGrab(seat('me'), cat, ask)).toBeUndefined();
    expect(refuseTailGrab(seat('me', { pz: TAIL_GRAB.reach - 0.01 }), seat('cat', { build: snatch }), ask)).toBe(
      undefined,
    );
  });

  it('refuses one out of reach, measuring the short way round the ring', () => {
    const cat = seat('cat', { build: snatch, pz: TAIL_GRAB.reach + 0.01 });
    expect(refuseTailGrab(seat('me'), cat, ask)).toBe('Too far away.');
    // Across the seam where z wraps, the two are neighbors.
    const across = seat('cat', { build: snatch, pz: CIRC / 2 - 1 });
    expect(robotGap(seat('me', { pz: -CIRC / 2 + 1 }), across)).toBeCloseTo(2, 6);
    expect(refuseTailGrab(seat('me', { pz: -CIRC / 2 + 1 }), across, ask)).toBeUndefined();
  });

  it('refuses a robot with no tail, yourself, someone gone, and a grab with no arms', () => {
    expect(refuseTailGrab(seat('me'), seat('bot'), ask)).toBe("That robot hasn't got a tail.");
    expect(refuseTailGrab(seat('me', { build: snatch }), seat('me', { build: snatch }), ask)).toBe(
      "You can't grab your own tail.",
    );
    expect(refuseTailGrab(seat('me'), undefined, ask)).toBe("That robot isn't aboard.");
    expect(refuseTailGrab(seat('me'), seat('cat', { build: snatch, shown: false }), ask)).toBe(
      "That robot isn't here.",
    );
    expect(
      refuseTailGrab(seat('me', { build: { ...classicBuild(), arms: null } }), seat('cat', { build: snatch }), ask),
    ).toBe('You need arms to grab a tail.');
  });

  it('holds one tail per robot and one robot per tail, by a point past the root, in one of two hands', () => {
    const cat = seat('cat', { build: snatch });
    expect(refuseTailGrab(seat('me', { holding: 'other' }), cat, ask)).toBe("You're holding a tail already.");
    expect(refuseTailGrab(seat('me'), seat('cat', { build: snatch, heldBy: 'friend' }), ask)).toBe(
      'Someone has that tail.',
    );
    for (const segment of [0, TAIL_GRAB.points, 2.5, Number.NaN]) {
      expect(refuseTailGrab(seat('me'), cat, { segment, hand: 0 })).toBe('No such spot.');
    }
    expect(refuseTailGrab(seat('me'), cat, { segment: 1, hand: 0 })).toBeUndefined();
    expect(refuseTailGrab(seat('me'), cat, { segment: TAIL_GRAB.points - 1, hand: 1 })).toBeUndefined();
    expect(refuseTailGrab(seat('me'), cat, { segment: 3, hand: 2 })).toBe('No such hand.');
  });

  it('breaks the grip when the two are pulled too far apart, or one goes out of sight', () => {
    expect(tailGripBreaks(seat('me'), seat('cat', { px: TAIL_GRAB.breakAt - 0.1 }))).toBe(false);
    expect(tailGripBreaks(seat('me'), seat('cat', { px: TAIL_GRAB.breakAt + 0.1 }))).toBe(true);
    expect(tailGripBreaks(seat('me', { shown: false }), seat('cat'))).toBe(true);
    expect(TAIL_GRAB.breakAt).toBeGreaterThan(TAIL_GRAB.reach);
  });
});
