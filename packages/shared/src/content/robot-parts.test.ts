import { describe, expect, it } from 'vitest';
import { ROBOT_COLORS } from '../roster.ts';
import {
  buildColor,
  classicBuild,
  cleanRobotBuild,
  ORIGINAL_PAINT,
  PART_SLOTS,
  partName,
  ROBOT_PARTS,
  type RobotBuild,
  sameBuild,
} from './robot-parts.ts';

const SKY = '#8fc4f2';
const RUST = '#e8935a';

describe('robot builds', () => {
  it('builds the classic robot from parts, painted the way old robots were', () => {
    expect(classicBuild()).toEqual({
      mobility: { part: 'wheel', paint: ORIGINAL_PAINT },
      body: { part: 'ball', paint: ORIGINAL_PAINT },
      head: { part: 'dome', paint: ORIGINAL_PAINT },
      arms: { part: 'grabber', paint: ORIGINAL_PAINT },
    });
    const sky = classicBuild(SKY);
    expect(sky.body?.paint).toBe(SKY);
    expect(sky.head?.paint).toBe(SKY);
    expect(sky.arms?.paint).toBe(ORIGINAL_PAINT);
  });

  it('only needs a wheel', () => {
    const wheel = { mobility: { part: 'wheel', paint: RUST }, body: null, head: null, arms: null };
    expect(cleanRobotBuild(wheel)).toEqual(wheel);
    // Leaving a slot out is the same as leaving it empty.
    expect(cleanRobotBuild({ mobility: { part: 'wheel', paint: RUST } })).toEqual(wheel);
    expect(cleanRobotBuild({ ...classicBuild(), mobility: null })).toBeUndefined();
    expect(cleanRobotBuild({ body: { part: 'ball', paint: RUST } })).toBeUndefined();
  });

  it('accepts every part in every paint', () => {
    for (const slot of PART_SLOTS) {
      for (const { id } of ROBOT_PARTS[slot]) {
        for (const { hex } of ROBOT_COLORS) {
          const build = { ...classicBuild(), [slot]: { part: id, paint: hex } };
          expect(cleanRobotBuild(build)).toEqual(build);
        }
      }
    }
  });

  it('turns away unknown parts, paints, and junk', () => {
    const bad: unknown[] = [
      undefined,
      null,
      'wheel',
      [],
      { ...classicBuild(), body: { part: 'rocket', paint: RUST } },
      { ...classicBuild(), head: { part: 'ball', paint: RUST } },
      { ...classicBuild(), arms: { part: 'grabber', paint: '#123456' } },
      { ...classicBuild(), arms: { part: 'grabber' } },
      { ...classicBuild(), body: 'ball' },
    ];
    for (const raw of bad) expect(cleanRobotBuild(raw)).toBeUndefined();
  });

  it('drops anything extra', () => {
    const raw = { ...classicBuild(), hat: { part: 'crown', paint: RUST }, body: { part: 'ball', paint: RUST, x: 1 } };
    expect(cleanRobotBuild(raw)).toEqual({ ...classicBuild(), body: { part: 'ball', paint: RUST } });
  });

  it('shows the first painted part on the roster', () => {
    expect(buildColor(classicBuild())).toBe(ORIGINAL_PAINT);
    expect(buildColor(classicBuild(SKY))).toBe(SKY);
    const wheelOnly: RobotBuild = { mobility: { part: 'wheel', paint: RUST }, body: null, head: null, arms: null };
    expect(buildColor(wheelOnly)).toBe(RUST);
    expect(buildColor({ ...classicBuild(), arms: { part: 'noodle', paint: SKY } })).toBe(SKY);
  });

  it('names parts and compares builds', () => {
    expect(partName('mobility', 'wheel')).toBe('Single wheel');
    expect(sameBuild(classicBuild(SKY), classicBuild(SKY))).toBe(true);
    expect(sameBuild(classicBuild(SKY), classicBuild())).toBe(false);
    expect(sameBuild(classicBuild(), { ...classicBuild(), head: null })).toBe(false);
  });
});
