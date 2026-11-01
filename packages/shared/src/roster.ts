// The station roster: the robots players pick from when they come aboard. There are no accounts. A robot is a name, a
// build (its parts and their paint, content/robot-parts.ts), and an optional 4-digit PIN if siblings start spending
// each other's crystals (plan D8).

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

export const ROBOT_NAME_MAX = 16;

/** The roster holds at most this many robots, so a stuck key can't fill the database. The owner can remove robots. */
export const ROSTER_MAX = 60;

/** Wrong PINs allowed in a row before that robot is locked for `PIN_LOCK_SECONDS`. */
export const PIN_TRIES = 5;
export const PIN_LOCK_SECONDS = 60;

/** Tidies a typed name (trims, collapses spaces). Returns undefined if it isn't a usable robot name. */
export function cleanRobotName(raw: string): string | undefined {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || [...name].length > ROBOT_NAME_MAX) return undefined;
  // Letters and digits in any script, plus a few joiners. No emoji or symbols, so names stay readable on signs.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u.test(name)) return undefined;
  return name;
}

export function isRobotColor(hex: string): boolean {
  return ROBOT_COLORS.some((c) => c.hex === hex);
}

export function isPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
