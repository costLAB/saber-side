// Paint that cures (docs/initiatives/carrot-economy.md). A robot's paint is a see-through coat over its original skin.
// A fresh coat starts at 10%, and each carrot eaten adds a point, up to the chosen color at full opacity. There's one
// cure per robot, for every painted part at once; parts left in their original skin don't change.
//
// The server keeps the cure (saved on `robots.paint_cure`, or in the room for a guest). Until carrots can be bought
// (`feature/carrot-farmers`), the station setting `paintCure` is off and every coat is drawn at 100%.

import { ORIGINAL_PAINT, PART_SLOTS, type RobotBuild } from '../content/robot-parts.ts';

/** Where a fresh coat starts, in percent. */
export const FRESH_COAT = 10;

/** Percentage points one carrot adds. */
export const CURE_PER_CARROT = 1;

/** Fully cured: the chosen color at full opacity. */
export const CURE_MAX = 100;

/** A fresh coat: a new robot, or one just repainted. */
export function freshCoat(): number {
  return FRESH_COAT;
}

/** The cure after eating `carrots` carrots. A fully cured robot can still eat; it just stays at 100. */
export function cureAfter(cure: number, carrots: number): number {
  return Math.min(CURE_MAX, Math.max(0, cure) + Math.max(0, Math.floor(carrots)) * CURE_PER_CARROT);
}

/** A cure an owner typed, as a whole percent from 0 to 100, or undefined if it isn't a number. */
export function cleanCure(raw: unknown): number | undefined {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(CURE_MAX, Math.max(0, Math.round(n)));
}

/** How opaque to draw a robot's coat, from 0 to 1. With `paintCure` off, every coat is drawn fully cured. */
export function coatOpacity(cure: number, paintCure: boolean): number {
  if (!paintCure) return 1;
  return Math.min(CURE_MAX, Math.max(0, cure)) / CURE_MAX;
}

/** Whether a robot has any painted part, so its cure means something. */
export function hasPaint(build: RobotBuild): boolean {
  return PART_SLOTS.some((slot) => {
    const paint = build[slot]?.paint;
    return !!paint && paint !== ORIGINAL_PAINT;
  });
}

/**
 * Whether a rebuild put new paint on: a part painted a color it wasn't painted before (a repaint, or a new part in
 * a color). A new coat starts fresh, and with one cure per robot, the whole robot starts again at 10%. Swapping a
 * part but keeping its paint, taking a part off, or going back to the original skin doesn't.
 */
export function repainted(before: RobotBuild, after: RobotBuild): boolean {
  return PART_SLOTS.some((slot) => {
    const paint = after[slot]?.paint;
    return !!paint && paint !== ORIGINAL_PAINT && paint !== before[slot]?.paint;
  });
}

/** The HUD's readout: "Paint 37%". */
export function cureText(cure: number): string {
  return `Paint ${Math.round(cure)}%`;
}

/** Station settings the owner panel can change (kept in `station.settings_json`). */
export interface StationSettings {
  /** Robots' paint cures by eating carrots. Off, every coat is drawn at 100% (until carrots can be bought). */
  paintCure: boolean;
}

export const DEFAULT_SETTINGS: Readonly<StationSettings> = { paintCure: false };

/** Settings read from the database or sent by the owner panel: anything missing or malformed keeps its default. */
export function cleanSettings(raw: unknown, base: StationSettings = DEFAULT_SETTINGS): StationSettings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { paintCure: typeof input.paintCure === 'boolean' ? input.paintCure : base.paintCure };
}
