import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { Ledger, playerAccount, SYSTEM } from './ledger.ts';

const mia = playerAccount('mia');
const zed = playerAccount('zed');

function ledger() {
  return new Ledger(openDatabase(':memory:'));
}

describe('the ledger', () => {
  it('starts everyone at zero, and works balances out from entries', () => {
    const l = ledger();
    expect(l.balance(mia)).toBe(0);
    l.grant('mia', 1250);
    l.transfer({ from: mia, to: zed, shards: 250, reason: 'carrots' });
    expect(l.balance(mia)).toBe(1000);
    expect(l.balance(zed)).toBe(250);
    expect(l.balance(SYSTEM.owner)).toBe(-1250);
    expect(l.total()).toBe(0);
  });

  it("never lets a player's balance go below zero", () => {
    const l = ledger();
    l.grant('mia', 100);
    expect(l.transfer({ from: mia, to: zed, shards: 101, reason: 'x' })).toMatchObject({ ok: false, status: 409 });
    expect(l.grant('mia', -101)).toMatchObject({ ok: false, status: 409 });
    expect(l.balance(mia)).toBe(100);
    expect(l.grant('mia', -100).ok).toBe(true);
    expect(l.balance(mia)).toBe(0);
  });

  it('refuses amounts that are not whole, positive shards', () => {
    const l = ledger();
    for (const shards of [0, -5, 1.5, Number.NaN]) {
      expect(l.transfer({ from: SYSTEM.owner, to: mia, shards, reason: 'x' }).ok).toBe(false);
    }
    expect(l.grant('mia', 0).ok).toBe(false);
    expect(l.transfer({ from: mia, to: mia, shards: 1, reason: 'x' }).ok).toBe(false);
  });

  it('reverses an entry once, and not a reversal', () => {
    const l = ledger();
    const grant = l.grant('mia', 500);
    if (!grant.ok) throw new Error(grant.error);
    const back = l.reverse(grant.value.id);
    expect(back).toMatchObject({
      ok: true,
      value: { from: mia, to: SYSTEM.owner, shards: 500, ref: String(grant.value.id) },
    });
    expect(l.balance(mia)).toBe(0);
    expect(l.entry(grant.value.id)?.reversed).toBe(true);
    expect(l.reverse(grant.value.id)).toMatchObject({ ok: false, status: 409 });
    if (back.ok) expect(l.reverse(back.value.id)).toMatchObject({ ok: false, status: 409 });
    expect(l.reverse(999)).toMatchObject({ ok: false, status: 404 });
  });

  it("won't reverse what a player has already spent", () => {
    const l = ledger();
    const grant = l.grant('mia', 500);
    if (!grant.ok) throw new Error(grant.error);
    l.transfer({ from: mia, to: zed, shards: 400, reason: 'x' });
    expect(l.reverse(grant.value.id)).toMatchObject({ ok: false, status: 409 });
    expect(l.balance(mia)).toBe(100);
  });

  it('rolls back everything in a refused transaction', () => {
    const l = ledger();
    l.grant('mia', 100);
    const result = l.atomically(() => {
      l.transfer({ from: mia, to: zed, shards: 60, reason: 'first' });
      return l.transfer({ from: mia, to: zed, shards: 60, reason: 'second' });
    });
    expect(result.ok).toBe(false);
    expect(l.balance(mia)).toBe(100);
    expect(l.balance(zed)).toBe(0);
  });

  it("posts a removed player's balance to the removed account, so the books still balance", () => {
    const l = ledger();
    l.grant('mia', 700);
    l.grant('zed', 300);
    l.close('mia');
    expect(l.balance(mia)).toBe(0);
    expect(l.balance(SYSTEM.removed)).toBe(700);
    expect(l.total()).toBe(0);
    // Money in minus money out equals what players still hold.
    expect(-(l.balance(SYSTEM.owner) + l.balance(SYSTEM.removed))).toBe(l.balance(zed));
  });

  it('lists an account newest first', () => {
    const l = ledger();
    l.grant('mia', 100, 'first');
    l.grant('zed', 100, 'other');
    l.grant('mia', 200, 'second');
    expect(l.entries(mia).map((e) => e.reason)).toEqual(['second', 'first']);
  });
});
