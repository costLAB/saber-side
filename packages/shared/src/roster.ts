// Players and their robots (initiative: docs/initiatives/players-and-robots.md). There are no accounts: a registered
// player is a unique username and a 4-digit PIN, and owns their robots. A guest is just a robot held by the station
// while its page is open, with an auto-generated name like "Bot 7". A robot is a name and a build (its parts and their
// paint, content/robot-parts.ts).

/**
 * Paint colors a robot's parts can have. They tint the parts' off-white skin, so they're light enough to read as a
 * color. The first, white, tints nothing: the part keeps its original skin.
 */
export const ROBOT_COLORS = [
  { name: 'Original', hex: '#ffffff' },
  { name: 'Rust', hex: '#e8935a' },
  { name: 'Lemon', hex: '#f3df72' },
  { name: 'Lime', hex: '#b5e06a' },
  { name: 'Mint', hex: '#93dfb1' },
  { name: 'Sky', hex: '#8fc4f2' },
  { name: 'Ocean', hex: '#5d97d8' },
  { name: 'Grape', hex: '#b39cf2' },
  { name: 'Bubblegum', hex: '#f4a2c8' },
  { name: 'Charcoal', hex: '#8b8580' },
] as const;

/** The longest a username or robot name can be. */
export const ROBOT_NAME_MAX = 16;

/** At most this many registered players, so a stuck key can't fill the database. The owner can remove players. */
export const PLAYERS_MAX = 60;

/** How many robots one registered player can keep. */
export const ROBOTS_PER_PLAYER = 5;

/**
 * Wrong PINs allowed in a row before that username is locked. Each lock lasts longer than the last (the final one
 * repeats), and a right PIN starts over. With a flat minute, all 10,000 PINs would take about a day and a half to try.
 */
export const PIN_TRIES = 5;
export const PIN_LOCK_SECONDS = [60, 5 * 60, 30 * 60] as const;

/** How long a lock lasts after this many locks in a row (0 for the first). */
export function pinLockSeconds(locks: number): number {
  return PIN_LOCK_SECONDS[Math.min(locks, PIN_LOCK_SECONDS.length - 1)] as number;
}

/** Tidies a typed name (trims, collapses spaces). Returns undefined if it isn't a usable name. */
export function cleanRobotName(raw: string): string | undefined {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || [...name].length > ROBOT_NAME_MAX) return undefined;
  // Letters and digits in any script, plus a few joiners. No emoji or symbols, so names stay readable on signs.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u.test(name)) return undefined;
  return name;
}

/** What guests are called: `Bot <n>`, the lowest number free among the guests aboard. */
export function guestName(n: number): string {
  return `Bot ${n}`;
}

/**
 * Guest names are reserved: no registered player or robot can be called `Bot <n>` (in any case or spacing), so a
 * guest can never look like a registered kid.
 */
export function isGuestName(name: string): boolean {
  return /^bot ?\d+$/i.test(name.normalize('NFC').trim().replace(/\s+/g, ' '));
}

/** The lowest guest number not in use, given the names of everyone aboard. */
export function nextGuestNumber(names: Iterable<string>): number {
  const taken = new Set<number>();
  for (const name of names) {
    const m = /^Bot (\d+)$/.exec(name);
    if (m) taken.add(Number(m[1]));
  }
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

export function isRobotColor(hex: string): boolean {
  return ROBOT_COLORS.some((c) => c.hex === hex);
}

export function isPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
