import { describe, expect, it } from 'vitest';
import { hitButton, pressEdge, touchSpot, WRIST, wristFacing } from './vr-wrist.ts';

describe('the wrist panel', () => {
  it('shows when it faces your eyes, with slack before it hides again', () => {
    const at = { x: 0, y: 1, z: -0.3 };
    const head = { x: 0, y: 1.6, z: 0 };
    const toward = { x: 0, y: 0.6, z: 0.3 };
    expect(wristFacing(toward, at, head, false)).toBe(true);
    expect(wristFacing({ x: 0, y: -1, z: 0 }, at, head, true)).toBe(false);
    // a little off square: it stays shown, but doesn't show from hidden
    const askew = { x: 1, y: 0.6, z: 0.3 };
    const c = (0.6 * 0.6 + 0.3 * 0.3) / Math.hypot(1, 0.6, 0.3) / Math.hypot(0.6, 0.3);
    expect(c).toBeGreaterThan(WRIST.hideFacing);
    expect(c).toBeLessThan(WRIST.showFacing);
    expect(wristFacing(askew, at, head, true)).toBe(true);
    expect(wristFacing(askew, at, head, false)).toBe(false);
  });

  it('finds where a fingertip touches, only near its face and over it', () => {
    expect(touchSpot({ x: 0, y: 0, z: 0.01 })).toEqual({ u: 0.5, v: 0.5 });
    const corner = touchSpot({ x: -WRIST.width / 2, y: WRIST.height / 2, z: 0 });
    expect(corner?.u).toBeCloseTo(0);
    expect(corner?.v).toBeCloseTo(0);
    expect(touchSpot({ x: 0, y: 0, z: 0.05 })).toBeNull();
    expect(touchSpot({ x: 0.2, y: 0, z: 0 })).toBeNull();
  });

  it('presses the button under the touch', () => {
    const buttons = [
      { id: 'a', rect: { u: 0, v: 0.7, w: 0.3, h: 0.3 } },
      { id: 'b', rect: { u: 0.35, v: 0.7, w: 0.3, h: 0.3 } },
    ];
    expect(hitButton({ u: 0.5, v: 0.8 }, buttons)?.id).toBe('b');
    expect(hitButton({ u: 0.5, v: 0.2 }, buttons)).toBeNull();
    expect(hitButton(null, buttons)).toBeNull();
  });

  it('presses once per touch, until the finger comes away', () => {
    let s = { press: null as string | null, armed: true };
    s = pressEdge(s.armed, 'exit', 0);
    expect(s.press).toBe('exit');
    s = pressEdge(s.armed, 'exit', 0);
    expect(s.press).toBeNull();
    s = pressEdge(s.armed, null, 0.03);
    expect(s.armed).toBe(false);
    s = pressEdge(s.armed, null, 0.08);
    expect(s.armed).toBe(true);
    expect(pressEdge(s.armed, 'exit', 0).press).toBe('exit');
  });
});
