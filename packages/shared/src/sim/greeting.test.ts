import { describe, expect, it } from 'vitest';
import { CIRC } from '../ring-space.ts';
import { firstMeetings, GREET_RANGE, ringDistance } from './greeting.ts';

const at = (x: number, z: number) => ({ x, y: 0, z });

describe('greeting', () => {
  it('measures the short way round the ring', () => {
    expect(ringDistance(at(0, CIRC / 2 - 1), at(0, -CIRC / 2 + 1))).toBeCloseTo(2);
  });

  it('greets a player who comes within range', () => {
    const met = new Set<string>();
    expect(firstMeetings(at(0, 0), [['a', at(GREET_RANGE + 1, 0)]], met)).toEqual([]);
    expect(firstMeetings(at(0, 0), [['a', at(GREET_RANGE - 1, 0)]], met)).toEqual(['a']);
  });

  it('greets each player only the first time', () => {
    const met = new Set<string>();
    const near: [string, ReturnType<typeof at>][] = [['a', at(1, 0)]];
    expect(firstMeetings(at(0, 0), near, met)).toEqual(['a']);
    expect(firstMeetings(at(0, 0), near, met)).toEqual([]);
    expect(firstMeetings(at(0, 0), [['a', at(50, 0)]], met)).toEqual([]);
    expect(firstMeetings(at(0, 0), near, met)).toEqual([]);
    expect(firstMeetings(at(0, 0), [...near, ['b', at(0, 2)]], met)).toEqual(['b']);
  });
});
