import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  accrue,
  cleanShopName,
  type OwnerShop,
  REPAIRS_RECLAIM_HOURS,
  rentPerHour,
  SHOP_NAME_MAX,
  SHOPS_PER_PLAYER,
  type ShopStatus,
  SPOTS,
  spotById,
  tricklePerHour,
} from '@saber-side/shared';
import { type Ledger, playerAccount, SYSTEM } from './ledger.ts';
import type { Outcome } from './players.ts';

// Shops on the station's spots (shared content/spots.ts and sim/shops.ts). The room tells this which shops are open
// (their owners aboard) as time passes; every settlement, what built up is posted to the ledger: window-shoppers'
// trickle first, then rent. Rent an owner can't pay closes the shop for repairs until they pay; left unpaid long
// enough, the spot goes back to vacant.

export interface ShopRecord {
  id: string;
  spotId: string;
  ownerId: string;
  name: string;
  status: ShopStatus;
  /** Rent owed while closed for repairs, in shards. */
  owed: number;
  /** When it closed for repairs (ms since the epoch), if it did. */
  closedAt: number | undefined;
}

interface ShopRow {
  id: string;
  spot_id: string;
  owner_id: string;
  name: string;
  status: ShopStatus;
  rent_owed: number;
  closed_at: string | null;
  trickle_carry: number;
  rent_carry: number;
}

const COLUMNS = 'id, spot_id, owner_id, name, status, rent_owed, closed_at, trickle_carry, rent_carry';
const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;

const record = (row: ShopRow): ShopRecord => ({
  id: row.id,
  spotId: row.spot_id,
  ownerId: row.owner_id,
  name: row.name,
  status: row.status,
  owed: row.rent_owed,
  closedAt: row.closed_at ? Date.parse(row.closed_at) : undefined,
});

export function ownerShop(shop: ShopRecord): OwnerShop {
  return { id: shop.id, spot: shop.spotId, name: shop.name, status: shop.status, owed: shop.owed };
}

/** What a settlement did. */
export interface Settled {
  /** Players whose balance changed. */
  paid: Set<string>;
  /** Whether any shop changed (closed for repairs, or went back to vacant), so the station shows it. */
  changed: boolean;
}

export class Shops {
  readonly #db: DatabaseSync;
  readonly #ledger: Ledger;
  readonly #now: () => number;
  /** Open time built up since the last settlement, by shop, in (economy) seconds. Lost in a restart, by design. */
  readonly #pending = new Map<string, number>();

  constructor(db: DatabaseSync, ledger: Ledger, now: () => number = Date.now) {
    this.#db = db;
    this.#ledger = ledger;
    this.#now = now;
    // The spots are content: keep the table in step with it (a spot never disappears while a shop stands on it).
    const upsert = db.prepare(
      'INSERT INTO spots (spot_id, size, traffic) VALUES (?, ?, ?) ON CONFLICT (spot_id) DO UPDATE SET size = excluded.size, traffic = excluded.traffic',
    );
    for (const s of SPOTS) upsert.run(s.id, s.size, s.traffic);
  }

  list(): ShopRecord[] {
    return (this.#db.prepare(`SELECT ${COLUMNS} FROM shops ORDER BY spot_id`).all() as unknown as ShopRow[]).map(
      record,
    );
  }

  get(id: string): ShopRecord | undefined {
    const row = this.#db.prepare(`SELECT ${COLUMNS} FROM shops WHERE id = ?`).get(id) as ShopRow | undefined;
    return row && record(row);
  }

  ofPlayer(playerId: string): ShopRecord | undefined {
    const row = this.#db
      .prepare(`SELECT ${COLUMNS} FROM shops WHERE owner_id = ? ORDER BY opened_at LIMIT 1`)
      .get(playerId) as ShopRow | undefined;
    return row && record(row);
  }

  /** Opens a player's shop on a vacant spot. The first shop is free; it's the only one a player can run for now. */
  lease(playerId: string, spotId: string, rawName: unknown): Outcome<ShopRecord> {
    const spot = spotById(spotId);
    if (!spot) return fail(404, 'There is no such spot.');
    const name = cleanShopName(rawName);
    if (!name) return fail(400, `Name your shop: 1 to ${SHOP_NAME_MAX} letters, numbers, or spaces.`);
    return this.#ledger.atomically(() => {
      const count = this.#db.prepare('SELECT count(*) AS n FROM shops WHERE owner_id = ?').get(playerId) as {
        n: number;
      };
      if (count.n >= SHOPS_PER_PLAYER) return fail(409, 'You run a shop already. One each, for now.');
      if (this.#db.prepare('SELECT 1 FROM shops WHERE spot_id = ?').get(spotId)) {
        return fail(409, 'Someone just opened a shop here.');
      }
      const id = randomUUID();
      this.#db
        .prepare(
          `INSERT INTO shops (id, spot_id, owner_id, name, opened_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        )
        .run(id, spotId, playerId, name);
      return { ok: true, value: this.get(id) as ShopRecord };
    });
  }

  /** Pays the rent a shop closed for repairs owes, and reopens it. */
  payRent(playerId: string): Outcome<ShopRecord> {
    return this.#ledger.atomically(() => {
      const shop = this.ofPlayer(playerId);
      if (!shop) return fail(404, "You don't run a shop.");
      if (shop.status !== 'repairs') return fail(409, 'Your shop is open already.');
      if (shop.owed > 0) {
        const paid = this.#ledger.transfer({
          from: playerAccount(playerId),
          to: SYSTEM.rent,
          shards: shop.owed,
          reason: 'rent',
          ref: shop.id,
        });
        if (!paid.ok) return fail(409, "You don't have enough crystals to pay the rent yet.");
      }
      this.#db.prepare("UPDATE shops SET status = 'open', rent_owed = 0, closed_at = NULL WHERE id = ?").run(shop.id);
      return { ok: true, value: this.get(shop.id) as ShopRecord };
    });
  }

  /** Gives a spot back (the owner panel, or a shop left unpaid too long). */
  vacate(id: string): ShopRecord | undefined {
    const shop = this.get(id);
    if (!shop) return undefined;
    this.#db.prepare('DELETE FROM shops WHERE id = ?').run(id);
    this.#pending.delete(id);
    return shop;
  }

  /** Notes that these shops were open for `seconds` more (of economy time). Shops closed for repairs don't count. */
  accrue(openShopIds: Iterable<string>, seconds: number) {
    if (seconds <= 0) return;
    for (const id of openShopIds) this.#pending.set(id, (this.#pending.get(id) ?? 0) + seconds);
  }

  /** Posts what built up to the ledger, closes shops that can't pay their rent, and frees spots left unpaid. */
  settle(): Settled {
    const paid = new Set<string>();
    let changed = false;
    for (const [id, seconds] of this.#pending) {
      this.#pending.delete(id);
      const row = this.#db.prepare(`SELECT ${COLUMNS} FROM shops WHERE id = ?`).get(id) as ShopRow | undefined;
      const spot = row && spotById(row.spot_id);
      if (!row || !spot || row.status !== 'open') continue;
      const account = playerAccount(row.owner_id);
      const trickle = accrue(row.trickle_carry, tricklePerHour(spot), seconds);
      const rent = accrue(row.rent_carry, rentPerHour(spot), seconds);
      this.#ledger.atomically(() => {
        if (trickle.shards > 0) {
          this.#ledger.transfer({
            from: SYSTEM.windowShoppers,
            to: account,
            shards: trickle.shards,
            reason: 'window shoppers',
            ref: id,
          });
        }
        let repairs = false;
        if (rent.shards > 0) {
          const result = this.#ledger.transfer({
            from: account,
            to: SYSTEM.rent,
            shards: rent.shards,
            reason: 'rent',
            ref: id,
          });
          repairs = !result.ok;
        }
        if (repairs) {
          this.#db
            .prepare(
              "UPDATE shops SET status = 'repairs', rent_owed = rent_owed + ?, closed_at = ?, trickle_carry = ?, rent_carry = ? WHERE id = ?",
            )
            .run(rent.shards, new Date(this.#now()).toISOString(), trickle.carry, rent.carry, id);
          changed = true;
        } else {
          this.#db
            .prepare('UPDATE shops SET trickle_carry = ?, rent_carry = ? WHERE id = ?')
            .run(trickle.carry, rent.carry, id);
        }
        return { ok: true, value: undefined };
      });
      if (trickle.shards > 0 || rent.shards > 0) paid.add(row.owner_id);
    }
    // Closed for repairs and unpaid for too long: the spot goes back to vacant.
    const cutoff = this.#now() - REPAIRS_RECLAIM_HOURS * 3600_000;
    for (const shop of this.list()) {
      if (shop.status === 'repairs' && shop.closedAt !== undefined && shop.closedAt <= cutoff) {
        this.vacate(shop.id);
        changed = true;
      }
    }
    return { paid, changed };
  }
}
