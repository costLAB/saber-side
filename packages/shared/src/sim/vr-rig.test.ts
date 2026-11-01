import { describe, expect, it } from 'vitest';
import {
  headYaw,
  RIG_SCALE_MAX,
  RIG_SCALE_MIN,
  rigScale,
  rigToStrip,
  SNAP_TURN,
  snapTurn,
  stickHeading,
  turnToward,
  wrapAngle,
} from './vr-rig.ts';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('wrapAngle', () => {
  it('wraps into (-π, π]', () => {
    close(wrapAngle(0), 0);
    close(wrapAngle(Math.PI), Math.PI);
    close(wrapAngle(-Math.PI), Math.PI);
    close(wrapAngle(3 * Math.PI), Math.PI);
    close(wrapAngle(Math.PI / 2 + 4 * Math.PI), Math.PI / 2);
    close(wrapAngle(-Math.PI / 2 - 4 * Math.PI), -Math.PI / 2);
  });
});

describe('headYaw', () => {
  it('is 0 looking straight ahead (down -z) and positive looking left', () => {
    close(headYaw(0, -1), 0);
    close(headYaw(-1, 0), Math.PI / 2);
    close(headYaw(1, 0), -Math.PI / 2);
    close(Math.abs(headYaw(0, 1)), Math.PI);
  });
});

describe('stickHeading', () => {
  it('is undefined while the stick rests', () => {
    expect(stickHeading(1, 0.1, -0.2)).toBeUndefined();
  });
  it('drives where you look when pushed forward', () => {
    close(stickHeading(0.5, 0, -1) as number, 0.5);
  });
  it('drives to your right when pushed right (a smaller heading)', () => {
    close(stickHeading(0, 1, 0) as number, -Math.PI / 2);
    close(stickHeading(0, -1, 0) as number, Math.PI / 2);
  });
  it('drives behind you when pulled back', () => {
    close(Math.abs(stickHeading(0, 0, 1) as number), Math.PI);
  });
});

describe('turnToward', () => {
  it('turns the short way round, capped', () => {
    close(turnToward(0, 1, 0.25), 0.25);
    close(turnToward(0, -1, 0.25), -0.25);
    close(turnToward(0, 0.1, 0.25), 0.1);
    // from just left of behind to just right of behind: across π, not back through 0
    close(turnToward(3, -3, 0.5), 3 + (2 * Math.PI - 6));
  });
});

describe('rigToStrip', () => {
  it('maps a step straight ahead in the play space onto the view heading', () => {
    // the play space looks along its -z
    for (const view of [0, 0.7, Math.PI / 2, -2]) {
      const m = rigToStrip(view, 0, -1);
      close(m.x, Math.sin(view));
      close(m.z, Math.cos(view));
    }
  });
  it('maps a step to the right (+x) onto the view turned right', () => {
    const m = rigToStrip(0, 1, 0);
    // heading 0 faces +z; its right is -x
    close(m.x, -1);
    close(m.z, 0);
  });
});

describe('rigScale', () => {
  it('puts the eyes at the robot eye height', () => {
    close(rigScale(3, 1.5), 2);
    close(rigScale(3, 1.0), 3);
  });
  it('stays in range', () => {
    expect(rigScale(3, 0.31)).toBe(RIG_SCALE_MAX);
    expect(rigScale(0.5, 2)).toBe(RIG_SCALE_MIN);
  });
  it('assumes a standing player before the headset is on', () => {
    close(rigScale(3, 0), 2);
    close(rigScale(3, Number.NaN), 2);
  });
});

describe('snapTurn', () => {
  it('snaps once per push, right turns the view right (a smaller heading)', () => {
    let s = snapTurn(0, 0.9, true);
    close(s.view, -SNAP_TURN);
    expect(s.armed).toBe(false);
    s = snapTurn(s.view, 0.95, s.armed);
    close(s.view, -SNAP_TURN);
    s = snapTurn(s.view, 0.1, s.armed);
    expect(s.armed).toBe(true);
    s = snapTurn(s.view, -0.9, s.armed);
    close(s.view, 0);
  });
  it('ignores a half push', () => {
    const s = snapTurn(0, 0.5, true);
    expect(s).toEqual({ view: 0, armed: true });
  });
});
