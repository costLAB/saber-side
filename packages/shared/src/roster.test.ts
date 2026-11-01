import { describe, expect, it } from 'vitest';
import {
  cleanRobotName,
  guestName,
  isGuestName,
  isPin,
  isRobotColor,
  nextGuestNumber,
  PIN_LOCK_SECONDS,
  pinLockSeconds,
  ROBOT_COLORS,
  ROBOTS_PER_PLAYER,
  robotPrice,
} from './roster.ts';

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

describe('guest names', () => {
  it('reserves Bot <n> in any case or spacing', () => {
    for (const name of ['Bot 7', 'bot 7', 'BOT7', ' Bot  12 ']) expect(isGuestName(name)).toBe(true);
    for (const name of ['Bot', 'Botany', 'Bot 7a', 'Robot 7', 'Bo 7']) expect(isGuestName(name)).toBe(false);
    expect(isGuestName(guestName(3))).toBe(true);
  });

  it('picks the lowest number free among the names aboard', () => {
    expect(nextGuestNumber([])).toBe(1);
    expect(nextGuestNumber(['Zed', 'Bot 1', 'Bot 3'])).toBe(2);
    expect(nextGuestNumber(['Bot 2', 'Bot 1'])).toBe(3);
  });
});

describe('PIN lockouts', () => {
  it('grow with each lock, then stay at the longest', () => {
    expect([0, 1, 2, 3, 9].map(pinLockSeconds)).toEqual([60, 300, 1800, 1800, 1800]);
    expect(pinLockSeconds(0)).toBe(PIN_LOCK_SECONDS[0]);
  });
});

describe('robot prices', () => {
  it('makes the first robot free, and each extra one 10 CC more, up to the cap', () => {
    expect([0, 1, 2, 3, 4].map(robotPrice)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(robotPrice(ROBOTS_PER_PLAYER)).toBeUndefined();
    expect(ROBOTS_PER_PLAYER).toBe(5);
  });
});
