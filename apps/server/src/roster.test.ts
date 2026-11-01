import { PIN_LOCK_SECONDS, PIN_TRIES } from '@saber-side/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { Roster } from './roster.ts';

function roster() {
  let now = 1_000_000;
  const r = new Roster(openDatabase(':memory:'), () => now);
  return { r, tick: (seconds: number) => (now += seconds * 1000) };
}

describe('roster', () => {
  it('stores PINs hashed, never as typed', () => {
    const db = openDatabase(':memory:');
    const made = new Roster(db).create({ name: 'Mia', color: '#ffffff', pin: '4321' });
    expect(made.ok).toBe(true);
    const row = db.prepare('SELECT pin_hash FROM players').get() as { pin_hash: string };
    expect(row.pin_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(row.pin_hash).not.toContain('4321');
  });

  it('unlocks a robot once the lockout is over, with a fresh set of tries', () => {
    const { r, tick } = roster();
    const made = r.create({ name: 'Mia', color: '#ffffff', pin: '4321' });
    if (!made.ok) throw new Error(made.error);
    const id = made.robot.id;
    for (let i = 1; i < PIN_TRIES; i++) expect(r.checkPin(id, '0000')).toBe('wrong');
    expect(r.checkPin(id, '0000')).toBe('locked');
    tick(PIN_LOCK_SECONDS - 1);
    expect(r.checkPin(id, '4321')).toBe('locked');
    tick(2);
    expect(r.checkPin(id, '0000')).toBe('wrong');
    expect(r.checkPin(id, '4321')).toBe('ok');
  });

  it("doesn't count a missing PIN as a guess", () => {
    const { r } = roster();
    const made = r.create({ name: 'Mia', color: '#ffffff', pin: '4321' });
    if (!made.ok) throw new Error(made.error);
    for (let i = 0; i < PIN_TRIES * 2; i++) expect(r.checkPin(made.robot.id, undefined)).toBe('wrong');
    expect(r.checkPin(made.robot.id, '4321')).toBe('ok');
  });

  it('lets robots without a PIN straight in', () => {
    const { r } = roster();
    const made = r.create({ name: 'Zed', color: '#ffffff' });
    if (!made.ok) throw new Error(made.error);
    expect(r.checkPin(made.robot.id, undefined)).toBe('ok');
    expect(r.checkPin(made.robot.id, '9999')).toBe('ok');
  });
});
