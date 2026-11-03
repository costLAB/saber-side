import {
  classicBuild,
  REPAIRS_RECLAIM_HOURS,
  rentPerHour,
  SETTLE_SECONDS,
  spotById,
  tricklePerHour,
} from '@saber-side/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { Ledger, playerAccount, SYSTEM } from './ledger.ts';
import { Players } from './players.ts';
import { Shops } from './shops.ts';

function station() {
  let now = Date.parse('2026-11-02T12:00:00Z');
  const db = openDatabase(':memory:');
  const players = new Players(db);
  const ledger = new Ledger(db);
  const shops = new Shops(db, ledger, () => now);
  const player = (name: string) => {
    const made = players.register(name, '1234', classicBuild());
    if (!made.ok) throw new Error(made.error);
    return made.value.player.id;
  };
  return { db, players, ledger, shops, player, tick: (seconds: number) => (now += seconds * 1000) };
}

const p1 = spotById('plaza-1');
const p4 = spotById('plaza-4');
if (!p1 || !p4) throw new Error('spots missing');

describe('leasing a spot', () => {
  it('opens a free first shop on a vacant spot', () => {
    const { shops, ledger, player } = station();
    const mia = player('Mia');
    const result = shops.lease(mia, 'plaza-1', "  Mia's  Carrots ");
    expect(result).toMatchObject({
      ok: true,
      value: { ownerId: mia, spotId: 'plaza-1', name: "Mia's Carrots", status: 'open' },
    });
    expect(shops.ofPlayer(mia)?.spotId).toBe('plaza-1');
    expect(ledger.balance(playerAccount(mia))).toBe(0); // free: nothing to pay
  });

  it('allows one shop each, one shop a spot, and names that read', () => {
    const { shops, player } = station();
    const mia = player('Mia');
    const zed = player('Zed');
    shops.lease(mia, 'plaza-1', 'Carrots');
    expect(shops.lease(mia, 'plaza-2', 'More')).toMatchObject({ ok: false, status: 409 });
    expect(shops.lease(zed, 'plaza-1', 'Mine')).toMatchObject({ ok: false, status: 409 });
    expect(shops.lease(zed, 'nowhere', 'Mine')).toMatchObject({ ok: false, status: 404 });
    expect(shops.lease(zed, 'plaza-2', '')).toMatchObject({ ok: false, status: 400 });
    expect(shops.lease(zed, 'plaza-2', 'Zed Stuff')).toMatchObject({ ok: true });
  });

  it('keeps the spots table in step with the content', () => {
    const { db } = station();
    expect(db.prepare('SELECT spot_id, size FROM spots ORDER BY spot_id').all()).toEqual([
      { spot_id: 'plaza-1', size: 'S' },
      { spot_id: 'plaza-2', size: 'M' },
      { spot_id: 'plaza-3', size: 'M' },
      { spot_id: 'plaza-4', size: 'L' },
    ]);
  });
});

describe('settling', () => {
  it('pays the trickle and takes the rent for the time a shop was open, to the shard', () => {
    const { shops, ledger, player } = station();
    const mia = player('Mia');
    const shop = shops.lease(mia, 'plaza-4', 'Big Carrots');
    if (!shop.ok) throw new Error(shop.error);
    // An hour open, in twelve settlements.
    for (let i = 0; i < 12; i++) {
      shops.accrue([shop.value.id], SETTLE_SECONDS);
      const settled = shops.settle();
      expect(settled.paid.has(mia)).toBe(true);
    }
    const earned = Math.round(tricklePerHour(p4));
    const rent = Math.round(rentPerHour(p4));
    expect(ledger.balance(playerAccount(mia))).toBe(earned - rent);
    expect(ledger.balance(SYSTEM.windowShoppers)).toBe(-earned);
    expect(ledger.balance(SYSTEM.rent)).toBe(rent);
    expect(ledger.total()).toBe(0);
  });

  it('only counts time the shop was open', () => {
    const { shops, ledger, player } = station();
    const mia = player('Mia');
    shops.lease(mia, 'plaza-1', 'Carrots');
    expect(shops.settle().paid.size).toBe(0);
    expect(ledger.balance(playerAccount(mia))).toBe(0);
  });

  it('closes a shop that cannot pay its rent, until the rent is paid', () => {
    const { shops, ledger, player } = station();
    const mia = player('Mia');
    const shop = shops.lease(mia, 'plaza-1', 'Carrots');
    if (!shop.ok) throw new Error(shop.error);
    const settled = closeWithoutTrickle(shops, ledger, mia, shop.value.id);
    expect(settled.changed).toBe(true);
    const closed = shops.get(shop.value.id);
    expect(closed).toMatchObject({ status: 'repairs', owed: Math.floor(rentPerHour(p1)) });
    const owed = closed?.owed ?? 0;

    // Closed: no sales, no rent.
    shops.accrue([shop.value.id], 3600);
    expect(shops.settle().paid.size).toBe(0);
    expect(shops.get(shop.value.id)?.owed).toBe(owed);

    // Paying reopens it, once there's enough.
    expect(shops.payRent(mia)).toMatchObject({ ok: false, status: 409 });
    ledger.grant(mia, owed);
    expect(shops.payRent(mia)).toMatchObject({ ok: true, value: { status: 'open', owed: 0 } });
    expect(ledger.balance(playerAccount(mia))).toBe(0);
    expect(ledger.balance(SYSTEM.rent)).toBe(owed);
    expect(shops.payRent(mia)).toMatchObject({ ok: false, status: 409 });
  });

  it('gives a spot back after it has been closed for repairs, unpaid, for too long', () => {
    const { shops, ledger, player, tick } = station();
    const mia = player('Mia');
    const shop = shops.lease(mia, 'plaza-1', 'Carrots');
    if (!shop.ok) throw new Error(shop.error);
    closeWithoutTrickle(shops, ledger, mia, shop.value.id);
    tick(REPAIRS_RECLAIM_HOURS * 3600 - 60);
    expect(shops.settle().changed).toBe(false);
    tick(120);
    expect(shops.settle().changed).toBe(true);
    expect(shops.get(shop.value.id)).toBeUndefined();
    expect(shops.lease(player('Zed'), 'plaza-1', 'Mine')).toMatchObject({ ok: true });
  });

  it('goes when its owner is removed', () => {
    const { shops, players, player } = station();
    const mia = player('Mia');
    shops.lease(mia, 'plaza-1', 'Carrots');
    players.removePlayer(mia);
    expect(shops.list()).toEqual([]);
  });
});

/**
 * Closes a shop for repairs. A first shop's trickle always beats its rent, so this holds the trickle back for one
 * settlement (as an extra shop's smaller trickle might fall short), and a player with nothing can't pay.
 */
function closeWithoutTrickle(shops: Shops, ledger: Ledger, playerId: string, shopId: string) {
  expect(ledger.balance(playerAccount(playerId))).toBe(0);
  shops.accrue([shopId], 3600);
  const spy = ledger.transfer.bind(ledger);
  ledger.transfer = (t) => (t.from === SYSTEM.windowShoppers ? { ok: true, value: undefined as never } : spy(t));
  try {
    return shops.settle();
  } finally {
    ledger.transfer = spy;
  }
}
