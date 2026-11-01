import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  buildColor,
  classicBuild,
  cleanRobotBuild,
  cleanRobotName,
  isPin,
  isRobotColor,
  type NewRobot,
  PIN_LOCK_SECONDS,
  PIN_TRIES,
  ROSTER_MAX,
  type RobotBuild,
  type RobotCard,
} from '@saber-side/shared';

interface PlayerRow {
  id: string;
  display_name: string;
  color: string;
  pin_hash: string | null;
  build_json: string | null;
}

const COLUMNS = 'id, display_name, color, pin_hash, build_json';

/** The outcome of a roster change: the robot, or why not (with the HTTP status to send). */
export type RosterResult = { ok: true; robot: RobotCard } | { ok: false; status: number; error: string };

const card = (row: PlayerRow): RobotCard => ({
  id: row.id,
  name: row.display_name,
  color: row.color,
  build: storedBuild(row),
  pin: row.pin_hash !== null,
});

/** A robot's build as stored, or the classic build for robots made before the builder. */
function storedBuild(row: PlayerRow): RobotBuild {
  if (row.build_json === null) return classicBuild(row.color);
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.build_json);
  } catch {
    parsed = undefined;
  }
  return cleanRobotBuild(parsed) ?? classicBuild(row.color);
}

/**
 * A 4-digit PIN only keeps siblings honest, so this doesn't pretend otherwise: it's salted and hashed so the database
 * never holds PINs in the clear, and wrong guesses are rate-limited per robot (see `checkPin`).
 */
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`;
}

function pinMatches(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  return timingSafeEqual(scryptSync(pin, Buffer.from(salt, 'hex'), 32), Buffer.from(hash, 'hex'));
}

export type PinCheck = 'ok' | 'wrong' | 'locked';

/** The roster in the database, plus the in-memory PIN lockouts. */
export class Roster {
  readonly #db: DatabaseSync;
  readonly #misses = new Map<string, { count: number; lockedUntil: number }>();
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  list(): RobotCard[] {
    const rows = this.#db
      .prepare(`SELECT ${COLUMNS} FROM players ORDER BY display_name COLLATE NOCASE`)
      .all() as unknown as PlayerRow[];
    return rows.map(card);
  }

  get(id: string): RobotCard | undefined {
    const row = this.#row(id);
    return row && card(row);
  }

  create(input: Partial<NewRobot>): RosterResult {
    const name = cleanRobotName(String(input.name ?? ''));
    if (!name) return { ok: false, status: 400, error: 'Pick a name of 1 to 16 letters or numbers.' };
    let build: RobotBuild | undefined;
    let color: string;
    if (input.build !== undefined) {
      build = cleanRobotBuild(input.build);
      if (!build) return { ok: false, status: 400, error: 'A robot needs a wheel, and parts and paint from the list.' };
      color = buildColor(build);
    } else {
      color = String(input.color ?? '');
      if (!isRobotColor(color)) return { ok: false, status: 400, error: 'Pick one of the paint colors.' };
    }
    const pin = input.pin === undefined || input.pin === '' ? undefined : String(input.pin);
    if (pin !== undefined && !isPin(pin)) return { ok: false, status: 400, error: 'A PIN is exactly 4 digits.' };
    if (this.#nameTaken(name)) return { ok: false, status: 409, error: `There's already a robot called ${name}.` };
    const count = this.#db.prepare('SELECT count(*) AS n FROM players').get() as { n: number };
    if (count.n >= ROSTER_MAX) return { ok: false, status: 409, error: 'The roster is full. Ask an owner to tidy it.' };

    const id = randomUUID();
    this.#db
      .prepare(
        `INSERT INTO players (id, display_name, color, pin_hash, build_json, created_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      )
      .run(id, name, color, pin ? hashPin(pin) : null, build ? JSON.stringify(build) : null);
    return { ok: true, robot: this.get(id) as RobotCard };
  }

  /** Checks a join's PIN. Robots without a PIN always pass. */
  checkPin(id: string, pin: string | undefined): PinCheck {
    const row = this.#row(id);
    if (!row?.pin_hash) return 'ok';
    const now = this.#now();
    const miss = this.#misses.get(id) ?? { count: 0, lockedUntil: 0 };
    if (miss.lockedUntil > now) return 'locked';
    // No PIN at all isn't a guess (say, a remembered robot whose owner just added one): ask for it, but don't count it.
    if (pin === undefined || pin === '') return 'wrong';
    if (isPin(pin) && pinMatches(pin, row.pin_hash)) {
      this.#misses.delete(id);
      return 'ok';
    }
    miss.count += 1;
    if (miss.count >= PIN_TRIES) {
      miss.count = 0;
      miss.lockedUntil = now + PIN_LOCK_SECONDS * 1000;
    }
    this.#misses.set(id, miss);
    return miss.lockedUntil > now ? 'locked' : 'wrong';
  }

  rename(id: string, rawName: string): RosterResult {
    const name = cleanRobotName(rawName);
    if (!name) return { ok: false, status: 400, error: 'Pick a name of 1 to 16 letters or numbers.' };
    if (!this.#row(id)) return { ok: false, status: 404, error: 'No such robot.' };
    if (this.#nameTaken(name, id)) return { ok: false, status: 409, error: `There's already a robot called ${name}.` };
    this.#db.prepare('UPDATE players SET display_name = ? WHERE id = ?').run(name, id);
    return { ok: true, robot: this.get(id) as RobotCard };
  }

  /** For a forgotten PIN: the robot goes back to needing none. */
  clearPin(id: string): RosterResult {
    if (!this.#row(id)) return { ok: false, status: 404, error: 'No such robot.' };
    this.#db.prepare('UPDATE players SET pin_hash = NULL WHERE id = ?').run(id);
    this.#misses.delete(id);
    return { ok: true, robot: this.get(id) as RobotCard };
  }

  remove(id: string): boolean {
    this.#misses.delete(id);
    return this.#db.prepare('DELETE FROM players WHERE id = ?').run(id).changes > 0;
  }

  #row(id: string): PlayerRow | undefined {
    return this.#db.prepare(`SELECT ${COLUMNS} FROM players WHERE id = ?`).get(id) as PlayerRow | undefined;
  }

  #nameTaken(name: string, except = ''): boolean {
    return !!this.#db
      .prepare('SELECT 1 FROM players WHERE display_name = ? COLLATE NOCASE AND id != ?')
      .get(name, except);
  }
}
