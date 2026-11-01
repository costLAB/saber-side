// Cyber Crystals (plan section 3, "Currency"). The ledger counts Cyber Shards, as whole numbers: 100 shards make
// 1 Cyber Crystal ("CC"). The HUD shows a balance as `12 ◆ 45`: 12 CC and 45 shards.

export const SHARDS_PER_CC = 100;

/** A shard amount as whole crystals and the shards left over. */
export function splitShards(shards: number): { cc: number; shards: number } {
  const whole = Math.trunc(shards / SHARDS_PER_CC);
  return { cc: whole, shards: Math.abs(shards - whole * SHARDS_PER_CC) };
}

/** How the HUD shows a balance: `12 ◆ 45` (12 CC, 45 shards), with the shards always two digits. */
export function walletText(shards: number): string {
  const { cc, shards: rest } = splitShards(Math.abs(shards));
  return `${shards < 0 ? '-' : ''}${cc} ◆ ${String(rest).padStart(2, '0')}`;
}

/** Shards for an amount of crystals typed by an owner (say 1.5 CC), or undefined if it isn't a usable amount. */
export function ccToShards(cc: number): number | undefined {
  if (!Number.isFinite(cc)) return undefined;
  const shards = Math.round(cc * SHARDS_PER_CC);
  return Number.isSafeInteger(shards) ? shards : undefined;
}
