import { classicBuild, PIN_LOCK_SECONDS, PIN_TRIES, PLAYERS_MAX } from '@saber-side/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { Players } from './players.ts';

function players() {
  let now = 1_000_000;
  const db = openDatabase(':memory:');
  const p = new Players(db, () => now);
  return { p, db, tick: (seconds: number) => (now += seconds * 1000) };
}

function register(p: Players, name = 'Mia', pin = '4321') {
  const made = p.register(name, pin, classicBuild());
  if (!made.ok) throw new Error(made.error);
  return made.value;
}

describe('registering', () => {
  it('saves a player and their first robot, named after them', () => {
    const { p } = players();
    const { player, robot } = register(p);
    expect(player.name).toBe('Mia');
    expect(robot).toMatchObject({ playerId: player.id, name: 'Mia', build: classicBuild() });
    expect(p.robotsOf(player.id)).toEqual([robot]);
  });

  it('stores PINs hashed, never as typed', () => {
    const { p, db } = players();
    register(p);
    const row = db.prepare('SELECT pin_hash FROM players').get() as { pin_hash: string };
    expect(row.pin_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(row.pin_hash).not.toContain('4321');
  });

  it('explains what is wrong', () => {
    const { p } = players();
    register(p, 'Zed');
    const make = (name: string, pin = '1234', build: unknown = classicBuild()) => p.register(name, pin, build);
    expect(make('zed')).toMatchObject({ ok: false, status: 409 });
    expect(make('')).toMatchObject({ ok: false, status: 400 });
    expect(make('Bot 3')).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/guests/) });
    expect(make('Ok', '12')).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/4 digits/) });
    expect(make('Ok', '1234', { ...classicBuild(), mobility: null })).toMatchObject({ ok: false, status: 400 });
  });

  it('caps the number of players', () => {
    const { p } = players();
    for (let i = 0; i < PLAYERS_MAX; i++) register(p, `Kid${i}`);
    expect(p.register('OneMore', '1234', classicBuild())).toMatchObject({ ok: false, status: 409 });
  });
});

describe('logging in', () => {
  it('comes aboard as the robot piloted last', () => {
    const { p } = players();
    const { player, robot } = register(p);
    const result = p.login('mia', '4321');
    expect(result).toEqual({ ok: true, player, robot });
  });

  it('gives a wrong PIN and an unknown name the same answer', () => {
    const { p } = players();
    register(p);
    expect(p.login('Mia', '0000')).toEqual({ ok: false, why: 'wrong' });
    expect(p.login('Nobody', '4321')).toEqual({ ok: false, why: 'wrong' });
  });

  it('locks a name after too many wrong PINs, for longer each time', () => {
    const { p, tick } = players();
    register(p);
    const lockOut = () => {
      for (let i = 1; i < PIN_TRIES; i++) expect(p.login('Mia', '0000').ok).toBe(false);
      expect(p.login('Mia', '0000')).toEqual({ ok: false, why: 'locked' });
    };
    lockOut();
    tick(PIN_LOCK_SECONDS[0] - 1);
    expect(p.login('Mia', '4321')).toEqual({ ok: false, why: 'locked' });
    tick(2);
    lockOut();
    tick(PIN_LOCK_SECONDS[0] + 1);
    expect(p.login('Mia', '4321')).toEqual({ ok: false, why: 'locked' }); // the second lock is longer
    tick(PIN_LOCK_SECONDS[1]);
    expect(p.login('Mia', '4321').ok).toBe(true);
    // A right PIN starts over: the next lock is the short one again.
    lockOut();
    tick(PIN_LOCK_SECONDS[0] + 1);
    expect(p.login('Mia', '4321').ok).toBe(true);
  });

  it('locks unknown names too, so guessing names gives nothing away', () => {
    const { p } = players();
    for (let i = 1; i < PIN_TRIES; i++) p.login('Nobody', '0000');
    expect(p.login('nobody', '0000')).toEqual({ ok: false, why: 'locked' });
  });

  it("doesn't count a missing PIN as a guess", () => {
    const { p } = players();
    register(p);
    for (let i = 0; i < PIN_TRIES * 2; i++) expect(p.login('Mia', undefined)).toEqual({ ok: false, why: 'wrong' });
    expect(p.login('Mia', '4321').ok).toBe(true);
  });

  it('takes the next PIN typed as the new one after an owner resets it', () => {
    const { p } = players();
    const { player } = register(p);
    expect(p.list()[0]?.pinReset).toBe(false);
    p.resetPin(player.id);
    expect(p.list()[0]?.pinReset).toBe(true);
    expect(p.login('Mia', '2468').ok).toBe(true);
    expect(p.list()[0]?.pinReset).toBe(false);
    expect(p.login('Mia', '4321').ok).toBe(false);
    expect(p.login('Mia', '2468').ok).toBe(true);
  });
});

describe('robots', () => {
  it('rebuilds a robot and keeps its new paint', () => {
    const { p } = players();
    const { robot } = register(p);
    const build = { ...classicBuild(), head: { part: 'visor', paint: '#b5e06a' } } as const;
    const result = p.rebuild(robot.id, build);
    expect(result).toMatchObject({ ok: true, value: { build, color: '#b5e06a' } });
    expect(p.robot(robot.id)?.build).toEqual(build);
    expect(p.rebuild(robot.id, { mobility: null })).toMatchObject({ ok: false, status: 400 });
    expect(p.rebuild('nope', build)).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps a player's last robot, and removes everything with the player", () => {
    const { p, db } = players();
    const { player, robot } = register(p);
    expect(p.removeRobot(robot.id)).toMatchObject({ ok: false, status: 409 });
    expect(p.removePlayer(player.id)).toBe(true);
    expect(p.robot(robot.id)).toBeUndefined();
    expect(db.prepare('SELECT count(*) AS n FROM robots').get()).toEqual({ n: 0 });
  });

  it('renames players and robots, but not to a guest name or a taken one', () => {
    const { p } = players();
    const mia = register(p, 'Mia');
    register(p, 'Zed');
    expect(p.renamePlayer(mia.player.id, 'Mimi')).toMatchObject({ ok: true, value: { name: 'Mimi' } });
    expect(p.renamePlayer(mia.player.id, 'zed')).toMatchObject({ ok: false, status: 409 });
    expect(p.renameRobot(mia.robot.id, 'Bot 1')).toMatchObject({ ok: false, status: 400 });
    expect(p.renameRobot(mia.robot.id, 'Zed')).toMatchObject({ ok: false, status: 409 });
    expect(p.renameRobot(mia.robot.id, 'Sparky')).toMatchObject({ ok: true, value: { name: 'Sparky' } });
  });
});
