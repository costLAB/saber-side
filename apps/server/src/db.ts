import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

export function loadStation(db: DatabaseSync): StationRecord {
  const row = db.prepare('SELECT name, created_at FROM station WHERE id = 1').get() as
    | { name: string; created_at: string }
    | undefined;
  if (!row) throw new Error('The station row is missing from the database.');
  return { name: row.name, createdAt: row.created_at };
}
