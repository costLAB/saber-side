import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  buildColor,
  classicBuild,
  cleanRobotBuild,
  cleanRobotName,
  isGuestName,
  isPin,
  type OwnerPlayer,
  type OwnerRobot,
  PIN_TRIES,
  PLAYERS_MAX,
  pinLockSeconds,
  type RobotBuild,
} from '@saber-side/shared';

// Registered players and their robots (docs/initiatives/players-and-robots.md). Guests never reach this: the room
// holds them in memory.

export interface PlayerRecord {
  id: string;
  name: string;
}

export interface RobotRecord {
  id: string;
  playerId: string;
  name: string;
  color: string;
  build: RobotBuild;
}

/** A change that worked, or why not (with the HTTP status to send). */
export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export type LoginResult =
  | { ok: true; player: PlayerRecord; robot: RobotRecord }
  | { ok: false; why: 'wrong' | 'locked' };

interface PlayerRow {
  id: string;
  display_name: string;
  pin_hash: string;
}

interface RobotRow {
  id: string;
  player_id: string;
  display_name: string;
  color: string;
  build_json: string;
}

/** What `pin_hash` holds after an owner resets a forgotten PIN: the next PIN typed at login becomes the new one. */
const PIN_RESET = 'reset';
const ROBOT_COLUMNS = 'id, player_id, display_name, color, build_json';
/** A login's robot: the one piloted most recently, else the oldest. */
const ROBOT_ORDER = 'ORDER BY piloted_at IS NULL, piloted_at DESC, created_at, rowid';
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const BAD_NAME = 'Pick a name of 1 to 16 letters or numbers.';
const GUEST_NAME = 'Names like "Bot 7" are for guests. Pick another.';

const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;

/**
 * A 4-digit PIN only guards play money among friends, so this doesn't pretend otherwise: it's salted and hashed so the
 * database never holds PINs in the clear, and wrong guesses are rate-limited per username with locks that grow.
 */
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`;
}

/** A hash to check against for unknown usernames, so they take as long to refuse as a wrong PIN does. */
const DECOY = hashPin('0000');

function pinMatches(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  return timingSafeEqual(scryptSync(pin, Buffer.from(salt, 'hex'), 32), Buffer.from(hash, 'hex'));
}

/** Lockouts are kept by username as typed (tidied, ignoring case), whether or not anyone has that name. */
const lockKey = (name: string) => (cleanRobotName(name) ?? name).toLowerCase();

function storedBuild(row: RobotRow): RobotBuild {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.build_json);
  } catch {
    parsed = undefined;
  }
  // Every saved build was checked on the way in; this only guards against a hand-edited database.
  return cleanRobotBuild(parsed) ?? classicBuild(row.color);
}

const robotRecord = (row: RobotRow): RobotRecord => ({
  id: row.id,
  playerId: row.player_id,
  name: row.display_name,
  color: row.color,
  build: storedBuild(row),
});

/** The players and robots in the database, plus the in-memory PIN lockouts. */
export class Players {
  readonly #db: DatabaseSync;
  readonly #misses = new Map<string, { count: number; locks: number; lockedUntil: number }>();
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  player(id: string): PlayerRecord | undefined {
    const row = this.#playerRow(id);
    return row && { id: row.id, name: row.display_name };
  }

  /** A player's id from their username (ignoring case), if there is one. */
  idByName(rawName: string): string | undefined {
    const name = cleanRobotName(rawName);
    const row = name
      ? (this.#db.prepare('SELECT id FROM players WHERE display_name = ? COLLATE NOCASE').get(name) as
          | { id: string }
          | undefined)
      : undefined;
    return row?.id;
  }

  robot(id: string): RobotRecord | undefined {
    const row = this.#db.prepare(`SELECT ${ROBOT_COLUMNS} FROM robots WHERE id = ?`).get(id) as RobotRow | undefined;
    return row && robotRecord(row);
  }

  /** A player's robots, the most recently piloted first. */
  robotsOf(playerId: string): RobotRecord[] {
    const rows = this.#db
      .prepare(`SELECT ${ROBOT_COLUMNS} FROM robots WHERE player_id = ? ${ROBOT_ORDER}`)
      .all(playerId) as unknown as RobotRow[];
    return rows.map(robotRecord);
  }

  /** Every player and their robots, by name, for the owner panel (which adds their balances). */
  list(): Omit<OwnerPlayer, 'shards'>[] {
    const rows = this.#db
      .prepare('SELECT id, display_name, pin_hash FROM players ORDER BY display_name COLLATE NOCASE')
      .all() as unknown as PlayerRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.display_name,
      pinReset: row.pin_hash === PIN_RESET,
      robots: this.robotsOf(row.id).map(ownerRobot),
    }));
  }

  /**
   * Checks a username and PIN. A wrong PIN and an unknown username get the same answer, so names can't be probed.
   * After an owner reset, any 4-digit PIN logs in and becomes the player's new one.
   */
  login(rawName: string, pin: string | undefined): LoginResult {
    const key = lockKey(rawName);
    const now = this.#now();
    const miss = this.#misses.get(key) ?? { count: 0, locks: 0, lockedUntil: 0 };
    if (miss.lockedUntil > now) return { ok: false, why: 'locked' };
    // No PIN at all isn't a guess: ask for it, but don't count it.
    if (pin === undefined || pin === '' || !isPin(pin)) return { ok: false, why: 'wrong' };
    const name = cleanRobotName(rawName);
    const row = name
      ? (this.#db
          .prepare('SELECT id, display_name, pin_hash FROM players WHERE display_name = ? COLLATE NOCASE')
          .get(name) as PlayerRow | undefined)
      : undefined;
    let right: boolean;
    if (row?.pin_hash === PIN_RESET) {
      this.#db.prepare('UPDATE players SET pin_hash = ? WHERE id = ?').run(hashPin(pin), row.id);
      right = true;
    } else right = pinMatches(pin, row?.pin_hash ?? DECOY) && !!row;
    const robot = row && this.robotsOf(row.id)[0];
    if (right && row && robot) {
      this.#misses.delete(key);
      return { ok: true, player: { id: row.id, name: row.display_name }, robot };
    }
    miss.count += 1;
    if (miss.count >= PIN_TRIES) {
      miss.count = 0;
      miss.lockedUntil = now + pinLockSeconds(miss.locks) * 1000;
      miss.locks += 1;
    }
    this.#misses.set(key, miss);
    return { ok: false, why: miss.lockedUntil > now ? 'locked' : 'wrong' };
  }

  /**
   * Saves a new player with a PIN and their first robot, named after them. (The Robot Registry calls this when a
   * guest signs up.)
   */
  register(rawName: string, pin: string, rawBuild: unknown): Outcome<{ player: PlayerRecord; robot: RobotRecord }> {
    const name = cleanRobotName(rawName);
    if (!name) return fail(400, BAD_NAME);
    if (isGuestName(name)) return fail(400, GUEST_NAME);
    if (!isPin(pin)) return fail(400, 'A PIN is exactly 4 digits.');
    const build = cleanRobotBuild(rawBuild);
    if (!build) return fail(400, 'A robot needs a wheel, and parts and paint from the list.');
    if (this.#playerNameTaken(name) || this.#robotNameTaken(name)) return fail(409, `The name ${name} is taken.`);
    const count = this.#db.prepare('SELECT count(*) AS n FROM players').get() as { n: number };
    if (count.n >= PLAYERS_MAX) return fail(409, 'The station is full of players. Ask an owner to tidy it.');

    const player = { id: randomUUID(), name };
    const robotId = randomUUID();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      this.#db
        .prepare(`INSERT INTO players (id, display_name, pin_hash, created_at) VALUES (?, ?, ?, ${NOW_SQL})`)
        .run(player.id, name, hashPin(pin));
      this.#db
        .prepare(
          `INSERT INTO robots (id, player_id, display_name, color, build_json, created_at, piloted_at)
           VALUES (?, ?, ?, ?, ?, ${NOW_SQL}, ${NOW_SQL})`,
        )
        .run(robotId, player.id, name, buildColor(build), JSON.stringify(build));
      this.#db.exec('COMMIT');
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
    return { ok: true, value: { player, robot: this.robot(robotId) as RobotRecord } };
  }

  /** New parts and paint for a saved robot. */
  rebuild(robotId: string, rawBuild: unknown): Outcome<RobotRecord> {
    const build = cleanRobotBuild(rawBuild);
    if (!build) return fail(400, 'A robot needs a wheel, and parts and paint from the list.');
    const changed = this.#db
      .prepare('UPDATE robots SET build_json = ?, color = ? WHERE id = ?')
      .run(JSON.stringify(build), buildColor(build), robotId).changes;
    return changed ? { ok: true, value: this.robot(robotId) as RobotRecord } : fail(404, 'No such robot.');
  }

  /** Notes that a robot was just piloted, so the next login comes aboard as it. */
  piloted(robotId: string) {
    this.#db.prepare(`UPDATE robots SET piloted_at = ${NOW_SQL} WHERE id = ?`).run(robotId);
  }

  renamePlayer(id: string, rawName: string): Outcome<PlayerRecord> {
    const name = cleanRobotName(rawName);
    if (!name) return fail(400, BAD_NAME);
    if (isGuestName(name)) return fail(400, GUEST_NAME);
    if (!this.#playerRow(id)) return fail(404, 'No such player.');
    if (this.#playerNameTaken(name, id)) return fail(409, `There's already a player called ${name}.`);
    this.#db.prepare('UPDATE players SET display_name = ? WHERE id = ?').run(name, id);
    return { ok: true, value: this.player(id) as PlayerRecord };
  }

  renameRobot(id: string, rawName: string): Outcome<RobotRecord> {
    const name = cleanRobotName(rawName);
    if (!name) return fail(400, BAD_NAME);
    if (isGuestName(name)) return fail(400, GUEST_NAME);
    if (!this.robot(id)) return fail(404, 'No such robot.');
    if (this.#robotNameTaken(name, id)) return fail(409, `There's already a robot called ${name}.`);
    this.#db.prepare('UPDATE robots SET display_name = ? WHERE id = ?').run(name, id);
    return { ok: true, value: this.robot(id) as RobotRecord };
  }

  /** For a forgotten PIN: the next PIN the player logs in with becomes their new one. */
  resetPin(id: string): Outcome<PlayerRecord> {
    const row = this.#playerRow(id);
    if (!row) return fail(404, 'No such player.');
    this.#db.prepare('UPDATE players SET pin_hash = ? WHERE id = ?').run(PIN_RESET, id);
    this.#misses.delete(lockKey(row.display_name));
    return { ok: true, value: { id, name: row.display_name } };
  }

  /** Removes a player and every robot they own. */
  removePlayer(id: string): boolean {
    const row = this.#playerRow(id);
    if (row) this.#misses.delete(lockKey(row.display_name));
    return this.#db.prepare('DELETE FROM players WHERE id = ?').run(id).changes > 0;
  }

  /** Removes one robot. A player's last robot stays: remove the player instead. */
  removeRobot(id: string): Outcome<RobotRecord> {
    const robot = this.robot(id);
    if (!robot) return fail(404, 'No such robot.');
    if (this.robotsOf(robot.playerId).length <= 1) {
      return fail(409, `${robot.name} is its player's only robot. Remove the player instead.`);
    }
    this.#db.prepare('DELETE FROM robots WHERE id = ?').run(id);
    return { ok: true, value: robot };
  }

  #playerRow(id: string): PlayerRow | undefined {
    return this.#db.prepare('SELECT id, display_name, pin_hash FROM players WHERE id = ?').get(id) as
      | PlayerRow
      | undefined;
  }

  #playerNameTaken(name: string, except = ''): boolean {
    return !!this.#db
      .prepare('SELECT 1 FROM players WHERE display_name = ? COLLATE NOCASE AND id != ?')
      .get(name, except);
  }

  #robotNameTaken(name: string, except = ''): boolean {
    return !!this.#db
      .prepare('SELECT 1 FROM robots WHERE display_name = ? COLLATE NOCASE AND id != ?')
      .get(name, except);
  }
}

export function ownerRobot(robot: RobotRecord): OwnerRobot {
  return { id: robot.id, name: robot.name, color: robot.color, build: robot.build };
}
