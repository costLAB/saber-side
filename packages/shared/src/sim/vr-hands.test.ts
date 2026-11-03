import { describe, expect, it } from 'vitest';
import type { XYZ } from '../ring-space.ts';
import {
  atMouth,
  controllerCurl,
  type HandJoints,
  handGesture,
  MOUTH_BELOW,
  MOUTH_OFF,
  MOUTH_ON,
  mouthPoint,
  OPEN_HAND,
} from './vr-hands.ts';

const at = (x: number, y: number, z: number): XYZ => ({ x, y, z });

/** A hand with its fingertips this far from the wrist (straight out along -z), and the thumb tip `gap` from the index. */
function hand(reach: number, gap: number): HandJoints {
  return {
    wrist: at(0, 0, 0),
    indexTip: at(0.02, 0, -reach),
    thumbTip: at(0.02 + gap, 0, -reach),
    middleTip: at(0, 0, -reach),
    ringTip: at(-0.02, 0, -reach),
    pinkyTip: at(-0.04, 0, -reach),
  };
}

describe('controllerCurl', () => {
  it('opens at rest and closes on a squeeze, the trigger curling a little', () => {
    expect(controllerCurl(0, 0)).toBeCloseTo(0.15);
    expect(controllerCurl(1, 0)).toBeCloseTo(1);
    expect(controllerCurl(0, 1)).toBeGreaterThan(0.5);
    expect(controllerCurl(0, 1)).toBeLessThan(controllerCurl(1, 0));
  });
});

describe('handGesture', () => {
  it('reads an open hand as neither', () => {
    const g = handGesture(hand(0.18, 0.09));
    expect(g).toMatchObject({ pinch: false, fist: false });
    expect(g.curl).toBeCloseTo(0, 1);
  });

  it('reads thumb on index as a pinch', () => {
    expect(handGesture(hand(0.17, 0.005)).pinch).toBe(true);
  });

  it('reads curled fingers as a fist, and a fist is no pinch', () => {
    const g = handGesture(hand(0.07, 0.005));
    expect(g.fist).toBe(true);
    expect(g.pinch).toBe(false);
    expect(g.curl).toBeGreaterThan(0.9);
  });

  it('has slack between closing and opening, so a hand at the edge holds steady', () => {
    const edge = hand(0.11, 0.028);
    expect(handGesture(edge, OPEN_HAND).fist).toBe(false);
    expect(handGesture(edge, { pinch: false, fist: true, curl: 1 }).fist).toBe(true);
    const pinchEdge = hand(0.17, 0.028);
    expect(handGesture(pinchEdge, OPEN_HAND).pinch).toBe(false);
    expect(handGesture(pinchEdge, { pinch: true, fist: false, curl: 0.4 }).pinch).toBe(true);
  });
});

describe('the mouth', () => {
  const head = at(0, 1.6, 0);
  const mouth = mouthPoint(head, at(0, -1, 0), at(0, 0, -1));

  it('sits a little below and in front of the eyes', () => {
    expect(mouth.y).toBeCloseTo(1.6 - MOUTH_BELOW);
    expect(mouth.z).toBeLessThan(0);
  });

  it('takes a carrot brought up close, and lets go once it moves away', () => {
    const near = at(mouth.x, mouth.y, mouth.z - (MOUTH_ON - 0.02));
    const between = at(mouth.x, mouth.y, mouth.z - (MOUTH_ON + MOUTH_OFF) / 2);
    const far = at(mouth.x, mouth.y - 0.5, mouth.z - 0.3);
    expect(atMouth(far, mouth, false)).toBe(false);
    expect(atMouth(near, mouth, false)).toBe(true);
    expect(atMouth(between, mouth, true)).toBe(true);
    expect(atMouth(between, mouth, false)).toBe(false);
    expect(atMouth(far, mouth, true)).toBe(false);
  });
});
