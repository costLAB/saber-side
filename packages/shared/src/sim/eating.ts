// Eating a carrot, as a timeline. Each press of use is one bite: the arm brings the carrot up, the jaw swings open,
// and it snaps shut on the carrot (a chomp), with crumbs flying. A carrot takes three bites, and the last one is a
// gulp: after the chomp the jaw stays shut, the head nods, and the body squashes a little as it goes down.
//
// It's pure data (times, and how open the jaw is at each moment), so the client draws it and, later, the server can
// credit a carrot on the gulp (see docs/initiatives/carrot-economy.md). Eating doesn't change any rules yet: the
// carrot on the table is just a snack.

/** Bites to finish a carrot. The last one is the gulp. */
export const BITES_PER_CARROT = 3;

/** How long one bite takes: the arm lifts the carrot to the mouth and lowers it again. */
export const BITE_TIME = 0.5;

/** When the teeth meet, into a bite. The carrot loses a chunk then. */
export const CHOMP_AT = 0.25;

/** How long the last bite takes, swallow and all. */
export const GULP_TIME = 1.0;

/** When the carrot goes down, into the last bite. The server will credit the carrot here once paint cures. */
export const GULP_AT = 0.6;

/** Crumbs that fly off each chomp. */
export const CRUMBS_PER_CHOMP = 12;

/** The jaw is wide open by this time into a bite, and snaps shut over the SNAP_TIME before the chomp. */
const OPEN_BY = 0.12;
const SNAP_TIME = 0.04;
/** After a chomp the jaw chews twice, this far open. */
const CHEW = 0.3;
/** The nod while gulping, in radians (the head pitches down), and when it happens. */
const NOD = 0.14;
const NOD_FROM = 0.35;
const NOD_TO = 0.8;
/** The squash while gulping: the body's height dips by this much as the carrot goes down. */
const SQUASH = 0.1;
const SQUASH_TO = 0.95;

/** One moment of a bite. */
export interface EatingFrame {
  /** How far the arm has brought the carrot up to the mouth, 0 (down) to 1 (at the mouth). */
  arm: number;
  /** How far open the jaw is, 0 (shut) to 1 (wide open). Each head turns this into its own angle. */
  jaw: number;
  /** Extra head pitch, in radians (positive nods down). */
  nod: number;
  /** A factor on the body's height (1 is as it stands). */
  squash: number;
}

/** A robot not eating: arm down, jaw shut. */
export const NOT_EATING: Readonly<EatingFrame> = { arm: 0, jaw: 0, nod: 0, squash: 1 };

/** Whether bite number `bite` (1 for the first) is the gulp. */
export function isGulp(bite: number): boolean {
  return bite >= BITES_PER_CARROT;
}

/** How long bite number `bite` lasts. */
export function biteLength(bite: number): number {
  return isGulp(bite) ? GULP_TIME : BITE_TIME;
}

/** Whether the chomp lands between two moments of a bite (after `t0`, up to and including `t1`). */
export function chompsBetween(t0: number, t1: number): boolean {
  return t0 <= CHOMP_AT && t1 > CHOMP_AT;
}

/** Whether the carrot goes down between two moments of the last bite. */
export function gulpsBetween(bite: number, t0: number, t1: number): boolean {
  return isGulp(bite) && t0 <= GULP_AT && t1 > GULP_AT;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
/** A hump from 0 up to 1 and back, over [from, to]. */
const hump = (t: number, from: number, to: number) =>
  t <= from || t >= to ? 0 : Math.sin(((t - from) / (to - from)) * Math.PI);

/** How open the jaw is, `t` seconds into bite number `bite`. */
export function jawAt(t: number, bite: number): number {
  if (t <= 0 || t >= biteLength(bite)) return 0;
  if (t < OPEN_BY) return ease(t / OPEN_BY);
  if (t < CHOMP_AT - SNAP_TIME) return 1;
  if (t < CHOMP_AT) return (CHOMP_AT - t) / SNAP_TIME;
  if (isGulp(bite)) return 0; // shut tight while it goes down
  // two quick chews
  const u = (t - CHOMP_AT) / (BITE_TIME - CHOMP_AT);
  return CHEW * Math.abs(Math.sin(u * Math.PI * 2));
}

/** The pose of a robot `t` seconds into bite number `bite` (1 for the first). */
export function eatingFrame(t: number, bite: number): EatingFrame {
  if (t <= 0 || t >= biteLength(bite)) return { ...NOT_EATING };
  const gulp = isGulp(bite);
  return {
    arm: hump(t, 0, BITE_TIME),
    jaw: jawAt(t, bite),
    nod: gulp ? NOD * hump(t, NOD_FROM, NOD_TO) : 0,
    squash: gulp ? 1 - SQUASH * hump(t, GULP_AT - 0.1, SQUASH_TO) : 1,
  };
}

/** One crumb off a chomp: its velocity (up is +y) and how long it lasts. */
export interface Crumb {
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/**
 * The crumbs off one chomp. `rand` is the cosmetic stream (a `mulberry`), never Math.random: three.js draws object
 * ids from Math.random, so crumbs sharing it would shift whenever the scene gains or loses an object.
 */
export function crumbs(rand: () => number, n = CRUMBS_PER_CHOMP): Crumb[] {
  const out: Crumb[] = [];
  for (let i = 0; i < n; i++) {
    const vx = (rand() - 0.5) * 3;
    const vy = rand() * 2.5;
    const vz = (rand() - 0.5) * 3;
    out.push({ vx, vy, vz, life: 0.5 + rand() * 0.3 });
  }
  return out;
}
