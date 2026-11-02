// Running a shop (plan section 3, "Shops" and "Real time, no day cycle"; docs/initiatives/carrot-economy.md).
//
// A player's first shop is free to open. While it's open (its owner is aboard, and it isn't closed for repairs),
// window-shoppers pay a small, steady trickle and rent builds up. Both scale with the spot's foot traffic; rent also
// scales with its size. For the first shop the trickle always beats the rent, so a kid starting with nothing earns
// enough for their first stock after a short stretch of play.
//
// Every SETTLE_SECONDS the server posts what built up to the ledger: the trickle first, then the rent. Rent the
// owner can't pay closes the shop "for repairs" (no sales, no rent) until they pay what's owed; after
// REPAIRS_RECLAIM_HOURS unpaid, the spot goes back to vacant. Nothing is ever destroyed.

import type { Spot, SpotSize } from '../content/spots.ts';

/** How much more rent a bigger spot costs than a small one. */
export const SIZE_RENT: Record<SpotSize, number> = { S: 1, M: 1.5, L: 2 };

/** How often what built up is posted to the ledger, in seconds. */
export const SETTLE_SECONDS = 300;

/** Window-shoppers' trickle, in shards an hour, at a spot of ordinary traffic. */
export const TRICKLE_PER_HOUR = 240;

/** Rent, in shards an hour, for a small spot of ordinary traffic (times SIZE_RENT for bigger ones). */
export const RENT_PER_HOUR = 60;

/** How long a shop can stay closed for repairs, unpaid, before its spot goes back to vacant. */
export const REPAIRS_RECLAIM_HOURS = 6;

/** Shops a player can run. One, until opening more costs capex (later in P5). */
export const SHOPS_PER_PLAYER = 1;

/** A shop name's length. */
export const SHOP_NAME_MAX = 20;

export type ShopStatus = 'open' | 'repairs';

/** What window-shoppers pay a first shop at this spot, in shards an hour. */
export function tricklePerHour(spot: Pick<Spot, 'traffic'>): number {
  return TRICKLE_PER_HOUR * spot.traffic;
}

/** The rent at this spot, in shards an hour. */
export function rentPerHour(spot: Pick<Spot, 'traffic' | 'size'>): number {
  return RENT_PER_HOUR * SIZE_RENT[spot.size] * spot.traffic;
}

/**
 * What `seconds` at `perHour` comes to, in whole shards, carrying the fraction over to next time (the ledger only
 * holds whole shards, and nothing should be lost to rounding).
 */
export function accrue(carry: number, perHour: number, seconds: number): { shards: number; carry: number } {
  const total = Math.max(0, carry) + (Math.max(0, perHour) * Math.max(0, seconds)) / 3600;
  const shards = Math.floor(total + 1e-9);
  return { shards, carry: Math.max(0, total - shards) };
}

/** A shop name as typed: trimmed, one space between words, letters, numbers, and a little punctuation. */
export function cleanShopName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > SHOP_NAME_MAX) return undefined;
  return /^[\p{L}\p{N}][\p{L}\p{N} '&.!-]*$/u.test(name) ? name : undefined;
}
