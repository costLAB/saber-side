import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStation, MIGRATIONS, migrate, openDatabase, schemaVersion } from './db.ts';

const dirs: string[] = [];
function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'saber-db-'));
  dirs.push(dir);
  return join(dir, 'nested', 'station.db');
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('station database', () => {
  it('creates the file, its folder, and the station on first open', () => {
    const db = openDatabase(tempDb());
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(loadStation(db).name).toBe('Ring Seven');
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    db.close();
  });

  it('keeps the same station when reopened', () => {
    const path = tempDb();
    const first = openDatabase(path);
    const before = loadStation(first);
    first.close();
    const again = openDatabase(path);
    expect(loadStation(again)).toEqual(before);
    expect(again.prepare('SELECT count(*) AS n FROM station').get()).toEqual({ n: 1 });
    again.close();
  });

  it('refuses a database migrated by a newer server', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer|only knows/);
  });

  it('rolls a failed migration back completely', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, ['CREATE TABLE a (x)']);
    expect(() => migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (x); INSERT INTO nope VALUES (1)'])).toThrow();
    expect(schemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
  });
});
