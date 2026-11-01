import { describe, expect, it } from 'vitest';
import { cleanRobotName, isPin, isRobotColor, ROBOT_COLORS } from './roster.ts';

describe('robot names', () => {
  it('tidies spaces', () => {
    expect(cleanRobotName('  Zed   the  Bold ')).toBe('Zed the Bold');
  });

  it('allows letters and digits in any script, and a few joiners', () => {
    for (const name of ['Zed', 'R2-D2', "O'Neil", 'Zoë', 'Łukasz', 'ミク', 'Agent 7', 'j.r_x']) {
      expect(cleanRobotName(name)).toBe(name);
    }
  });

  it('rejects empty, overlong, and symbol-y names', () => {
    for (const name of ['', '   ', 'A'.repeat(17), '-Zed', '🤖', 'Zed!', '<b>Zed</b>']) {
      expect(cleanRobotName(name)).toBeUndefined();
    }
    expect(cleanRobotName('A'.repeat(16))).toBe('A'.repeat(16));
  });
});

describe('robot colors and PINs', () => {
  it('accepts only palette colors', () => {
    expect(ROBOT_COLORS.every((c) => isRobotColor(c.hex))).toBe(true);
    expect(isRobotColor('#123456')).toBe(false);
    expect(new Set(ROBOT_COLORS.map((c) => c.hex)).size).toBe(ROBOT_COLORS.length);
  });

  it('wants exactly four digits', () => {
    expect(isPin('0420')).toBe(true);
    for (const pin of ['', '123', '12345', '12a4', ' 1234']) expect(isPin(pin)).toBe(false);
  });
});
