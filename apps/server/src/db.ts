import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cleanSettings, type StationSettings } from '@saber-side/shared';

/**
 * Schema changes, applied in order. `PRAGMA user_version` records how many have run.
 *
 * Never edit or reorder an entry once it has merged: the live station has already run it. Add a new entry instead.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: the station itself, one row (plan section 3, "Data model").
  `CREATE TABLE station (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     name TEXT NOT NULL,
     settings_json TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL
   );
   INSERT INTO station (id, name, created_at) VALUES (1, 'Ring Seven', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,

  // 2: the roster. Names are unique ignoring case, so two kids can't both be "Zed" and "zed".
  `CREATE TABLE players (
     id TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     color TEXT NOT NULL,
     pin_hash TEXT,
     loadout_json TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL
   );
   CREATE UNIQUE INDEX players_name ON players (display_name COLLATE NOCASE);`,

  // 3: robots built from parts (RobotBuild as JSON). NULL is a robot made before the builder: the classic build,
  // painted its color.
  `ALTER TABLE players ADD COLUMN build_json TEXT;`,

  // 4: players own robots (docs/initiatives/players-and-robots.md). The old roster, where each row was a robot, is
  // wiped: an owner decision, since nothing of value was saved on it yet. A player is a username and a PIN (a reset
  // stores 'reset' until they pick a new one). Names are unique ignoring case: player names among players, robot names
  // among robots. Guests aren't saved.
  `DROP TABLE players;
   CREATE TABLE players (
     id TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     pin_hash TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE UNIQUE INDEX players_name ON players (display_name COLLATE NOCASE);
   CREATE TABLE robots (
     id TEXT PRIMARY KEY,
     player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
     display_name TEXT NOT NULL,
     color TEXT NOT NULL,
     build_json TEXT NOT NULL,
     loadout_json TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL,
     piloted_at TEXT
   );
   CREATE UNIQUE INDEX robots_name ON robots (display_name COLLATE NOCASE);
   CREATE INDEX robots_player ON robots (player_id);`,

  // 5: the Cyber Crystal ledger. Every change of money is an entry, never edited or deleted: balances are worked out
  // from it. Amounts are whole shards (100 to a crystal), always positive: the direction is from one account to
  // another. Accounts are `player:<id>` and system accounts (`owner`, `removed`, `bot_maker`, ...).
  `CREATE TABLE ledger (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     from_acct TEXT NOT NULL,
     to_acct TEXT NOT NULL,
     amount_shards INTEGER NOT NULL CHECK (amount_shards > 0),
     reason TEXT NOT NULL,
     ref TEXT
   );
   CREATE INDEX ledger_from ON ledger (from_acct);
   CREATE INDEX ledger_to ON ledger (to_acct);
   CREATE INDEX ledger_ref ON ledger (ref);`,

  // 6: paint that cures (docs/initiatives/carrot-economy.md): how cured a robot's coat is, in percent. Robots made
  // before it start a fresh coat at 10%, like everyone else (an owner decision).
  `ALTER TABLE robots ADD COLUMN paint_cure INTEGER NOT NULL DEFAULT 10 CHECK (paint_cure BETWEEN 0 AND 100);`,

  // 7: shops (plan section 3, "Shops"). Spots are seeded from shared content/spots.ts at boot, so their size and
  // traffic can be tuned there. A spot holds at most one shop. Sign, upgrades, and clerks come later; their columns
  // are here so the plan's data model doesn't need another migration for them. The carries hold the fractions of a
  // shard left over from each settlement, so rounding never loses money.
  `CREATE TABLE spots (
     spot_id TEXT PRIMARY KEY,
     size TEXT NOT NULL CHECK (size IN ('S', 'M', 'L')),
     traffic REAL NOT NULL CHECK (traffic > 0)
   );
   CREATE TABLE shops (
     id TEXT PRIMARY KEY,
     spot_id TEXT NOT NULL UNIQUE REFERENCES spots (spot_id),
     owner_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     sign_json TEXT NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'repairs')),
     upgrades_json TEXT NOT NULL DEFAULT '{}',
     clerk_robot_id TEXT REFERENCES robots (id) ON DELETE SET NULL,
     clerk_until TEXT,
     opened_at TEXT NOT NULL,
     closed_at TEXT,
     rent_owed INTEGER NOT NULL DEFAULT 0 CHECK (rent_owed >= 0),
     trickle_carry REAL NOT NULL DEFAULT 0,
     rent_carry REAL NOT NULL DEFAULT 0
   );
   CREATE INDEX shops_owner ON shops (owner_id);`,
];

/** Opens (creating if needed) the station database and brings its schema up to date. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // WAL lets reads run alongside a write, and it's what Litestream replicates. FULL sync means a write the server has
  // acknowledged survives a crash or power cut: these are the kids' crystals.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/** Runs every migration the database hasn't seen yet, each in its own transaction. */
export function migrate(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS) {
  const done = schemaVersion(db);
  if (done > migrations.length) {
    // An older server is starting on data a newer one already migrated (a rolled-back deploy). Stop rather than
    // misread it; deploy the newer server again instead.
    throw new Error(`The database is at schema version ${done}, but this server only knows ${migrations.length}.`);
  }
  for (let v = done; v < migrations.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migrations[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

export interface StationRecord {
  name: string;
  createdAt: string;
}

/** The station's settings (`settings_json`), with defaults for anything missing. */
export function loadSettings(db: DatabaseSync): StationSettings {
  const row = db.prepare('SELECT settings_json FROM station WHERE id = 1').get() as
    | { settings_json: string }
    | undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(row?.settings_json ?? '{}');
  } catch {
    raw = undefined;
  }
  return cleanSettings(raw);
}

/** Saves the station's settings, keeping any keys this server doesn't know (a newer one may have written them). */
export function saveSettings(db: DatabaseSync, settings: StationSettings) {
  const row = db.prepare('SELECT settings_json FROM station WHERE id = 1').get() as
    | { settings_json: string }
    | undefined;
  let kept: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row?.settings_json ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) kept = parsed;
  } catch {
    kept = {};
  }
  db.prepare('UPDATE station SET settings_json = ? WHERE id = 1').run(JSON.stringify({ ...kept, ...settings }));
}

export function loadStation(db: DatabaseSync): StationRecord {
  const row = db.prepare('SELECT name, created_at FROM station WHERE id = 1').get() as
    | { name: string; created_at: string }
    | undefined;
  if (!row) throw new Error('The station row is missing from the database.');
  return { name: row.name, createdAt: row.created_at };
}
