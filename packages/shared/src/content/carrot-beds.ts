// Carrot beds on the ring farms. The farm strips (x 116 to 161 on each side, all the way round the ring) have carrots
// painted on the soil; these beds are real ones, planted in rows, that a robot can harvest with a spin move
// (sim/harvest.ts). They sit between the parks and the barns (barns stand at |x| 135 to 145), one every BED_EVERY
// round the ring on each side, the first level with the plaza.

import { CIRC, wrapD } from '../ring-space.ts';
import { mulberry } from '../rng.ts';

/** One bed: rows across the ring (x), carrots along each row (z). `x` and `z` are its middle. */
export interface CarrotBed {
  x: number;
  z: number;
  rows: number;
  perRow: number;
}

/** A carrot planted in a bed: where it grows (on the flat strip), and a little turn so the rows don't look stamped. */
export interface PlantedCarrot {
  x: number;
  z: number;
  /** Which way its leaves face, in radians. */
  turn: number;
  /** Its bed, in CARROT_BEDS. */
  bed: number;
}

/** The middle of the beds across the ring (both sides), and how far apart they are round it. */
export const BED_X = 125;
export const BED_EVERY = 140;
/** Spacing between rows (across, x) and between carrots in a row (round, z). */
export const ROW_GAP = 1.6;
export const CARROT_GAP = 0.9;
const ROWS = 7;
const PER_ROW = 16;

function beds(): CarrotBed[] {
  const out: CarrotBed[] = [];
  const count = Math.floor(CIRC / BED_EVERY);
  for (const side of [1, -1]) {
    for (let k = 0; k < count; k++) out.push({ x: side * BED_X, z: wrapD(k * BED_EVERY), rows: ROWS, perRow: PER_ROW });
  }
  return out;
}

export const CARROT_BEDS: readonly CarrotBed[] = beds();

/** How far a bed reaches from its middle, across (x) and round (z). */
export function bedHalfSize(bed: CarrotBed): { x: number; z: number } {
  return { x: ((bed.rows - 1) * ROW_GAP) / 2, z: ((bed.perRow - 1) * CARROT_GAP) / 2 };
}

function plant(): PlantedCarrot[] {
  const R = mulberry(0xca7707);
  const out: PlantedCarrot[] = [];
  CARROT_BEDS.forEach((bed, b) => {
    const half = bedHalfSize(bed);
    for (let r = 0; r < bed.rows; r++) {
      for (let c = 0; c < bed.perRow; c++) {
        out.push({
          x: bed.x - half.x + r * ROW_GAP + (R() - 0.5) * 0.25,
          z: wrapD(bed.z - half.z + c * CARROT_GAP + (R() - 0.5) * 0.2),
          turn: R() * Math.PI * 2,
          bed: b,
        });
      }
    }
  });
  return out;
}

/** Every carrot planted in every bed, in a fixed order (its index names it). */
export const PLANTED: readonly PlantedCarrot[] = plant();

/** The bed under a point on the floor strip (with a step of margin round it), if any. */
export function bedAt(x: number, z: number, margin = 1): number | undefined {
  for (let b = 0; b < CARROT_BEDS.length; b++) {
    const bed = CARROT_BEDS[b] as CarrotBed;
    const half = bedHalfSize(bed);
    if (Math.abs(x - bed.x) <= half.x + margin && Math.abs(wrapD(z - bed.z)) <= half.z + margin) return b;
  }
  return undefined;
}
