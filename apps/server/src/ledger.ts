import type { DatabaseSync } from 'node:sqlite';
import type { LedgerEntry } from '@saber-side/shared';
import type { Outcome } from './players.ts';

// The Cyber Crystal ledger (plan section 3, "Currency"). Every change of money is an entry from one account to
// another, and balances are sums of entries, so money can't be duplicated or lost. Player accounts can't go below
// zero. System accounts are where money comes from and goes to, so their balances are the negative of everything
// they've put in: across every account, the balances always sum to zero.

/** A player's account. */
export const playerAccount = (playerId: string) => `player:${playerId}`;

/** System accounts: sources and sinks of money. */
export const SYSTEM = {
  /** Grants from (and removals to) the owner panel. */
  owner: 'owner',
  /** A removed player's balance, posted here first so the books still balance. */
  removed: 'removed',
  /** What players pay the Bot Maker for extra robots. */
  botMaker: 'bot_maker',
  /** Window-shoppers: the small, steady trickle an open shop earns. */
  windowShoppers: 'window_shoppers',
  /** Shop rent. */
  rent: 'rent',
} as const;

export interface Transfer {
  from: string;
  to: string;
  shards: number;
  reason: string;
  ref?: string;
}

interface EntryRow {
  id: number;
  ts: string;
  from_acct: string;
  to_acct: string;
  amount_shards: number;
  reason: string;
  ref: string | null;
  reversed: number;
}

const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;
const isPlayer = (account: string) => account.startsWith('player:');

export class Ledger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  balance(account: string): number {
    const row = this.#db
      .prepare(
        `SELECT coalesce((SELECT sum(amount_shards) FROM ledger WHERE to_acct = ?), 0)
              - coalesce((SELECT sum(amount_shards) FROM ledger WHERE from_acct = ?), 0) AS shards`,
      )
      .get(account, account) as { shards: number };
    return row.shards;
  }

  /**
   * Moves money. A player's account never goes below zero: a transfer it can't afford is refused whole. Run inside
   * `atomically` along with whatever the money pays for, so neither happens without the other.
   */
  transfer(t: Transfer): Outcome<LedgerEntry> {
    if (!Number.isSafeInteger(t.shards) || t.shards <= 0) return fail(400, 'An amount is a whole number of shards.');
    if (t.from === t.to) return fail(400, 'Money has to move between two accounts.');
    if (isPlayer(t.from) && this.balance(t.from) < t.shards) return fail(409, "There aren't enough crystals for that.");
    const id = this.#db
      .prepare(
        `INSERT INTO ledger (ts, from_acct, to_acct, amount_shards, reason, ref)
         VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?, ?, ?)`,
      )
      .run(t.from, t.to, t.shards, t.reason, t.ref ?? null).lastInsertRowid;
    return { ok: true, value: this.entry(Number(id)) as LedgerEntry };
  }

  /** Runs `work` in one transaction: a refused outcome (or a throw) rolls back everything it wrote. */
  atomically<T>(work: () => Outcome<T>): Outcome<T> {
    this.#db.exec('BEGIN IMMEDIATE');
    let result: Outcome<T>;
    try {
      result = work();
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
    this.#db.exec(result.ok ? 'COMMIT' : 'ROLLBACK');
    return result;
  }

  /** The owner gives a player crystals (positive) or takes them away (negative), never below zero. */
  grant(playerId: string, shards: number, reason = 'grant'): Outcome<LedgerEntry> {
    if (!Number.isSafeInteger(shards) || shards === 0) return fail(400, 'Grant a whole number of shards, not zero.');
    const player = playerAccount(playerId);
    return shards > 0
      ? this.transfer({ from: SYSTEM.owner, to: player, shards, reason })
      : this.transfer({ from: player, to: SYSTEM.owner, shards: -shards, reason });
  }

  /** Undoes an entry with an equal and opposite one. An entry is reversed at most once, and never a reversal. */
  reverse(id: number): Outcome<LedgerEntry> {
    return this.atomically(() => {
      const entry = this.entry(id);
      if (!entry) return fail(404, 'No such ledger entry.');
      if (entry.reversed) return fail(409, 'That entry was reversed already.');
      if (entry.reason === 'reversal') return fail(409, "A reversal can't be reversed. Make a grant instead.");
      return this.transfer({
        from: entry.to,
        to: entry.from,
        shards: entry.shards,
        reason: 'reversal',
        ref: String(id),
      });
    });
  }

  /** Before a player is removed: their balance goes to the `removed` account, so the books still balance. */
  close(playerId: string) {
    const account = playerAccount(playerId);
    const shards = this.balance(account);
    if (shards > 0) this.transfer({ from: account, to: SYSTEM.removed, shards, reason: 'removed' });
  }

  entry(id: number): LedgerEntry | undefined {
    const row = this.#db.prepare(`${SELECT} WHERE l.id = ?`).get(id) as EntryRow | undefined;
    return row && toEntry(row);
  }

  /** An account's entries, newest first. */
  entries(account: string, limit = 50): LedgerEntry[] {
    const rows = this.#db
      .prepare(`${SELECT} WHERE l.from_acct = ? OR l.to_acct = ? ORDER BY l.id DESC LIMIT ?`)
      .all(account, account, limit) as unknown as EntryRow[];
    return rows.map(toEntry);
  }

  /** Every account's balance summed: always zero, since every entry takes from one account what it gives another. */
  total(): number {
    const accounts = this.#db.prepare('SELECT from_acct AS a FROM ledger UNION SELECT to_acct FROM ledger').all() as {
      a: string;
    }[];
    return accounts.reduce((sum, { a }) => sum + this.balance(a), 0);
  }
}

const SELECT = `SELECT l.id, l.ts, l.from_acct, l.to_acct, l.amount_shards, l.reason, l.ref,
  EXISTS (SELECT 1 FROM ledger r WHERE r.reason = 'reversal' AND r.ref = CAST(l.id AS TEXT)) AS reversed
  FROM ledger l`;

function toEntry(row: EntryRow): LedgerEntry {
  return {
    id: row.id,
    ts: row.ts,
    from: row.from_acct,
    to: row.to_acct,
    shards: row.amount_shards,
    reason: row.reason,
    ref: row.ref,
    reversed: !!row.reversed,
  };
}
